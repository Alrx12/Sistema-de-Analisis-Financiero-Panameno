"""
billing_service.py — Lógica de negocio para Stripe.

Responsabilidades:
  - Crear o recuperar el Stripe Customer para un usuario
  - Crear sesiones de Stripe Checkout
  - Generar links del Customer Portal (gestión de suscripción)
  - Procesar eventos del webhook: checkout.session.completed,
    customer.subscription.deleted / updated, invoice.payment_failed

Nota sobre la librería stripe:
  pip install stripe
  La librería usa stripe.api_key como singleton global. Aquí siempre
  lo configuramos al inicio de cada función pública para evitar
  problemas en entornos multi-threaded.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)


def _stripe():
    """Devuelve el módulo stripe configurado. Lanza RuntimeError si falta config."""
    if not settings.stripe_secret_key:
        raise RuntimeError(
            "STRIPE_SECRET_KEY no configurado. "
            "Agrega la variable al .env para habilitar pagos."
        )
    try:
        import stripe as _s
    except ImportError as exc:
        raise RuntimeError(
            "Librería 'stripe' no instalada. Ejecuta: pip install stripe"
        ) from exc

    _s.api_key = settings.stripe_secret_key
    return _s


# ── Customer ────────────────────────────────────────────────────────────────

def get_or_create_customer(user: User, db: Session) -> str:
    """
    Devuelve el stripe_customer_id del usuario, creándolo en Stripe si no existe.
    Persiste el ID en la DB en el mismo call (no requiere commit externo — usa flush).
    """
    stripe = _stripe()

    if user.stripe_customer_id:
        return user.stripe_customer_id

    customer = stripe.Customer.create(
        email=user.email,
        name=user.full_name or user.username,
        metadata={"safpro_user_id": str(user.user_id)},
    )
    user.stripe_customer_id = customer["id"]
    db.add(user)
    db.flush()
    logger.info("Stripe Customer creado — user_id=%s customer_id=%s", user.user_id, customer["id"])
    return customer["id"]


# ── Checkout Session ─────────────────────────────────────────────────────────

def create_checkout_session(user: User, price_id: str, db: Session) -> str:
    """
    Crea una Stripe Checkout Session para el usuario y el price_id indicado.
    Devuelve la URL de redirección a Stripe.

    Args:
        user        : Usuario autenticado.
        price_id    : ID del precio en Stripe (monthly o annual).
        db          : Sesión SQLAlchemy.

    Returns:
        URL de la sesión de Checkout (https://checkout.stripe.com/...).
    """
    stripe = _stripe()
    customer_id = get_or_create_customer(user, db)
    db.commit()   # persistir stripe_customer_id antes de redirigir

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{settings.frontend_base}/upgrade/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.frontend_base}/upgrade?cancelled=1",
        subscription_data={
            "metadata": {"safpro_user_id": str(user.user_id)},
        },
        metadata={"safpro_user_id": str(user.user_id)},
        allow_promotion_codes=True,
        locale="es-419",   # español latinoamericano en el checkout
    )
    logger.info(
        "Checkout session creada — user_id=%s session_id=%s price_id=%s",
        user.user_id, session["id"], price_id,
    )
    return session["url"]


# ── Customer Portal ──────────────────────────────────────────────────────────

def create_portal_session(user: User, db: Session) -> str:
    """
    Genera una URL del Customer Portal de Stripe para que el usuario
    gestione su suscripción (cancelar, cambiar método de pago, ver facturas).

    El usuario debe tener ya un stripe_customer_id; si no, lanza ValueError.
    """
    stripe = _stripe()

    if not user.stripe_customer_id:
        raise ValueError("El usuario no tiene una suscripción activa en Stripe.")

    portal_session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{settings.frontend_base}/cuenta",
    )
    return portal_session["url"]


# ── Webhook handlers ─────────────────────────────────────────────────────────

def handle_webhook_event(payload: bytes, sig_header: str, db: Session) -> dict:
    """
    Verifica la firma del webhook y despacha el evento al handler correcto.

    Args:
        payload    : Cuerpo crudo del request (bytes) — requerido para verificación.
        sig_header : Valor del header Stripe-Signature.
        db         : Sesión SQLAlchemy.

    Returns:
        dict con {"status": "ok", "event_type": ...} para logging.

    Raises:
        ValueError  : Firma inválida o payload malformado.
        RuntimeError: Falta webhook_secret en config.
    """
    stripe = _stripe()

    if not settings.stripe_webhook_secret:
        raise RuntimeError("STRIPE_WEBHOOK_SECRET no configurado.")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except stripe.error.SignatureVerificationError as exc:
        raise ValueError(f"Firma de webhook inválida: {exc}") from exc

    event_type = event["type"]
    logger.info("Webhook recibido — type=%s id=%s", event_type, event["id"])

    handlers = {
        "checkout.session.completed":        _on_checkout_completed,
        "customer.subscription.updated":     _on_subscription_updated,
        "customer.subscription.deleted":     _on_subscription_deleted,
        "invoice.payment_failed":            _on_payment_failed,
    }

    handler = handlers.get(event_type)
    if handler:
        handler(event["data"]["object"], db)
    else:
        logger.debug("Evento Stripe no manejado: %s", event_type)

    return {"status": "ok", "event_type": event_type}


# ── Handlers internos ────────────────────────────────────────────────────────

def _find_user_by_customer(customer_id: str, db: Session) -> User | None:
    return db.query(User).filter(User.stripe_customer_id == customer_id).first()


def _on_checkout_completed(session_obj: dict, db: Session) -> None:
    """
    checkout.session.completed
    La suscripción fue creada exitosamente. Actualizamos plan → 'pro'
    y calculamos subscription_expires_at desde el período actual.
    """
    stripe = _stripe()
    customer_id = session_obj.get("customer")
    subscription_id = session_obj.get("subscription")

    user = _find_user_by_customer(customer_id, db)
    if not user:
        # Intentar por metadata si por algún motivo el customer_id no matchea
        safpro_user_id = (session_obj.get("metadata") or {}).get("safpro_user_id")
        if safpro_user_id:
            user = db.query(User).filter(
                User.user_id == safpro_user_id
            ).first()
        if not user:
            logger.warning("checkout.session.completed: usuario no encontrado — customer=%s", customer_id)
            return

    # Obtener la fecha de fin del período actual desde la suscripción
    expires_at: datetime | None = None
    if subscription_id:
        try:
            sub = stripe.Subscription.retrieve(subscription_id)
            ts = sub.get("current_period_end")
            if ts:
                expires_at = datetime.fromtimestamp(ts, tz=timezone.utc)
        except Exception as exc:
            logger.warning("No se pudo recuperar la suscripción %s: %s", subscription_id, exc)

    user.plan = "pro"
    user.subscription_expires_at = expires_at
    if customer_id and not user.stripe_customer_id:
        user.stripe_customer_id = customer_id

    db.add(user)
    db.commit()

    logger.info(
        "Usuario actualizado a plan=pro — user_id=%s expires_at=%s",
        user.user_id, expires_at,
    )

    # Enviar email de confirmación (fire-and-forget)
    _send_upgrade_email_async(user)


def _on_subscription_updated(sub_obj: dict, db: Session) -> None:
    """
    customer.subscription.updated
    Actualiza subscription_expires_at con el nuevo período y sincroniza
    el plan en caso de cambios de estado (active → past_due, etc.).
    """
    stripe = _stripe()  # noqa: F841
    customer_id = sub_obj.get("customer")
    status = sub_obj.get("status")   # active | past_due | canceled | ...
    ts = sub_obj.get("current_period_end")

    user = _find_user_by_customer(customer_id, db)
    if not user:
        logger.warning("subscription.updated: usuario no encontrado — customer=%s", customer_id)
        return

    if status == "active":
        user.plan = "pro"
        if ts:
            user.subscription_expires_at = datetime.fromtimestamp(ts, tz=timezone.utc)
    elif status in ("canceled", "unpaid"):
        user.plan = "free"
        user.subscription_expires_at = None

    db.add(user)
    db.commit()
    logger.info(
        "subscription.updated — user_id=%s status=%s plan=%s",
        user.user_id, status, user.plan,
    )


def _on_subscription_deleted(sub_obj: dict, db: Session) -> None:
    """
    customer.subscription.deleted
    La suscripción fue cancelada definitivamente. Bajamos el plan a 'free'.
    """
    customer_id = sub_obj.get("customer")
    user = _find_user_by_customer(customer_id, db)
    if not user:
        logger.warning("subscription.deleted: usuario no encontrado — customer=%s", customer_id)
        return

    user.plan = "free"
    user.subscription_expires_at = None
    db.add(user)
    db.commit()
    logger.info("Suscripción cancelada — user_id=%s → plan=free", user.user_id)


def _on_payment_failed(invoice_obj: dict, db: Session) -> None:
    """
    invoice.payment_failed
    El pago falló. Solo logueamos por ahora — Stripe reintentará
    automáticamente según la configuración del dashboard.
    """
    customer_id = invoice_obj.get("customer")
    attempt_count = invoice_obj.get("attempt_count", "?")
    logger.warning(
        "Pago fallido — customer=%s attempt=%s",
        customer_id, attempt_count,
    )


def _send_upgrade_email_async(user: User) -> None:
    """Envía el email de bienvenida Pro en background (no bloquea el webhook)."""
    import threading
    from app.services.email_service import send_upgrade_confirmation_email

    def _send():
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
