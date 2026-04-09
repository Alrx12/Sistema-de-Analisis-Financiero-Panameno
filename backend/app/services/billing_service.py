"""
billing_service.py — Lógica de negocio para dLocal Go.

Responsabilidades:
  - Construir la URL de checkout de suscripción (subscribe_url + external_id)
  - Verificar la firma HMAC-SHA256 de los webhooks entrantes
  - Obtener el detalle de un pago vía GET /v1/payments/:payment_id
  - Procesar el evento de webhook y actualizar el plan del usuario
  - Cancelar la suscripción activa del usuario

Flujo de suscripción (dLocal Go nativo):
  1. Admin crea planes monthly/anual con setup_dlocalgo_plans.py
     → Guarda DLOCALGO_PLAN_ID_MONTHLY y DLOCALGO_PLAN_ID_ANNUAL en .env
  2. Usuario hace clic en "Suscribirse"
     → Frontend llama POST /billing/create-checkout-session
     → Backend devuelve subscribe_url?external_id={user_id}&email={email}
     → Frontend redirige al usuario al checkout de dLocal Go
  3. Usuario completa el pago en dLocal Go
     → dLocal Go llama POST /billing/webhook con {"payment_id": "DP-xxx"}
     → Backend verifica firma HMAC-SHA256
     → Backend hace GET /v1/payments/{payment_id} para obtener detalles
     → Backend identifica al usuario por external_id
     → Backend actualiza user.plan = "pro" + guarda subscription_id
  4. dLocal Go cobra automáticamente en cada ciclo (mensual/anual)
     → Mismo flujo de webhook por cada renovación
  5. Usuario cancela
     → Frontend llama DELETE /billing/cancel
     → Backend llama DELETE /v1/subscription/plan/{plan_id}/subscription/{sub_id}
     → Webhook confirma cancelación → plan → "free"

Autenticación dLocal Go:
  Authorization: Bearer {api_key}:{secret_key}

Verificación de webhook:
  Header: "V2-HMAC-SHA256, Signature: {hex}"
  Cálculo: HMAC-SHA256(api_key + json_payload, secret_key).hexdigest()
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone
from urllib.parse import quote, urlencode

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
from app.services.analytics_service import track_event

logger = logging.getLogger(__name__)


# ── Helpers de configuración ─────────────────────────────────────────────────

def _require_config() -> None:
    """Lanza RuntimeError si faltan las credenciales de dLocal Go."""
    if not settings.dlocalgo_api_key or not settings.dlocalgo_secret_key:
        raise RuntimeError(
            "DLOCALGO_API_KEY y DLOCALGO_SECRET_KEY no configurados. "
            "Obtén tus keys en merchant.dlocalgo.com → Developers → API Keys "
            "y agrégalos al .env."
        )


def _api_base() -> str:
    """URL base según el entorno (sandbox o live)."""
    if settings.dlocalgo_sandbox:
        return "https://api-sbx.dlocalgo.com"
    return "https://api.dlocalgo.com"


def _headers() -> dict[str, str]:
    """Headers de autenticación para la API de dLocal Go."""
    return {
        "Authorization": f"Bearer {settings.dlocalgo_api_key}:{settings.dlocalgo_secret_key}",
        "Content-Type": "application/json",
    }


# ── Checkout — construir URL de suscripción ──────────────────────────────────

def create_checkout_url(user: User, interval: str) -> str:
    """
    Devuelve la URL del checkout de dLocal Go para que el usuario se suscriba.

    Recupera el subscribe_url del plan almacenado en config y le agrega:
      - external_id = user.user_id  (para identificar al usuario en el webhook)
      - email       = user.email    (pre-rellena el campo en el checkout)

    Args:
        user     : Usuario autenticado que quiere suscribirse.
        interval : "monthly" | "annual"

    Returns:
        URL completa al hosted checkout de dLocal Go.

    Raises:
        RuntimeError : Falta config, o el plan no existe en dLocal Go.
        ValueError   : interval inválido.
    """
    _require_config()

    if interval == "monthly":
        plan_id = settings.dlocalgo_plan_id_monthly
    elif interval == "annual":
        plan_id = settings.dlocalgo_plan_id_annual
    else:
        raise ValueError(f"interval debe ser 'monthly' o 'annual', recibido: {interval!r}")

    if not plan_id:
        raise RuntimeError(
            f"DLOCALGO_PLAN_ID_{interval.upper()} no configurado. "
            "Ejecuta scripts/setup_dlocalgo_plans.py para crear los planes "
            "y agrega los IDs al .env."
        )

    # Obtener el subscribe_url del plan desde la API
    url = f"{_api_base()}/v1/subscription/plan/{plan_id}"
    try:
        resp = httpx.get(url, headers=_headers(), timeout=15.0)
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Error obteniendo plan dLocal Go — plan_id=%s status=%s body=%s",
            plan_id, exc.response.status_code, exc.response.text[:500],
        )
        raise RuntimeError(
            f"No se pudo obtener el plan {plan_id} desde dLocal Go: "
            f"HTTP {exc.response.status_code}"
        ) from exc
    except httpx.RequestError as exc:
        logger.error("Error de red al obtener plan dLocal Go: %s", exc)
        raise RuntimeError(f"Error de conexión con dLocal Go: {exc}") from exc

    plan_data = resp.json()
    subscribe_url: str | None = plan_data.get("subscribe_url")
    if not subscribe_url:
        raise RuntimeError(
            f"El plan {plan_id} no devolvió subscribe_url. "
            f"Respuesta: {plan_data}"
        )

    # Agregar external_id, email y redirect_url para identificar al usuario
    # y redirigirlo de vuelta a SAFPRO tras completar el pago.
    # dLocal Go permite estos query params en el subscribe_url.
    success_url = f"{settings.frontend_base}/upgrade/success"
    cancel_url = f"{settings.frontend_base}/upgrade?cancelled=1"
    params = urlencode({
        "external_id": str(user.user_id),
        "email": user.email,
        "redirect_url": success_url,
        "cancel_url": cancel_url,
    }, quote_via=quote)
    separator = "&" if "?" in subscribe_url else "?"
    full_url = f"{subscribe_url}{separator}{params}"

    logger.info(
        "Checkout URL generada — user_id=%s interval=%s plan_id=%s",
        user.user_id, interval, plan_id,
    )
    return full_url


# ── Webhook — verificación de firma ─────────────────────────────────────────

def verify_webhook_signature(payload_bytes: bytes, auth_header: str | None) -> bool:
    """
    Verifica la firma HMAC-SHA256 del webhook de dLocal Go.

    Formato del header:
        Authorization: V2-HMAC-SHA256, Signature: {hex_signature}

    Cálculo:
        message   = api_key + json_payload (string)
        signature = HMAC-SHA256(message, secret_key).hexdigest()

    Returns:
        True si la firma es válida, False en caso contrario.
    """
    if not auth_header:
        logger.warning("Webhook recibido sin header Authorization")
        return False

    # Extraer el hex de la firma: "V2-HMAC-SHA256, Signature: abc123..."
    try:
        sig_value = auth_header.split("Signature:")[-1].strip()
    except Exception:
        logger.warning("Header Authorization de webhook malformado: %s", auth_header)
        return False

    if not sig_value:
        logger.warning("Firma vacía en webhook Authorization header")
        return False

    message = settings.dlocalgo_api_key + payload_bytes.decode("utf-8")
    expected = hmac.new(
        settings.dlocalgo_secret_key.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    valid = hmac.compare_digest(expected, sig_value)
    if not valid:
        logger.warning("Firma de webhook inválida — esperado=%s recibido=%s", expected[:16] + "…", sig_value[:16] + "…")
    return valid


# ── Webhook — procesamiento del evento ──────────────────────────────────────

def handle_webhook_event(payload: dict, db: Session) -> dict:
    """
    Procesa un evento de webhook de dLocal Go ya verificado.

    dLocal Go envía: {"payment_id": "DP-xxx"}

    El handler:
      1. Obtiene el detalle del pago via GET /v1/payments/{payment_id}
      2. Extrae external_id (= user_id) y subscription_id
      3. Actualiza user.plan y user.dlocalgo_subscription_id según el status

    Statuses posibles del pago: PAID | PENDING | REJECTED | CANCELLED

    Returns:
        dict con {"status": "ok", "action": ...} para logging.
    """
    payment_id: str | None = payload.get("payment_id")
    if not payment_id:
        logger.warning("Webhook sin payment_id: %s", payload)
        return {"status": "ignored", "reason": "no payment_id"}

    # Obtener detalle del pago
    payment = _get_payment(payment_id)
    if payment is None:
        return {"status": "error", "reason": f"no se pudo obtener {payment_id}"}

    logger.info(
        "Webhook procesando — payment_id=%s status=%s order_id=%s",
        payment_id,
        payment.get("status"),
        payment.get("order_id", ""),
    )

    status = (payment.get("status") or "").upper()
    external_id: str | None = payment.get("external_id") or payment.get("order_id")
    subscription_id: str | None = payment.get("subscription_id")

    # Intentar encontrar usuario por external_id (UUID del user)
    user = _find_user_by_external_id(external_id, db)
    if not user:
        logger.warning(
            "Webhook: usuario no encontrado — external_id=%s payment_id=%s",
            external_id, payment_id,
        )
        return {"status": "ignored", "reason": "usuario no encontrado"}

    if status == "PAID":
        _on_payment_successful(user, payment, subscription_id, db)
        return {"status": "ok", "action": "plan_activated", "user_id": str(user.user_id)}

    elif status in ("CANCELLED", "REJECTED"):
        _on_payment_failed_or_cancelled(user, status, db)
        return {"status": "ok", "action": "plan_downgraded", "user_id": str(user.user_id)}

    else:
        # PENDING u otros — no accionable todavía
        logger.info("Webhook status no accionable: %s — payment_id=%s", status, payment_id)
        return {"status": "ok", "action": "ignored", "payment_status": status}


def _get_payment(payment_id: str) -> dict | None:
    """GET /v1/payments/{payment_id} — devuelve el objeto o None si falla."""
    url = f"{_api_base()}/v1/payments/{payment_id}"
    try:
        resp = httpx.get(url, headers=_headers(), timeout=15.0)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Error obteniendo pago %s — HTTP %s: %s",
            payment_id, exc.response.status_code, exc.response.text[:300],
        )
        return None
    except httpx.RequestError as exc:
        logger.error("Error de red obteniendo pago %s: %s", payment_id, exc)
        return None


def _find_user_by_external_id(external_id: str | None, db: Session) -> User | None:
    """Busca un usuario por su UUID (pasado como external_id al checkout)."""
    if not external_id:
        return None
    try:
        import uuid
        uid = uuid.UUID(external_id)
        return db.query(User).filter(User.user_id == uid).first()
    except (ValueError, AttributeError):
        logger.warning("external_id no es un UUID válido: %s", external_id)
        return None


def _on_payment_successful(
    user: User,
    payment: dict,
    subscription_id: str | None,
    db: Session,
) -> None:
    """Activa el plan Pro tras un pago exitoso."""
    user.plan = "pro"

    # Guardar subscription_id para poder cancelar después
    if subscription_id:
        user.dlocalgo_subscription_id = subscription_id

    # subscription_expires_at: dLocal Go gestiona la renovación automáticamente,
    # pero guardamos la fecha del próximo cobro si viene en el payload
    next_charge_at: datetime | None = None
    if payment.get("next_charge_at"):
        try:
            next_charge_at = datetime.fromisoformat(payment["next_charge_at"])
            if next_charge_at.tzinfo is None:
                next_charge_at = next_charge_at.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            pass
    user.subscription_expires_at = next_charge_at

    db.add(user)
    db.commit()

    logger.info(
        "Usuario actualizado a plan=pro — user_id=%s sub_id=%s",
        user.user_id, subscription_id,
    )

    track_event(
        user_id=user.user_id,
        event_type="plan_upgraded",
        plan="pro",
        metadata={
            "processor": "dlocalgo",
            "subscription_id": subscription_id,
            "payment_id": payment.get("id"),
        },
    )

    _send_upgrade_email_async(user)


def _on_payment_failed_or_cancelled(user: User, status: str, db: Session) -> None:
    """Baja el plan a free cuando un pago es rechazado o la suscripción es cancelada."""
    user.plan = "free"
    user.subscription_expires_at = None
    user.dlocalgo_subscription_id = None
    db.add(user)
    db.commit()
    logger.info(
        "Plan bajado a free — user_id=%s reason=%s",
        user.user_id, status,
    )


# ── Cancelar suscripción ─────────────────────────────────────────────────────

def cancel_subscription(user: User, db: Session) -> None:
    """
    Cancela la suscripción activa del usuario en dLocal Go.

    Llama DELETE /v1/subscription/plan/{plan_id}/subscription/{subscription_id}

    Raises:
        ValueError   : El usuario no tiene suscripción activa.
        RuntimeError : Error de red o respuesta inesperada de dLocal Go.
    """
    _require_config()

    if not user.dlocalgo_subscription_id:
        raise ValueError("El usuario no tiene una suscripción activa en dLocal Go.")

    subscription_id = user.dlocalgo_subscription_id

    # Intentar con plan mensual primero, luego anual
    # (no sabemos en cuál está sin consultar la sub; dLocal Go devolverá 404 en el incorrecto)
    cancelled = False
    for plan_id in [settings.dlocalgo_plan_id_monthly, settings.dlocalgo_plan_id_annual]:
        if not plan_id:
            continue
        url = f"{_api_base()}/v1/subscription/plan/{plan_id}/subscription/{subscription_id}"
        try:
            resp = httpx.delete(url, headers=_headers(), timeout=15.0)
            if resp.status_code in (200, 204):
                cancelled = True
                break
            elif resp.status_code == 404:
                continue  # no está en este plan, intentar el siguiente
            else:
                logger.error(
                    "Error cancelando sub %s en plan %s — HTTP %s: %s",
                    subscription_id, plan_id, resp.status_code, resp.text[:300],
                )
        except httpx.RequestError as exc:
            logger.error("Error de red cancelando suscripción: %s", exc)
            raise RuntimeError(f"Error de conexión con dLocal Go: {exc}") from exc

    if not cancelled:
        raise RuntimeError(
            f"No se pudo cancelar la suscripción {subscription_id} en dLocal Go. "
            "Es posible que ya esté cancelada o el ID sea inválido."
        )

    # Actualizar inmediatamente en DB — el webhook de confirmación también actualizará
    user.plan = "free"
    user.subscription_expires_at = None
    user.dlocalgo_subscription_id = None
    db.add(user)
    db.commit()

    logger.info("Suscripción cancelada — user_id=%s sub_id=%s", user.user_id, subscription_id)
    _send_cancellation_email_async(user)


# ── Emails async ─────────────────────────────────────────────────────────────

def _send_upgrade_email_async(user: User) -> None:
    """Envía el email de bienvenida Pro en background."""
    import threading
    from app.services.email_service import send_upgrade_confirmation_email

    def _send() -> None:
        try:
            send_upgrade_confirmation_email(
                to_email=user.email,
                full_name=user.full_name or user.username,
                plan=user.plan,
                expires_at=user.subscription_expires_at,
            )
        except Exception as exc:
            logger.warning("No se pudo enviar email de upgrade: %s", exc)

    threading.Thread(target=_send, daemon=True).start()


def _send_cancellation_email_async(user: User) -> None:
    """Envía confirmación de cancelación en background."""
    import threading
    from app.services.email_service import send_cancellation_confirmation_email

    def _send() -> None:
        try:
            send_cancellation_confirmation_email(
                to_email=user.email,
                full_name=user.full_name or user.username,
            )
        except Exception as exc:
            logger.warning("No se pudo enviar email de cancelación: %s", exc)

    threading.Thread(target=_send, daemon=True).start()
