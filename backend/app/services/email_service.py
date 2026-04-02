"""
Servicio de email para SAFPRO — usa Resend como proveedor.

Instalación:
    pip install resend

Configurar en .env:
    RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
    EMAIL_FROM=SAFPRO <noreply@tudominio.com>
    FRONTEND_URL=https://app.tudominio.com

Links generados:
    Reset contraseña : {FRONTEND_URL}/reset-password?token={reset_token}
    Verificar email  : {FRONTEND_URL}/verify-email?token={verification_token}
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def _get_resend():
    """Devuelve el módulo resend configurado. Lanza RuntimeError si falta config."""
    from app.core.config import settings

    if not settings.resend_api_key:
        raise RuntimeError(
            "RESEND_API_KEY no configurado. "
            "Agrega la variable al .env para habilitar el envío de emails."
        )
    try:
        import resend as _resend
    except ImportError as exc:
        raise RuntimeError(
            "Librería 'resend' no instalada. Ejecuta: pip install resend"
        ) from exc

    _resend.api_key = settings.resend_api_key
    return _resend


def send_verification_email(to_email: str, full_name: str, verification_token: str) -> None:
    """
    Envía el email de confirmación de registro al usuario.

    Args:
        to_email            : Dirección de email del destinatario.
        full_name           : Nombre del usuario (para personalizar el saludo).
        verification_token  : Token JWT de verificación (TTL 24 h).
    """
    from app.core.config import settings

    resend = _get_resend()
    verify_link = f"{settings.frontend_url}/verify-email?token={verification_token}"
    name_display = full_name or "Usuario"

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
      <h2 style="color:#1a56db;">¡Bienvenido a SAFPRO, {name_display}!</h2>
      <p>Gracias por registrarte en el Sistema de Análisis Financiero Pro.</p>
      <p>Por favor verifica tu dirección de email haciendo clic en el siguiente botón.
         El enlace es válido durante <strong>24 horas</strong>.</p>
      <p style="margin: 32px 0;">
        <a href="{verify_link}"
           style="background:#1a56db;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:bold;">
          Verificar mi email
        </a>
      </p>
      <p style="font-size:12px;color:#888;">
        Si no creaste esta cuenta en SAFPRO, ignora este mensaje.
      </p>
      <hr style="border:none;border-top:1px solid #eee;">
      <p style="font-size:12px;color:#aaa;">SAFPRO — Sistema de Análisis Financiero Pro</p>
    </div>
    """

    params: resend.Emails.SendParams = {
        "from": settings.email_from,
        "to": [to_email],
        "subject": "Confirma tu registro en SAFPRO",
        "html": html_body,
    }

    response = resend.Emails.send(params)
    logger.info(
        "Email de verificación enviado — to=%s resend_id=%s",
        to_email,
        response.get("id") if isinstance(response, dict) else response,
    )


def send_reset_email(to_email: str, reset_token: str) -> None:
    """
    Envía el email de recuperación de contraseña al usuario.

    Args:
        to_email    : Dirección de email del destinatario.
        reset_token : Token JWT de reset (TTL 15 min).

    Raises:
        RuntimeError: Si el envío falla (proveedor rechaza la request).
    """
    from app.core.config import settings

    resend = _get_resend()
    reset_link = f"{settings.frontend_url}/reset-password?token={reset_token}"

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
      <h2>Recuperación de contraseña — SAFPRO</h2>
      <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.</p>
      <p>Haz clic en el botón para continuar. El enlace expira en <strong>15 minutos</strong>.</p>
      <p style="margin: 32px 0;">
        <a href="{reset_link}"
           style="background:#1a56db;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:bold;">
          Restablecer contraseña
        </a>
      </p>
      <p style="font-size:12px;color:#888;">
        Si no solicitaste este cambio, ignora este mensaje. Tu contraseña no cambiará.
      </p>
      <hr style="border:none;border-top:1px solid #eee;">
      <p style="font-size:12px;color:#aaa;">SAFPRO — Sistema de Análisis Financiero Pro</p>
    </div>
    """

    params: resend.Emails.SendParams = {
        "from": settings.email_from,
        "to": [to_email],
        "subject": "Recupera tu contraseña — SAFPRO",
        "html": html_body,
    }

    response = resend.Emails.send(params)
    logger.info(
        "Email de reset enviado — to=%s resend_id=%s",
        to_email,
        response.get("id") if isinstance(response, dict) else response,
    )


def send_upgrade_confirmation_email(
    to_email: str,
    full_name: str,
    plan: str,
    expires_at: "datetime | None" = None,  # type: ignore[name-defined]
) -> None:
    """
    Envía la confirmación de upgrade a Plan Pro al usuario.

    Args:
        to_email   : Email del destinatario.
        full_name  : Nombre del usuario.
        plan       : Plan nuevo (normalmente 'pro').
        expires_at : Fecha de expiración de la suscripción (opcional).
    """
    from app.core.config import settings

    resend = _get_resend()
    name_display = full_name or "Usuario"
    dashboard_link = f"{settings.frontend_base}/"
    manage_link = f"{settings.frontend_base}/cuenta"

    # Formateo de fecha de renovación
    renewal_line = ""
    if expires_at:
        try:
            fecha_str = expires_at.strftime("%d de %B de %Y")
            renewal_line = f"<p>Tu suscripción se renovará automáticamente el <strong>{fecha_str}</strong>.</p>"
        except Exception:
            pass

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 520px; margin: auto; color: #1a1a2e;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #1c2b4b, #2d4878); padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <div style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 10px; padding: 10px 14px; margin-bottom: 16px;">
          <span style="color: #fff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">SAFPRO</span>
        </div>
        <h1 style="color: #ffffff; font-size: 22px; margin: 0;">¡Bienvenido al Plan Pro, {name_display}! 🎉</h1>
      </div>

      <!-- Body -->
      <div style="background: #ffffff; padding: 28px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px;">Tu pago fue procesado exitosamente. A partir de ahora tienes acceso completo a todas las funciones de <strong>SAFPRO Pro</strong>.</p>

        <!-- Feature list -->
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; font-weight: 700; color: #1c2b4b;">Lo que incluye tu plan Pro:</p>
          <ul style="margin: 0; padding-left: 20px; line-height: 1.9; color: #374151;">
            <li>Análisis ilimitados — sube todos los meses sin restricción</li>
            <li>Historial financiero completo desde el primer día</li>
            <li>Knowledge Base personal avanzado con aprendizaje acumulativo</li>
            <li>Simulaciones y planificador de quincena</li>
            <li>Presupuesto personalizado 50/30/20 con perfil financiero</li>
            <li>Soporte prioritario</li>
          </ul>
        </div>

        {renewal_line}

        <p style="margin: 24px 0 8px 0;">Cuando quieras gestionar tu suscripción (cambiar método de pago, cancelar, ver facturas), puedes hacerlo desde tu cuenta.</p>

        <!-- CTAs -->
        <div style="text-align: center; margin: 28px 0 20px 0;">
          <a href="{dashboard_link}"
             style="display: inline-block; background: #e05c19; color: #fff; padding: 13px 28px;
                    border-radius: 7px; text-decoration: none; font-weight: 700; font-size: 15px;
                    margin-right: 10px;">
            Ir al Dashboard →
          </a>
          <a href="{manage_link}"
             style="display: inline-block; background: #f3f4f6; color: #374151; padding: 13px 28px;
                    border-radius: 7px; text-decoration: none; font-weight: 600; font-size: 15px;">
            Gestionar suscripción
          </a>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
          SAFPRO — Sistema de Análisis Financiero Pro<br>
          <a href="{settings.frontend_base}/privacy" style="color: #9ca3af;">Política de Privacidad</a>
          &nbsp;·&nbsp;
          <a href="{settings.frontend_base}/terms" style="color: #9ca3af;">Términos de Servicio</a>
        </p>
      </div>
    </div>
    """

    params: resend.Emails.SendParams = {
        "from": settings.email_from,
        "to": [to_email],
        "subject": "¡Tu Plan Pro está activo! — SAFPRO",
        "html": html_body,
    }

    response = resend.Emails.send(params)
    logger.info(
        "Email de upgrade enviado — to=%s plan=%s resend_id=%s",
        to_email,
        plan,
        response.get("id") if isinstance(response, dict) else response,
    )

