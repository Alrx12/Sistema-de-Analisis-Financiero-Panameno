"""
billing_service.py — Lógica de negocio para pagos y suscripciones.

Soporta dos procesadores (el activo se detecta por credenciales en .env):
  - PayPal Subscriptions  (plan A — disponible de inmediato)
  - dLocal Go             (plan B — cuando aprueben el merchant account)

Flujo unificado (ambos procesadores):
  1. POST /billing/create-checkout-session → devuelve checkout_url
  2. Usuario completa el pago en el checkout hosted del procesador
  3. Procesador llama POST /billing/webhook (PayPal) o POST /billing/dlocalgo/webhook
  4. Backend verifica firma y actualiza user.plan = "pro"
  5. DELETE /billing/cancel → cancela la suscripción activa

────────────────────────────────────────────────────────────────────────────────
PayPal Subscriptions:
  Auth      : OAuth2 Bearer (client_id:secret → POST /v1/oauth2/token)
  Checkout  : POST /v1/billing/subscriptions → links[rel=approve]
  custom_id : user.user_id (identificador en el webhook)
  Webhook   : POST /billing/webhook (PayPal-Transmission-* headers)
  Verify    : POST /v1/notifications/verify-webhook-signature (API call)
  Cancel    : POST /v1/billing/subscriptions/{id}/cancel

dLocal Go:
  Auth      : Bearer api_key:secret_key
  Checkout  : GET /v1/subscription/plan/{id} → subscribe_url + ?external_id=user_id
  Webhook   : POST /billing/dlocalgo/webhook (V2-HMAC-SHA256 header)
  Verify    : HMAC-SHA256(api_key + payload, secret_key)
  Cancel    : DELETE /v1/subscription/plan/{plan_id}/subscription/{sub_id}
────────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import threading
from datetime import datetime, timezone
from urllib.parse import quote, urlencode

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
from app.services.analytics_service import track_event

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# DETECTOR DE PROCESADOR ACTIVO
# ══════════════════════════════════════════════════════════════════════════════

def active_processor() -> str | None:
    """
    Detecta qué procesador de pagos está configurado.

    Prioridad: PayPal > dLocal Go
    (PayPal está listo para usar hoy; dLocal Go requiere aprobación del merchant)

    Returns:
        "paypal" | "dlocalgo" | None
    """
    if settings.paypal_client_id and settings.paypal_client_secret:
        return "paypal"
    if settings.dlocalgo_api_key and settings.dlocalgo_secret_key:
        return "dlocalgo"
    return None


# ══════════════════════════════════════════════════════════════════════════════
# CHECKOUT — punto de entrada unificado
# ══════════════════════════════════════════════════════════════════════════════

def create_checkout_url(user: User, interval: str) -> str:
    """
    Genera la URL de checkout para el procesador activo.

    Args:
        user     : Usuario autenticado que quiere suscribirse.
        interval : "monthly" | "annual"

    Returns:
        URL al hosted checkout (PayPal approval page o dLocal Go subscribe_url).

    Raises:
        RuntimeError : Ningún procesador configurado, o error de API.
        ValueError   : interval inválido.
    """
    if interval not in ("monthly", "annual"):
        raise ValueError(f"interval debe ser 'monthly' o 'annual', recibido: {interval!r}")

    processor = active_processor()
    if processor == "paypal":
        return _paypal_create_checkout_url(user, interval)
    elif processor == "dlocalgo":
        return _dlocalgo_create_checkout_url(user, interval)
    else:
        raise RuntimeError(
            "No hay procesador de pagos configurado. "
            "Agrega PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET al .env, "
            "o DLOCALGO_API_KEY + DLOCALGO_SECRET_KEY."
        )


# ══════════════════════════════════════════════════════════════════════════════
# PAYPAL SUBSCRIPTIONS
# ══════════════════════════════════════════════════════════════════════════════

def _paypal_base() -> str:
    if settings.paypal_sandbox:
        return "https://api-m.sandbox.paypal.com"
    return "https://api-m.paypal.com"


def _paypal_access_token() -> str:
    """
    Obtiene un token OAuth2 de PayPal.

    POST /v1/oauth2/token
    Basic Auth: client_id:client_secret
    Body: grant_type=client_credentials

    Returns:
        access_token (string)

    Raises:
        RuntimeError si la autenticación falla.
    """
    url = f"{_paypal_base()}/v1/oauth2/token"
    try:
        resp = httpx.post(
            url,
            auth=(settings.paypal_client_id, settings.paypal_client_secret),
            data={"grant_type": "client_credentials"},
            timeout=15.0,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]
    except httpx.HTTPStatusError as exc:
        logger.error(
            "PayPal auth fallida — HTTP %s: %s",
            exc.response.status_code, exc.response.text[:300],
        )
        raise RuntimeError(
            f"No se pudo autenticar con PayPal: HTTP {exc.response.status_code}. "
            "Verifica PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en .env."
        ) from exc
    except httpx.RequestError as exc:
        raise RuntimeError(f"Error de conexión con PayPal: {exc}") from exc


def _paypal_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _paypal_create_checkout_url(user: User, interval: str) -> str:
    """
    Crea una suscripción en PayPal y devuelve la URL de aprobación.

    Flujo:
      1. Obtener access_token
      2. POST /v1/billing/subscriptions con plan_id + custom_id (user_id)
      3. Extraer link rel="approve" → URL del checkout

    custom_id se usa en el webhook para identificar al usuario sin depender del email.
    """
    plan_id = (
        settings.paypal_plan_id_monthly if interval == "monthly"
        else settings.paypal_plan_id_annual
    )
    if not plan_id:
        raise RuntimeError(
            f"PAYPAL_PLAN_ID_{interval.upper()} no configurado. "
            "Ejecuta scripts/setup_paypal_plans.py y agrega los IDs al .env."
        )

    token = _paypal_access_token()
    url = f"{_paypal_base()}/v1/billing/subscriptions"

    body = {
        "plan_id": plan_id,
        "custom_id": str(user.user_id),   # identificador en el webhook
        "subscriber": {
            "email_address": user.email,
            "name": {
                "given_name": (user.full_name or user.username).split()[0],
            },
        },
        "application_context": {
            "brand_name": "SAFPRO",
            "locale": "es-PA",
            "shipping_preference": "NO_SHIPPING",
            "user_action": "SUBSCRIBE_NOW",
            "payment_method": {
                "payer_selected": "PAYPAL",
                "payee_preferred": "IMMEDIATE_PAYMENT_REQUIRED",
            },
            "return_url": f"{settings.frontend_base}/upgrade/success",
            "cancel_url": f"{settings.frontend_base}/upgrade?cancelled=1",
        },
    }

    try:
        resp = httpx.post(url, json=body, headers=_paypal_headers(token), timeout=20.0)
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "PayPal create subscription fallida — HTTP %s: %s",
            exc.response.status_code, exc.response.text[:500],
        )
        raise RuntimeError(
            f"No se pudo crear la suscripción en PayPal: HTTP {exc.response.status_code}"
        ) from exc
    except httpx.RequestError as exc:
        raise RuntimeError(f"Error de conexión con PayPal: {exc}") from exc

    data = resp.json()
    # Buscar el link de aprobación
    approve_url: str | None = next(
        (lnk["href"] for lnk in data.get("links", []) if lnk.get("rel") == "approve"),
        None,
    )
    if not approve_url:
        raise RuntimeError(
            f"PayPal no devolvió link de aprobación. Respuesta: {data}"
        )

    logger.info(
        "PayPal checkout creado — user_id=%s interval=%s sub_id=%s",
        user.user_id, interval, data.get("id"),
    )
    return approve_url


def verify_paypal_webhook_signature(
    body: bytes,
    transmission_id: str | None,
    transmission_time: str | None,
    cert_url: str | None,
    auth_algo: str | None,
    transmission_sig: str | None,
) -> bool:
    """
    Verifica la firma del webhook de PayPal usando su API de verificación.

    POST /v1/notifications/verify-webhook-signature
    Requiere PAYPAL_WEBHOOK_ID en .env.

    Returns:
        True si la firma es VERIFIED, False en cualquier otro caso.
    """
    if not settings.paypal_webhook_id:
        # Si no hay webhook_id configurado, aceptar en sandbox para facilitar el desarrollo
        if settings.paypal_sandbox:
            logger.warning(
                "PAYPAL_WEBHOOK_ID no configurado — aceptando webhook en sandbox sin verificación"
            )
            return True
        logger.error("PAYPAL_WEBHOOK_ID no configurado — rechazando webhook en producción")
        return False

    if not all([transmission_id, transmission_time, cert_url, auth_algo, transmission_sig]):
        logger.warning("Webhook PayPal con headers incompletos — rechazado")
        return False

    try:
        token = _paypal_access_token()
        url = f"{_paypal_base()}/v1/notifications/verify-webhook-signature"
        payload = {
            "transmission_id": transmission_id,
            "transmission_time": transmission_time,
            "cert_url": cert_url,
            "auth_algo": auth_algo,
            "transmission_sig": transmission_sig,
            "webhook_id": settings.paypal_webhook_id,
            "webhook_event": json.loads(body),
        }
        resp = httpx.post(url, json=payload, headers=_paypal_headers(token), timeout=15.0)
        resp.raise_for_status()
        verification_status = resp.json().get("verification_status", "FAILURE")
        if verification_status != "SUCCESS":
            logger.warning("PayPal webhook no verificado — status=%s", verification_status)
        return verification_status == "SUCCESS"
    except Exception as exc:
        logger.error("Error verificando webhook PayPal: %s", exc)
        return False


def handle_paypal_webhook_event(payload: dict, db: Session) -> dict:
    """
    Procesa un evento de webhook de PayPal ya verificado.

    Eventos que maneja:
      BILLING.SUBSCRIPTION.ACTIVATED → plan = "pro", guarda paypal_subscription_id
      BILLING.SUBSCRIPTION.CANCELLED → plan = "free", limpia subscription_id
      BILLING.SUBSCRIPTION.SUSPENDED → plan = "free"
      PAYMENT.SALE.COMPLETED         → renovación confirmada (solo log)
      BILLING.SUBSCRIPTION.PAYMENT.FAILED → log + (futuro: notificar al usuario)

    Returns:
        dict {"status": "ok", "action": ...}
    """
    event_type: str = payload.get("event_type", "")
    resource: dict = payload.get("resource", {})

    logger.info("PayPal webhook — event_type=%s", event_type)

    if event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
        subscription_id: str = resource.get("id", "")
        custom_id: str = resource.get("custom_id", "")
        user = _find_user_by_uuid(custom_id, db)
        if not user:
            logger.warning(
                "PayPal webhook: usuario no encontrado — custom_id=%s", custom_id
            )
            return {"status": "ignored", "reason": "usuario no encontrado"}
        _paypal_on_subscription_activated(user, subscription_id, db)
        return {"status": "ok", "action": "plan_activated", "user_id": str(user.user_id)}

    elif event_type in ("BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.SUSPENDED"):
        subscription_id = resource.get("id", "")
        user = db.query(User).filter(
            User.paypal_subscription_id == subscription_id
        ).first()
        if not user:
            logger.warning(
                "PayPal webhook: usuario no encontrado para sub=%s", subscription_id
            )
            return {"status": "ignored", "reason": "suscripción no encontrada"}
        _paypal_on_subscription_ended(user, event_type, db)
        return {"status": "ok", "action": "plan_downgraded", "user_id": str(user.user_id)}

    elif event_type == "PAYMENT.SALE.COMPLETED":
        # Renovación exitosa — el plan ya es "pro", solo logueamos
        billing_agreement_id = resource.get("billing_agreement_id", "")
        logger.info(
            "PayPal renovación confirmada — subscription_id=%s amount=%s",
            billing_agreement_id,
            resource.get("amount", {}).get("total", "?"),
        )
        return {"status": "ok", "action": "renewal_logged"}

    elif event_type == "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
        subscription_id = resource.get("id", "")
        logger.warning(
            "PayPal pago fallido — subscription_id=%s", subscription_id
        )
        # Por ahora solo loguear; en el futuro: notificar al usuario por email
        return {"status": "ok", "action": "payment_failure_logged"}

    else:
        logger.info("PayPal webhook no manejado — event_type=%s", event_type)
        return {"status": "ok", "action": "ignored", "event_type": event_type}


def _paypal_on_subscription_activated(
    user: User,
    subscription_id: str,
    db: Session,
) -> None:
    """Activa el plan Pro tras la activación de la suscripción PayPal."""
    user.plan = "pro"
    user.paypal_subscription_id = subscription_id
    db.add(user)
    db.commit()

    logger.info(
        "PayPal: usuario actualizado a plan=pro — user_id=%s sub_id=%s",
        user.user_id, subscription_id,
    )
    track_event(
        user_id=user.user_id,
        event_type="plan_upgraded",
        plan="pro",
        metadata={"processor": "paypal", "subscription_id": subscription_id},
    )
    _send_upgrade_email_async(user)


def _paypal_on_subscription_ended(user: User, reason: str, db: Session) -> None:
    """Baja el plan a free cuando la suscripción PayPal es cancelada o suspendida."""
    user.plan = "free"
    user.paypal_subscription_id = None
    user.subscription_expires_at = None
    db.add(user)
    db.commit()
    logger.info(
        "PayPal: plan bajado a free — user_id=%s reason=%s",
        user.user_id, reason,
    )


def cancel_paypal_subscription(user: User, db: Session) -> None:
    """
    Cancela la suscripción activa del usuario en PayPal.

    POST /v1/billing/subscriptions/{id}/cancel

    Raises:
        ValueError   : El usuario no tiene suscripción PayPal activa.
        RuntimeError : Error de red o respuesta inesperada.
    """
    if not user.paypal_subscription_id:
        raise ValueError("El usuario no tiene una suscripción activa en PayPal.")

    subscription_id = user.paypal_subscription_id
    token = _paypal_access_token()
    url = f"{_paypal_base()}/v1/billing/subscriptions/{subscription_id}/cancel"

    try:
        resp = httpx.post(
            url,
            json={"reason": "User requested cancellation via SAFPRO"},
            headers=_paypal_headers(token),
            timeout=15.0,
        )
        # PayPal devuelve 204 No Content en éxito
        if resp.status_code not in (200, 204):
            logger.error(
                "PayPal cancel fallida — HTTP %s: %s",
                resp.status_code, resp.text[:300],
            )
            raise RuntimeError(
                f"No se pudo cancelar la suscripción en PayPal: HTTP {resp.status_code}"
            )
    except httpx.RequestError as exc:
        raise RuntimeError(f"Error de conexión con PayPal: {exc}") from exc

    # Actualizar inmediatamente en DB (el webhook de PayPal también confirmará)
    user.plan = "free"
    user.paypal_subscription_id = None
    user.subscription_expires_at = None
    db.add(user)
    db.commit()

    logger.info(
        "PayPal: suscripción cancelada — user_id=%s sub_id=%s",
        user.user_id, subscription_id,
    )
    _send_cancellation_email_async(user)


# ══════════════════════════════════════════════════════════════════════════════
# dLOCAL GO
# ══════════════════════════════════════════════════════════════════════════════

def _require_dlocalgo_config() -> None:
    if not settings.dlocalgo_api_key or not settings.dlocalgo_secret_key:
        raise RuntimeError(
            "DLOCALGO_API_KEY y DLOCALGO_SECRET_KEY no configurados. "
            "Obtén tus keys en merchant.dlocalgo.com → Developers → API Keys."
        )


def _dlocalgo_base() -> str:
    if settings.dlocalgo_sandbox:
        return "https://api-sbx.dlocalgo.com"
    return "https://api.dlocalgo.com"


def _dlocalgo_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.dlocalgo_api_key}:{settings.dlocalgo_secret_key}",
        "Content-Type": "application/json",
    }


def _dlocalgo_create_checkout_url(user: User, interval: str) -> str:
    """Construye la URL de checkout de dLocal Go para la suscripción."""
    _require_dlocalgo_config()

    plan_id = (
        settings.dlocalgo_plan_id_monthly if interval == "monthly"
        else settings.dlocalgo_plan_id_annual
    )
    if not plan_id:
        raise RuntimeError(
            f"DLOCALGO_PLAN_ID_{interval.upper()} no configurado. "
            "Ejecuta scripts/setup_dlocalgo_plans.py."
        )

    url = f"{_dlocalgo_base()}/v1/subscription/plan/{plan_id}"
    try:
        resp = httpx.get(url, headers=_dlocalgo_headers(), timeout=15.0)
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "dLocal Go plan fetch fallida — plan_id=%s HTTP %s: %s",
            plan_id, exc.response.status_code, exc.response.text[:500],
        )
        raise RuntimeError(
            f"No se pudo obtener el plan {plan_id} desde dLocal Go: "
            f"HTTP {exc.response.status_code}"
        ) from exc
    except httpx.RequestError as exc:
        raise RuntimeError(f"Error de conexión con dLocal Go: {exc}") from exc

    plan_data = resp.json()
    subscribe_url: str | None = plan_data.get("subscribe_url")
    if not subscribe_url:
        raise RuntimeError(
            f"El plan {plan_id} no devolvió subscribe_url. Respuesta: {plan_data}"
        )

    params = urlencode({
        "external_id": str(user.user_id),
        "email": user.email,
        "redirect_url": f"{settings.frontend_base}/upgrade/success",
        "cancel_url": f"{settings.frontend_base}/upgrade?cancelled=1",
    }, quote_via=quote)
    separator = "&" if "?" in subscribe_url else "?"
    full_url = f"{subscribe_url}{separator}{params}"

    logger.info(
        "dLocal Go checkout URL generada — user_id=%s interval=%s plan_id=%s",
        user.user_id, interval, plan_id,
    )
    return full_url


def verify_dlocalgo_webhook_signature(payload_bytes: bytes, auth_header: str | None) -> bool:
    """
    Verifica la firma HMAC-SHA256 del webhook de dLocal Go.

    Header: "V2-HMAC-SHA256, Signature: {hex}"
    Cálculo: HMAC-SHA256(api_key + payload, secret_key).hexdigest()
    """
    if not auth_header:
        logger.warning("dLocal Go webhook sin header Authorization")
        return False
    try:
        sig_value = auth_header.split("Signature:")[-1].strip()
    except Exception:
        logger.warning("dLocal Go webhook Authorization malformado: %s", auth_header)
        return False

    if not sig_value:
        return False

    message = settings.dlocalgo_api_key + payload_bytes.decode("utf-8")
    expected = hmac.new(
        settings.dlocalgo_secret_key.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    valid = hmac.compare_digest(expected, sig_value)
    if not valid:
        logger.warning(
            "dLocal Go firma inválida — esperado=%s… recibido=%s…",
            expected[:16], sig_value[:16],
        )
    return valid


def handle_dlocalgo_webhook_event(payload: dict, db: Session) -> dict:
    """Procesa un evento de webhook de dLocal Go ya verificado."""
    payment_id: str | None = payload.get("payment_id")
    if not payment_id:
        logger.warning("dLocal Go webhook sin payment_id: %s", payload)
        return {"status": "ignored", "reason": "no payment_id"}

    payment = _dlocalgo_get_payment(payment_id)
    if payment is None:
        return {"status": "error", "reason": f"no se pudo obtener {payment_id}"}

    status = (payment.get("status") or "").upper()
    external_id: str | None = payment.get("external_id") or payment.get("order_id")
    subscription_id: str | None = payment.get("subscription_id")

    user = _find_user_by_uuid(external_id, db)
    if not user:
        logger.warning(
            "dLocal Go webhook: usuario no encontrado — external_id=%s", external_id
        )
        return {"status": "ignored", "reason": "usuario no encontrado"}

    if status == "PAID":
        user.plan = "pro"
        if subscription_id:
            user.dlocalgo_subscription_id = subscription_id
        db.add(user)
        db.commit()
        logger.info(
            "dLocal Go: usuario actualizado a plan=pro — user_id=%s sub_id=%s",
            user.user_id, subscription_id,
        )
        track_event(
            user_id=user.user_id,
            event_type="plan_upgraded",
            plan="pro",
            metadata={"processor": "dlocalgo", "subscription_id": subscription_id},
        )
        _send_upgrade_email_async(user)
        return {"status": "ok", "action": "plan_activated", "user_id": str(user.user_id)}

    elif status in ("CANCELLED", "REJECTED"):
        user.plan = "free"
        user.dlocalgo_subscription_id = None
        user.subscription_expires_at = None
        db.add(user)
        db.commit()
        logger.info(
            "dLocal Go: plan bajado a free — user_id=%s reason=%s",
            user.user_id, status,
        )
        return {"status": "ok", "action": "plan_downgraded", "user_id": str(user.user_id)}

    else:
        logger.info("dLocal Go status no accionable: %s — payment_id=%s", status, payment_id)
        return {"status": "ok", "action": "ignored", "payment_status": status}


def _dlocalgo_get_payment(payment_id: str) -> dict | None:
    url = f"{_dlocalgo_base()}/v1/payments/{payment_id}"
    try:
        resp = httpx.get(url, headers=_dlocalgo_headers(), timeout=15.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.error("Error obteniendo pago dLocal Go %s: %s", payment_id, exc)
        return None


def cancel_dlocalgo_subscription(user: User, db: Session) -> None:
    """Cancela la suscripción activa del usuario en dLocal Go."""
    _require_dlocalgo_config()

    if not user.dlocalgo_subscription_id:
        raise ValueError("El usuario no tiene una suscripción activa en dLocal Go.")

    subscription_id = user.dlocalgo_subscription_id
    cancelled = False
    for plan_id in [settings.dlocalgo_plan_id_monthly, settings.dlocalgo_plan_id_annual]:
        if not plan_id:
            continue
        url = f"{_dlocalgo_base()}/v1/subscription/plan/{plan_id}/subscription/{subscription_id}"
        try:
            resp = httpx.delete(url, headers=_dlocalgo_headers(), timeout=15.0)
            if resp.status_code in (200, 204):
                cancelled = True
                break
            elif resp.status_code == 404:
                continue
            else:
                logger.error(
                    "dLocal Go cancel fallida — sub=%s plan=%s HTTP %s: %s",
                    subscription_id, plan_id, resp.status_code, resp.text[:300],
                )
        except httpx.RequestError as exc:
            raise RuntimeError(f"Error de conexión con dLocal Go: {exc}") from exc

    if not cancelled:
        raise RuntimeError(
            f"No se pudo cancelar la suscripción {subscription_id} en dLocal Go."
        )

    user.plan = "free"
    user.dlocalgo_subscription_id = None
    user.subscription_expires_at = None
    db.add(user)
    db.commit()
    logger.info(
        "dLocal Go: suscripción cancelada — user_id=%s sub_id=%s",
        user.user_id, subscription_id,
    )
    _send_cancellation_email_async(user)


# ══════════════════════════════════════════════════════════════════════════════
# CANCELACIÓN — punto de entrada unificado
# ══════════════════════════════════════════════════════════════════════════════

def cancel_subscription(user: User, db: Session) -> None:
    """
    Cancela la suscripción activa del usuario, detectando el procesador por
    el subscription_id que esté guardado.

    Raises:
        ValueError   : El usuario no tiene suscripción activa.
        RuntimeError : Error de comunicación con el procesador.
    """
    if user.paypal_subscription_id:
        cancel_paypal_subscription(user, db)
    elif user.dlocalgo_subscription_id:
        cancel_dlocalgo_subscription(user, db)
    else:
        raise ValueError(
            "El usuario no tiene una suscripción activa en ningún procesador."
        )


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS COMPARTIDOS
# ══════════════════════════════════════════════════════════════════════════════

def _find_user_by_uuid(uid_str: str | None, db: Session) -> User | None:
    """Busca un usuario por su UUID (como string)."""
    if not uid_str:
        return None
    try:
        import uuid
        uid = uuid.UUID(uid_str)
        return db.query(User).filter(User.user_id == uid).first()
    except (ValueError, AttributeError):
        logger.warning("UUID inválido: %s", uid_str)
        return None


def _send_upgrade_email_async(user: User) -> None:
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


# ── Mantener compatibilidad con código existente (dLocal Go legacy API) ───────
# Aliases para que cualquier import directo de funciones antiguas no rompa.

def create_checkout_url_dlocalgo(user: User, interval: str) -> str:
    return _dlocalgo_create_checkout_url(user, interval)


def verify_webhook_signature(payload_bytes: bytes, auth_header: str | None) -> bool:
    return verify_dlocalgo_webhook_signature(payload_bytes, auth_header)


def handle_webhook_event(payload: dict, db: Session) -> dict:
    return handle_dlocalgo_webhook_event(payload, db)
