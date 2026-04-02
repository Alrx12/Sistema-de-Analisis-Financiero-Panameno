"""
billing.py — Endpoints de Stripe para SAFPRO.

Endpoints:
  POST /billing/create-checkout-session   → URL de Stripe Checkout
  POST /billing/webhook                   → Recibe eventos de Stripe (sin auth)
  GET  /billing/portal                    → URL del Customer Portal
  GET  /billing/status                    → Plan actual + fecha de expiración
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.models.user import User
from app.services import billing_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    interval: str  # "monthly" | "annual"


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str


class BillingStatusResponse(BaseModel):
    plan: str
    subscription_expires_at: str | None   # ISO-8601 o null
    has_stripe_customer: bool


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post(
    "/create-checkout-session",
    response_model=CheckoutResponse,
    summary="Crea una sesión de Stripe Checkout",
)
def create_checkout_session(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CheckoutResponse:
    """
    Crea una sesión de Stripe Checkout y devuelve la URL de redirección.

    - `interval` = "monthly"  → Plan Pro $5/mes
    - `interval` = "annual"   → Plan Pro $45/año

    El frontend redirige al usuario a `checkout_url` para completar el pago.
    """
    if current_user.plan == "pro":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya tienes el plan Pro activo.",
        )

    if payload.interval == "monthly":
        price_id = settings.stripe_price_id_monthly
    elif payload.interval == "annual":
        price_id = settings.stripe_price_id_annual
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="interval debe ser 'monthly' o 'annual'.",
        )

    if not price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pagos no configurados en este servidor.",
        )

    try:
        url = billing_service.create_checkout_session(current_user, price_id, db)
    except RuntimeError as exc:
        logger.error("Error creando checkout session: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return CheckoutResponse(checkout_url=url)


@router.post(
    "/webhook",
    summary="Webhook de Stripe (sin autenticación JWT)",
    include_in_schema=False,   # no exponer en Swagger
)
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="stripe-signature"),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Recibe eventos de Stripe y los procesa.

    - El body debe leerse como bytes crudos para que la verificación de firma funcione.
    - Este endpoint NO usa autenticación JWT — Stripe llama directamente.
    - Siempre devuelve HTTP 200 para que Stripe no reintente eventos ya procesados.
    """
    body = await request.body()

    if not stripe_signature:
        logger.warning("Webhook recibido sin Stripe-Signature header")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Falta el header Stripe-Signature.",
        )

    try:
        result = billing_service.handle_webhook_event(body, stripe_signature, db)
    except ValueError as exc:
        # Firma inválida
        logger.warning("Webhook firma inválida: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        logger.error("Webhook error de configuración: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        # No propagar errores internos — Stripe reintentaría indefinidamente
        logger.exception("Error interno procesando webhook: %s", exc)
        return JSONResponse(status_code=200, content={"status": "error_logged"})

    return JSONResponse(status_code=200, content=result)


@router.get(
    "/portal",
    response_model=PortalResponse,
    summary="Genera URL del Customer Portal de Stripe",
)
def customer_portal(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PortalResponse:
    """
    Devuelve una URL única y de corta duración del Customer Portal de Stripe
    donde el usuario puede:
    - Ver y cancelar su suscripción
    - Actualizar método de pago
    - Descargar facturas

    Requiere que el usuario tenga ya un `stripe_customer_id` (haber pagado antes).
    """
    try:
        url = billing_service.create_portal_session(current_user, db)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        logger.error("Error creando portal session: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return PortalResponse(portal_url=url)


@router.get(
    "/status",
    response_model=BillingStatusResponse,
    summary="Estado de la suscripción del usuario actual",
)
def billing_status(
    current_user: User = Depends(get_current_user),
) -> BillingStatusResponse:
    """
    Devuelve el plan activo, la fecha de expiración de la suscripción (si aplica)
    y si el usuario tiene ya un Stripe Customer asociado.
    """
    expires_str: str | None = None
    if current_user.subscription_expires_at:
        expires_str = current_user.subscription_expires_at.isoformat()

    return BillingStatusResponse(
        plan=current_user.plan,
        subscription_expires_at=expires_str,
        has_stripe_customer=bool(current_user.stripe_customer_id),
    )
