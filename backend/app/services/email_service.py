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

