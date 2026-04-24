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

def send_password_changed_email(to_email: str, full_name: str) -> None:
    """
    Envía un aviso de seguridad al usuario cuando su contraseña fue cambiada exitosamente.
    Si el usuario no realizó el cambio, debe contactar soporte de inmediato.
    """
    from app.core.config import settings

    resend = _get_resend()

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: auto; background: #ffffff; padding: 24px; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 36px;">🔐</span>
        <h2 style="color: #1c2b4b; margin: 8px 0;">Contraseña actualizada</h2>
      </div>
      <p style="color: #374151;">Hola {full_name},</p>
      <p style="color: #374151;">
        Tu contraseña de <strong>SAFPRO</strong> fue cambiada exitosamente.
        Si realizaste este cambio, no necesitas hacer nada más.
      </p>
      <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0; color: #92400e; font-weight: 600;">
          ⚠️ Si NO realizaste este cambio, actúa de inmediato:
        </p>
        <ul style="color: #92400e; margin: 8px 0; padding-left: 20px;">
          <li>Usa "¿Olvidaste tu contraseña?" para recuperar el acceso</li>
          <li>Contacta soporte en <a href="mailto:admin@safpro.us" style="color: #e05c19;">admin@safpro.us</a></li>
        </ul>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        SAFPRO — Sistema de Análisis Financiero Pro
      </p>
    </div>
    """

    params = {
        "from": settings.email_from,
        "to": [to_email],
        "subject": "⚠️ Tu contraseña de SAFPRO fue cambiada",
        "html": html_body,
    }

    try:
        response = resend.Emails.send(params)
        logger.info(
            "Email de cambio de contraseña enviado — to=%s resend_id=%s",
            to_email,
            response.get("id") if isinstance(response, dict) else response,
        )
    except Exception as exc:
        logger.error("Error enviando email de cambio de contraseña — to=%s err=%s", to_email, exc)


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


# ── Admin broadcast ───────────────────────────────────────────────────────────

def _wrap_broadcast_body(first_name: str, body_html: str) -> str:
    """Envuelve el cuerpo HTML del admin en el template SAFPRO navy/naranja."""
    # Convertir saltos de línea planos en párrafos si el admin escribió texto plano
    if "<p" not in body_html and "<br" not in body_html:
        paragraphs = [
            f'<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">{line.strip()}</p>'
            for line in body_html.split("\n")
            if line.strip()
        ]
        body_html = "\n".join(paragraphs)

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1c2b4b;border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
            <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:1px;">SAFPRO</span>
            <span style="font-size:13px;color:#a0b0cc;display:block;margin-top:4px;">Sistema de Análisis Financiero</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:36px 40px;">
            <p style="margin:0 0 20px;font-size:18px;font-weight:600;color:#1c2b4b;">Hola, {first_name} 👋</p>
            {body_html}
            <div style="margin-top:28px;text-align:center;">
              <a href="https://safpro.us"
                 style="display:inline-block;background:#e05c19;color:#ffffff;font-size:15px;
                        font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;">
                Ir a SAFPRO →
              </a>
            </div>
            <p style="margin:24px 0 0;font-size:13px;color:#6b7280;text-align:center;">
              — Alexis,
              <a href="mailto:admin@safpro.us" style="color:#e05c19;text-decoration:none;">admin@safpro.us</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f4f5f7;border-radius:0 0 12px 12px;padding:18px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              SAFPRO ·
              <a href="https://safpro.us/terms" style="color:#9ca3af;">Términos</a> ·
              <a href="https://safpro.us/privacy" style="color:#9ca3af;">Privacidad</a>
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;">
              Alexis Antonio Pineda Del Cid · admin@safpro.us · Panamá
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def send_admin_broadcast_email(
    to_email: str,
    full_name: str | None,
    subject: str,
    body_html: str,
) -> str:
    """
    Envía un email broadcast compuesto por el admin, envuelto en el template SAFPRO.

    Returns:
        Resend email id.
    Raises:
        Exception si falla el envío.
    """
    from app.core.config import settings

    resend = _get_resend()
    first_name = (full_name or to_email).split()[0]
    html = _wrap_broadcast_body(first_name, body_html)

    params: dict = {
        "from": settings.email_from,
        "to": [to_email],
        "reply_to": ["admin@safpro.us"],
        "subject": subject,
        "html": html,
    }

    response = resend.Emails.send(params)
    rid = response.get("id") if isinstance(response, dict) else getattr(response, "id", str(response))
    logger.info("broadcast_email to=%s resend_id=%s", to_email, rid)
    return str(rid)


# ── Field label mapping for profile change emails ─────────────────────────────
_FIELD_LABELS: dict[str, str] = {
    "expected_monthly_income": "Ingreso mensual esperado",
    "industry": "Industria / sector",
    "pets_count": "Número de mascotas",
    "has_pets": "¿Tiene mascotas?",
    "dependents_count": "Número de dependientes",
    "housing_type": "Tipo de vivienda",
    "employment_type": "Tipo de empleo",
    "monthly_debt_payments": "Pagos mensuales de deuda",
    "financial_goals": "Metas financieras",
}


def send_profile_changed_email(
    to_email: str,
    full_name: str,
    changes: list[dict],
) -> None:
    """
    Notifica al usuario que su perfil financiero fue modificado.

    Args:
        to_email  : Email del usuario.
        full_name : Nombre completo del usuario.
        changes   : Lista de dicts con keys: field_name, old_value, new_value.
                    Ejemplo: [{"field_name": "industry", "old_value": "otro", "new_value": "entretenimiento"}]
    """
    from app.core.config import settings
    import threading

    def _send() -> None:
        try:
            resend = _get_resend()
            name_display = (full_name or to_email).split()[0]

            # Build change rows table
            rows_html = ""
            for change in changes:
                field = change.get("field_name", "")
                old_val = change.get("old_value") or "—"
                new_val = change.get("new_value") or "—"
                label = _FIELD_LABELS.get(field, field.replace("_", " ").capitalize())
                rows_html += f"""
                <tr>
                  <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;width:45%;">
                    {label}
                  </td>
                  <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;
                             text-decoration:line-through;color:#9ca3af;">
                    {old_val}
                  </td>
                  <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;
                             font-weight:700;color:#10b981;">
                    {new_val}
                  </td>
                </tr>"""

            html_body = f"""
            <div style="font-family:sans-serif;max-width:560px;margin:auto;background:#ffffff;
                        border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

              <!-- Header -->
              <div style="background:linear-gradient(135deg,#1c2b4b,#2d4878);padding:28px 24px;">
                <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);
                            border-radius:8px;padding:5px 12px;margin-bottom:14px;">
                  <span style="color:#fff;font-size:15px;font-weight:800;letter-spacing:1px;">SAFPRO</span>
                </div>
                <h2 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">
                  Perfil financiero actualizado
                </h2>
              </div>

              <!-- Body -->
              <div style="padding:28px 24px;">
                <p style="color:#374151;font-size:15px;margin-top:0;">
                  Hola <strong>{name_display}</strong>,
                </p>
                <p style="color:#374151;font-size:14px;">
                  Se realizaron cambios en tu perfil financiero de SAFPRO.
                  Estos cambios afectan tus metas de presupuesto personalizadas (50/30/20)
                  y las recomendaciones que recibirás.
                </p>

                <!-- Changes table -->
                <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:20px 0;">
                  <div style="background:#f8fafc;padding:10px 14px;border-bottom:1px solid #e2e8f0;">
                    <span style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">
                      Cambios registrados
                    </span>
                  </div>
                  <table style="width:100%;border-collapse:collapse;">
                    <thead>
                      <tr style="background:#f8fafc;">
                        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#94a3b8;font-weight:600;border-bottom:1px solid #e2e8f0;">CAMPO</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#94a3b8;font-weight:600;border-bottom:1px solid #e2e8f0;">ANTES</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#94a3b8;font-weight:600;border-bottom:1px solid #e2e8f0;">AHORA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows_html}
                    </tbody>
                  </table>
                </div>

                <!-- Security note -->
                <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;
                            padding:14px 16px;margin-top:16px;">
                  <p style="margin:0;font-size:13px;color:#92400e;">
                    <strong>⚠️ Si no realizaste estos cambios</strong>, contacta soporte inmediatamente en
                    <a href="mailto:admin@safpro.us" style="color:#e05c19;font-weight:700;">admin@safpro.us</a>
                  </p>
                </div>
              </div>

              <!-- Footer -->
              <div style="background:#f8fafc;padding:16px 24px;border-top:1px solid #e2e8f0;text-align:center;">
                <p style="font-size:11px;color:#94a3b8;margin:0;">
                  SAFPRO · Sistema de Análisis Financiero Pro · Panamá
                </p>
              </div>
            </div>
            """

            params: dict = {
                "from": settings.email_from,
                "to": [to_email],
                "subject": "⚙️ Tu perfil financiero en SAFPRO fue actualizado",
                "html": html_body,
            }

            response = resend.Emails.send(params)
            rid = response.get("id") if isinstance(response, dict) else response
            logger.info("profile_changed_email sent to=%s resend_id=%s fields=%s",
                        to_email, rid, [c.get("field_name") for c in changes])
        except Exception as exc:
            logger.error("Error enviando profile_changed_email to=%s err=%s", to_email, exc)

    threading.Thread(target=_send, daemon=True).start()

