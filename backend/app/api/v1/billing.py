"""
billing.py — Endpoints de pagos y suscripciones para SAFPRO.

Procesadores soportados (detección automática vía active_processor()):
  Plan A: PayPal Subscriptions  — si PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET están configurados
  Plan B: dLocal Go             — si DLOCALGO_API_KEY + DLOCALGO_SECRET_KEY están configurados

Endpoints:
  POST /billing/create-checkout-session → URL del checkout del procesador activo
  POST /billing/webhook                 → Webhook de dLocal Go (HMAC-SHA256, sin auth JWT)
  POST /billing/paypal/webhook          → Webhook de PayPal (verificación API, sin auth JWT)
  DELETE /billing/cancel                → Cancela la suscripción activa (detecta procesador automáticamente)
  GET  /billing/status                  → Plan actual + fecha de expiración + procesador activo
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services import billing_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    interval: str  # "monthly" | "annual"


class CheckoutResponse(BaseModel):
    checkout_url: str
    processor: str   # "paypal" | "dlocalgo"


class BillingStatusResponse(BaseModel):
    plan: str
    subscription_expires_at: str | None   # ISO-8601 o null
    has_active_subscription: bool         # True si paypal_subscription_id o dlocalgo_subscription_id no son null
    processor: str | None                 # "paypal" | "dlocalgo" | null


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post(
    "/create-checkout-session",
    response_model=CheckoutResponse,
    summary="Genera la URL de checkout del procesador de pagos activo",
)
def create_checkout_session(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CheckoutResponse:
    """
    Devuelve la URL del hosted checkout del procesador activo (PayPal o dLocal Go).

    El frontend redirige al usuario a `checkout_url` para completar el pago.
    Tras el pago, el procesador notifica al webhook correspondiente y el plan se actualiza.

    - `interval` = "monthly"  → Plan Pro mensual
    - `interval` = "annual"   → Plan Pro anual

    También devuelve `processor` para que el frontend sepa qué branding mostrar.
    """
    if current_user.plan == "pro":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya tienes el plan Pro activo.",
        )

    if payload.interval not in ("monthly", "annual"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="interval debe ser 'monthly' o 'annual'.",
        )

    processor = billing_service.active_processor()
    if not processor:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No hay procesador de pagos configurado. Contacta al administrador.",
        )

    try:
        url = billing_service.create_checkout_url(current_user, payload.interval)
    except (RuntimeError, ValueError) as exc:
        logger.error("Error generando checkout URL (%s): %s", processor, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return CheckoutResponse(checkout_url=url, processor=processor)


# ── Webhook dLocal Go ────────────────────────────────────────────────────────

@router.post(
    "/webhook",
    summary="Webhook de dLocal Go (sin autenticación JWT)",
    include_in_schema=False,   # no exponer en Swagger
)
async def dlocalgo_webhook(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Recibe notificaciones de dLocal Go y las procesa.

    dLocal Go envía: POST {"payment_id": "DP-xxx"}
    El handler verifica la firma HMAC-SHA256 y luego hace GET al pago
    para obtener el estado y el external_id del usuario.

    Este endpoint NO usa autenticación JWT — dLocal Go llama directamente.
    Siempre devuelve HTTP 200 para que dLocal Go no reintente.
    """
    body = await request.body()

    # Verificar firma HMAC antes de procesar nada
    if not billing_service.verify_webhook_signature(body, authorization):
        logger.warning("Webhook dLocal Go con firma inválida — rechazado")
        return JSONResponse(
            status_code=200,
            content={"status": "invalid_signature"},
        )

    try:
        payload = json.loads(body)
    except Exception:
        logger.warning("Webhook dLocal Go con body no-JSON: %s", body[:200])
        return JSONResponse(status_code=200, content={"status": "invalid_payload"})

    try:
        result = billing_service.handle_webhook_event(payload, db)
    except Exception as exc:
        # No propagar errores — dLocal Go reintentaría cada 10 minutos
        logger.exception("Error interno procesando webhook dLocal Go: %s", exc)
        return JSONResponse(status_code=200, content={"status": "error_logged"})

    return JSONResponse(status_code=200, content=result)


# ── Webhook PayPal ───────────────────────────────────────────────────────────

@router.post(
    "/paypal/webhook",
    summary="Webhook de PayPal Subscriptions (sin autenticación JWT)",
    include_in_schema=False,   # no exponer en Swagger
)
async def paypal_webhook(
    request: Request,
    paypal_transmission_id: str | None = Header(default=None, alias="paypal-transmission-id"),
    paypal_transmission_time: str | None = Header(default=None, alias="paypal-transmission-time"),
    paypal_cert_url: str | None = Header(default=None, alias="paypal-cert-url"),
    paypal_auth_algo: str | None = Header(default=None, alias="paypal-auth-algo"),
    paypal_transmission_sig: str | None = Header(default=None, alias="paypal-transmission-sig"),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Recibe notificaciones de PayPal Subscriptions y las procesa.

    Eventos manejados:
      - BILLING.SUBSCRIPTION.ACTIVATED  → plan=pro, paypal_subscription_id guardado
      - BILLING.SUBSCRIPTION.CANCELLED  → plan=free, paypal_subscription_id limpiado
      - BILLING.SUBSCRIPTION.SUSPENDED  → igual que CANCELLED
      - PAYMENT.SALE.COMPLETED          → log de pago exitoso (no cambia estado)
      - PAYMENT.SALE.DENIED             → log de pago fallido (notificar)

    PayPal envía headers de verificación de firma (Transmission-ID, Transmission-Sig, etc.).
    La verificación se hace via API de PayPal Notifications.

    Siempre devuelve HTTP 200 para que PayPal no reintente.
    """
    body = await request.body()

    # Reunir headers de verificación de firma
    headers = {
        "paypal-transmission-id": paypal_transmission_id,
        "paypal-transmission-time": paypal_transmission_time,
        "paypal-cert-url": paypal_cert_url,
        "paypal-auth-algo": paypal_auth_algo,
        "paypal-transmission-sig": paypal_transmission_sig,
    }

    # Verificar firma (en sandbox sin webhook_id configurado se omite con warning)
    if not billing_service.verify_paypal_webhook_signature(body, headers):
        logger.warning("Webhook PayPal con firma inválida o no verificable — rechazado")
        return JSONResponse(
            status_code=200,
            content={"status": "invalid_signature"},
        )

    try:
        payload = json.loads(body)
    except Exception:
        logger.warning("Webhook PayPal con body no-JSON: %s", body[:200])
        return JSONResponse(status_code=200, content={"status": "invalid_payload"})

    try:
        result = billing_service.handle_paypal_webhook_event(payload, db)
    except Exception as exc:
        # No propagar errores — PayPal reintentaría
        logger.exception("Error interno procesando webhook PayPal: %s", exc)
        return JSONResponse(status_code=200, content={"status": "error_logged"})

    return JSONResponse(status_code=200, content=result)


# ── Cancel ───────────────────────────────────────────────────────────────────

@router.delete(
    "/cancel",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancela la suscripción Pro activa",
)
def cancel_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Cancela la suscripción activa del usuario.

    Detecta automáticamente el procesador (PayPal o dLocal Go) según qué
    subscription_id tenga guardado el usuario en la DB.

    El plan se baja inmediatamente a 'free' en la DB.
    El procesador también enviará un webhook de confirmación.

    Lanza 404 si el usuario no tiene suscripción activa.
    Lanza 503 si hay un error al comunicarse con el procesador.
    """
    try:
        billing_service.cancel_subscription(current_user, db)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        logger.error("Error cancelando suscripción: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


# ── Status ───────────────────────────────────────────────────────────────────

@router.get(
    "/status",
    response_model=BillingStatusResponse,
    summary="Estado de la suscripción del usuario actual",
)
def billing_status(
    current_user: User = Depends(get_current_user),
) -> BillingStatusResponse:
    """
    Devuelve el plan activo, la fecha de expiración, si tiene suscripción activa,
    y qué procesador está usando.
    """
    expires_str: str | None = None
    if current_user.subscription_expires_at:
        expires_str = current_user.subscription_expires_at.isoformat()

    # Detectar qué procesador tiene activo el usuario según los subscription IDs
    user_processor: str | None = None
    if current_user.paypal_subscription_id:
        user_processor = "paypal"
    elif current_user.dlocalgo_subscription_id:
        user_processor = "dlocalgo"

    has_active = bool(
        current_user.paypal_subscription_id or current_user.dlocalgo_subscription_id
    )

    return BillingStatusResponse(
        plan=current_user.plan,
        subscription_expires_at=expires_str,
        has_active_subscription=has_active,
        processor=user_processor,
    )
