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

def send_cancellation_confirmation_email(
    to_email: str,
    full_name: str,
) -> None:
    """Email de confirmación cuando el usuario cancela su suscripción Pro."""
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0f2a4a; padding: 24px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">SAFPRO</h1>
      </div>
      <div style="padding: 32px; background: #ffffff;">
        <h2 style="color: #0f2a4a;">Tu suscripción Pro ha sido cancelada</h2>
        <p>Hola {full_name},</p>
        <p>Confirmamos que tu suscripción Pro de SAFPRO ha sido cancelada exitosamente. 
        Tu cuenta ha vuelto al plan gratuito.</p>
        <p>Si esto fue un error o cambias de opinión, puedes reactivar tu plan en cualquier momento:</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="{settings.frontend_base}/upgrade"
             style="background: #f97316; color: white; padding: 12px 28px; 
                    border-radius: 6px; text-decoration: none; font-weight: bold;">
            Reactivar Plan Pro
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          Si tienes preguntas, responde a este correo.
        </p>
      </div>
      <div style="background: #f3f4f6; padding: 16px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          SAFPRO · Análisis financiero personal · Panamá
        </p>
      </div>
    </div>
    """
    _send_email(
        to_email=to_email,
        subject="Tu suscripción Pro de SAFPRO fue cancelada",
        html_content=html_content,
    )

def send_admin_job_failed_alert(
    user_email: str,
    user_id: str,
    job_id: str,
    filename: str,
    error_message: str,
    consecutive_count: int,
) -> None:
    """
    Envía alerta a admin@safpro.us cuando un usuario tiene 2+ jobs fallidos consecutivos.

    Args:
        user_email       : Email del usuario afectado.
        user_id          : UUID del usuario como string.
        job_id           : UUID del job que falló.
        filename         : Nombre del archivo que falló.
        error_message    : Mensaje de error del último job.
        consecutive_count: Número de errores consecutivos detectados.
    """
    ADMIN_EMAIL = "admin@safpro.us"

    resend = _get_resend()

    alert_color = "#dc2626" if consecutive_count >= 3 else "#d97706"
    level_label = "🔴 CRÍTICO" if consecutive_count >= 3 else "🟡 ADVERTENCIA"

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 560px; margin: auto; color: #1a1a2e;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #1c2b4b, #2d4878); padding: 24px; border-radius: 12px 12px 0 0;">
        <div style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border-radius: 8px; padding: 6px 12px; margin-bottom: 12px;">
          <span style="color: #fff; font-size: 16px; font-weight: 800;">SAFPRO</span>
        </div>
        <h2 style="color: #ffffff; margin: 0; font-size: 18px;">
          {level_label} — Jobs fallidos consecutivos
        </h2>
      </div>

      <!-- Body -->
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb;
                  border-top: none; border-radius: 0 0 12px 12px;">

        <!-- Alert banner -->
        <div style="background: {alert_color}1a; border-left: 4px solid {alert_color};
                    padding: 12px 16px; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0; font-weight: 700; color: {alert_color};">
            {consecutive_count} errores consecutivos detectados para este usuario.
          </p>
        </div>

        <!-- User info -->
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px 4px; color: #6b7280; width: 140px;">Usuario</td>
            <td style="padding: 8px 4px; font-weight: 600;">{user_email}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px 4px; color: #6b7280;">User ID</td>
            <td style="padding: 8px 4px; font-family: monospace; font-size: 12px;">{user_id}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px 4px; color: #6b7280;">Job ID</td>
            <td style="padding: 8px 4px; font-family: monospace; font-size: 12px;">{job_id}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px 4px; color: #6b7280;">Archivo</td>
            <td style="padding: 8px 4px;">{filename}</td>
          </tr>
          <tr>
            <td style="padding: 8px 4px; color: #6b7280;">Errores consec.</td>
            <td style="padding: 8px 4px; font-weight: 700; color: {alert_color};">{consecutive_count}</td>
          </tr>
        </table>

        <!-- Error message -->
        <div style="margin-top: 20px;">
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 6px;">Último mensaje de error:</p>
          <div style="background: #1f2937; color: #f9fafb; padding: 12px 16px; border-radius: 6px;
                      font-family: monospace; font-size: 12px; word-break: break-all;
                      white-space: pre-wrap;">{error_message}</div>
        </div>

        <!-- Actions -->
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 13px; color: #6b7280; margin: 0 0 12px 0;">
            Revisa el panel de admin para ver el historial completo de jobs de este usuario.
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="font-size: 11px; color: #9ca3af; text-align: center; margin: 0;">
          SAFPRO Monitoring — Este es un email automático generado por el sistema.
        </p>
      </div>
    </div>
    """

    params: resend.Emails.SendParams = {
        "from": "SAFPRO Monitoring <noreply@safpro.us>",
        "to": [ADMIN_EMAIL],
        "subject": f"[SAFPRO] {level_label} — {consecutive_count} jobs fallidos: {user_email}",
        "html": html_body,
    }

    response = resend.Emails.send(params)
    logger.warning(
        "Alerta admin enviada — user=%s consecutive=%d job_id=%s resend_id=%s",
        user_email,
        consecutive_count,
        job_id,
        response.get("id") if isinstance(response, dict) else response,
    )


def send_contact_form_email(
    sender_name: str,
    sender_email: str,
    message: str,
) -> None:
    """
    Reenvía un mensaje del formulario de contacto público a admin@safpro.us.

    Args:
        sender_name  : Nombre del visitante que escribe.
        sender_email : Email del visitante (para poder responderle).
        message      : Contenido del mensaje.
    """
    ADMIN_EMAIL = "admin@safpro.us"
    resend = _get_resend()

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 520px; margin: auto; color: #1a1a2e;">
      <div style="background: linear-gradient(135deg, #1c2b4b, #2d4878); padding: 20px 24px; border-radius: 12px 12px 0 0;">
        <p style="color: #fff; font-size: 13px; margin: 0; opacity: 0.7;">SAFPRO — Formulario de contacto</p>
        <h2 style="color: #ffffff; margin: 4px 0 0 0; font-size: 18px;">Nuevo mensaje de contacto</h2>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px 4px; color: #6b7280; width: 80px;">Nombre</td>
            <td style="padding: 8px 4px; font-weight: 600;">{sender_name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 4px; color: #6b7280;">Email</td>
            <td style="padding: 8px 4px;">
              <a href="mailto:{sender_email}" style="color: #2563eb;">{sender_email}</a>
            </td>
          </tr>
        </table>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin: 0 0 8px 0;">Mensaje:</p>
          <div style="background: #f9fafb; border-left: 3px solid #e05c19; padding: 12px 16px;
                      border-radius: 4px; font-size: 14px; line-height: 1.7; white-space: pre-wrap;">{message}</div>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="font-size: 11px; color: #9ca3af; margin: 0;">
          Responde directamente a este email para contactar al remitente.
        </p>
      </div>
    </div>
    """

    params: resend.Emails.SendParams = {
        "from": "SAFPRO Contacto <noreply@safpro.us>",
        "to": [ADMIN_EMAIL],
        "reply_to": sender_email,
        "subject": f"[Contacto] Mensaje de {sender_name}",
        "html": html_body,
    }

    response = resend.Emails.send(params)
    logger.info(
        "Email de contacto reenviado — from=%s resend_id=%s",
        sender_email,
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

