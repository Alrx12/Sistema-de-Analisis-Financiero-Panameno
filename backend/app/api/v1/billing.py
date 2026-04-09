"""
billing.py — Endpoints de dLocal Go para SAFPRO.

Endpoints:
  POST /billing/create-checkout-session → URL del hosted checkout de dLocal Go
  POST /billing/webhook                 → Recibe notificaciones de dLocal Go (sin auth JWT)
  DELETE /billing/cancel                → Cancela la suscripción activa del usuario
  GET  /billing/status                  → Plan actual + fecha de expiración
"""
from __future__ import annotations

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


class BillingStatusResponse(BaseModel):
    plan: str
    subscription_expires_at: str | None   # ISO-8601 o null
    has_active_subscription: bool         # True si dlocalgo_subscription_id no es null


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post(
    "/create-checkout-session",
    response_model=CheckoutResponse,
    summary="Genera la URL de checkout de dLocal Go para suscribirse",
)
def create_checkout_session(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CheckoutResponse:
    """
    Devuelve la URL del hosted checkout de dLocal Go con el external_id del usuario.

    El frontend redirige al usuario a `checkout_url` para completar el pago.
    Tras el pago, dLocal Go notifica a /billing/webhook y el plan se actualiza.

    - `interval` = "monthly"  → Plan Pro $5/mes
    - `interval` = "annual"   → Plan Pro $45/año
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

    try:
        url = billing_service.create_checkout_url(current_user, payload.interval)
    except (RuntimeError, ValueError) as exc:
        logger.error("Error generando checkout URL: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return CheckoutResponse(checkout_url=url)


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
        logger.warning("Webhook con firma inválida — rechazado")
        # Devolvemos 200 igualmente para que dLocal Go no reintente indefinidamente
        # (una firma inválida es un problema de configuración, no de disponibilidad)
        return JSONResponse(
            status_code=200,
            content={"status": "invalid_signature"},
        )

    try:
        import json
        payload = json.loads(body)
    except Exception:
        logger.warning("Webhook con body no-JSON: %s", body[:200])
        return JSONResponse(status_code=200, content={"status": "invalid_payload"})

    try:
        result = billing_service.handle_webhook_event(payload, db)
    except Exception as exc:
        # No propagar errores — dLocal Go reintentaría cada 10 minutos
        logger.exception("Error interno procesando webhook dLocal Go: %s", exc)
        return JSONResponse(status_code=200, content={"status": "error_logged"})

    return JSONResponse(status_code=200, content=result)


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
    Cancela la suscripción activa del usuario en dLocal Go.

    El plan se baja inmediatamente a 'free' en la DB.
    dLocal Go también enviará un webhook de confirmación.

    Lanza 404 si el usuario no tiene suscripción activa.
    Lanza 503 si hay un error al comunicarse con dLocal Go.
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


@router.get(
    "/status",
    response_model=BillingStatusResponse,
    summary="Estado de la suscripción del usuario actual",
)
def billing_status(
    current_user: User = Depends(get_current_user),
) -> BillingStatusResponse:
    """
    Devuelve el plan activo, la fecha de expiración y si tiene suscripción
    activa en dLocal Go.
    """
    expires_str: str | None = None
    if current_user.subscription_expires_at:
        expires_str = current_user.subscription_expires_at.isoformat()

    return BillingStatusResponse(
        plan=current_user.plan,
        subscription_expires_at=expires_str,
        has_active_subscription=bool(current_user.dlocalgo_subscription_id),
    )
