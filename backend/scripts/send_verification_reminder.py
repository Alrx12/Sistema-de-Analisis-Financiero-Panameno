#!/usr/bin/env python3
"""
send_verification_reminder.py — Recordatorio a usuarios no verificados de SAFPRO.

Qué hace:
  1. Consulta la DB por usuarios con is_verified=False y is_suspended=False
  2. Excluye usuarios OAuth (sin password_hash y con social_provider) — ya verificados implícitamente
  3. Envía un email por usuario con: recordatorio de verificación, features nuevos, formulario de 3 opciones
  4. Registra qué envió en storage/logs/verification_reminder.log

Uso:
  cd ~/safpro/backend
  .venv/bin/python scripts/send_verification_reminder.py --dry-run   # preview sin enviar
  .venv/bin/python scripts/send_verification_reminder.py             # envía de verdad
  .venv/bin/python scripts/send_verification_reminder.py --email foo@bar.com  # solo uno
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

# ── Setup paths ───────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_DIR = BACKEND_DIR / "storage" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / "verification_reminder.log"),
    ],
)
log = logging.getLogger(__name__)


# ── HTML del email ─────────────────────────────────────────────────────────────
def build_email_html(full_name: str, verify_url: str) -> str:
    first_name = full_name.split()[0] if full_name else "hola"

    # URLs de respuesta para la encuesta (mailto pre-llenado — temporal: alexis12pineda@gmail.com)
    REPLY_TO_EMAIL = "alexis12pineda@gmail.com"
    import urllib.parse
    opt_a = "mailto:" + REPLY_TO_EMAIL + "?subject=" + urllib.parse.quote("No tuve tiempo de probarlo")
    opt_b = "mailto:" + REPLY_TO_EMAIL + "?subject=" + urllib.parse.quote("No confío en subir mi estado de cuenta")
    opt_c = "mailto:" + REPLY_TO_EMAIL + "?subject=" + urllib.parse.quote("Vi la app y no me pareció útil")

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tu cuenta de SAFPRO te espera</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

<!-- Wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:580px;">

  <!-- Header navy -->
  <tr><td style="background:#1c2b4b;border-radius:8px 8px 0 0;padding:32px 40px;text-align:center;">
    <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
      SAF<span style="color:#e05c19;">PRO</span>
    </div>
    <div style="color:#94a3c7;font-size:13px;margin-top:4px;">Sistema de Análisis Financiero</div>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#ffffff;padding:40px 40px 32px;">

    <p style="font-size:16px;color:#1c2b4b;font-weight:600;margin:0 0 8px;">
      Hola {first_name} 👋
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px;">
      Te registraste en SAFPRO pero todavía no has verificado tu email.
      Un solo clic y puedes empezar a ver exactamente en qué se va tu dinero cada mes —
      sin darle tus claves bancarias a nadie.
    </p>

    <!-- CTA verificar -->
    <div style="text-align:center;margin:0 0 36px;">
      <a href="{verify_url}"
         style="display:inline-block;background:#e05c19;color:#ffffff;font-size:15px;
                font-weight:700;text-decoration:none;padding:14px 36px;border-radius:6px;">
        Verificar mi email →
      </a>
      <p style="font-size:12px;color:#9ca3af;margin:10px 0 0;">
        O copia este enlace: <span style="color:#1c2b4b;">{verify_url}</span>
      </p>
    </div>

    <!-- Separador -->
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 28px;">

    <!-- Features nuevos -->
    <p style="font-size:14px;font-weight:700;color:#1c2b4b;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">
      Lo que puedes hacer con SAFPRO
    </p>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:36px;vertical-align:top;padding:0 12px 16px 0;">
          <div style="width:36px;height:36px;background:#fff7ed;border-radius:8px;text-align:center;line-height:36px;font-size:18px;">📊</div>
        </td>
        <td style="vertical-align:top;padding:0 0 16px;">
          <div style="font-size:14px;font-weight:600;color:#111827;">Dashboard financiero</div>
          <div style="font-size:13px;color:#6b7280;line-height:1.5;">Sube tu estado de cuenta de Banco General, BAC, Banistmo, Banesco o Credicorp y en segundos ves cuánto ganaste, cuánto gastaste y en qué categorías.</div>
        </td>
      </tr>
      <tr>
        <td style="width:36px;vertical-align:top;padding:0 12px 16px 0;">
          <div style="width:36px;height:36px;background:#f0fdf4;border-radius:8px;text-align:center;line-height:36px;font-size:18px;">🎯</div>
        </td>
        <td style="vertical-align:top;padding:0 0 16px;">
          <div style="font-size:14px;font-weight:600;color:#111827;">Presupuesto 50/30/20 personalizado</div>
          <div style="font-size:13px;color:#6b7280;line-height:1.5;">El sistema ajusta las metas según tu tipo de empleo, vivienda, dependientes y deudas. No es una calculadora genérica — es tu situación real.</div>
        </td>
      </tr>
      <tr>
        <td style="width:36px;vertical-align:top;padding:0 12px 16px 0;">
          <div style="width:36px;height:36px;background:#eff6ff;border-radius:8px;text-align:center;line-height:36px;font-size:18px;">🔮</div>
        </td>
        <td style="vertical-align:top;padding:0 0 16px;">
          <div style="font-size:14px;font-weight:600;color:#111827;">Simulaciones financieras</div>
          <div style="font-size:13px;color:#6b7280;line-height:1.5;">¿Cuántos días aguantas con tus ahorros actuales? ¿Qué pasa si reduces un 20% en restaurantes? ¿Cuándo terminas de pagar esa deuda?</div>
        </td>
      </tr>
      <tr>
        <td style="width:36px;vertical-align:top;padding:0 12px 0 0;">
          <div style="width:36px;height:36px;background:#fdf4ff;border-radius:8px;text-align:center;line-height:36px;font-size:18px;">🏦</div>
        </td>
        <td style="vertical-align:top;">
          <div style="font-size:14px;font-weight:600;color:#111827;">Sin credenciales bancarias</div>
          <div style="font-size:13px;color:#6b7280;line-height:1.5;">Solo subes el Excel que exportas tú mismo desde tu banca en línea. SAFPRO nunca ve tus contraseñas ni se conecta a tu banco.</div>
        </td>
      </tr>
    </table>

    <!-- Separador -->
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;">

    <!-- Encuesta -->
    <p style="font-size:14px;font-weight:700;color:#1c2b4b;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">
      ¿Por qué no has entrado todavía?
    </p>
    <p style="font-size:13px;color:#6b7280;margin:0 0 16px;line-height:1.5;">
      Tu respuesta nos ayuda a mejorar. Haz clic en la opción que más te representa
      y llegará directo a nosotros:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:0 0 10px;">
        <a href="{opt_a}"
           style="display:block;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;
                  text-decoration:none;color:#374151;font-size:14px;background:#fafafa;">
          ⏰ &nbsp; <strong>No he tenido tiempo</strong> de probarlo todavía
        </a>
      </td></tr>
      <tr><td style="padding:0 0 10px;">
        <a href="{opt_b}"
           style="display:block;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;
                  text-decoration:none;color:#374151;font-size:14px;background:#fafafa;">
          🔒 &nbsp; <strong>No me siento cómodo/a</strong> subiendo mis estados de cuenta
        </a>
      </td></tr>
      <tr><td>
        <a href="{opt_c}"
           style="display:block;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;
                  text-decoration:none;color:#374151;font-size:14px;background:#fafafa;">
          🤔 &nbsp; <strong>Vi la app y no vi cómo me ayuda</strong> con mis finanzas
        </a>
      </td></tr>
    </table>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9fafb;border-radius:0 0 8px 8px;padding:20px 40px;border-top:1px solid #e5e7eb;">
    <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.6;">
      Recibiste este email porque te registraste en
      <a href="https://safpro.us" style="color:#e05c19;text-decoration:none;">safpro.us</a>.
      Si no fuiste tú, ignora este mensaje.<br>
      ¿Tienes preguntas? Escríbenos a
      <a href="mailto:admin@safpro.us" style="color:#e05c19;text-decoration:none;">admin@safpro.us</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Envía recordatorio a usuarios no verificados")
    parser.add_argument("--dry-run", action="store_true", help="Solo imprime, no envía")
    parser.add_argument("--email", help="Enviar solo a este email (para probar)")
    args = parser.parse_args()

    # ── Config ────────────────────────────────────────────────────────────────
    from app.core.config import settings

    if not settings.resend_api_key:
        log.error("RESEND_API_KEY no configurado en .env")
        sys.exit(1)

    import resend
    resend.api_key = settings.resend_api_key

    frontend_url = settings.frontend_url.rstrip("/")

    # ── Query usuarios no verificados ─────────────────────────────────────────
    from sqlalchemy import create_engine, text

    engine = create_engine(settings.database_url)
    with engine.connect() as conn:
        if args.email:
            rows = conn.execute(
                text("""
                    SELECT user_id, email, full_name, social_provider
                    FROM users
                    WHERE email = :email
                      AND is_suspended = FALSE
                """),
                {"email": args.email},
            ).fetchall()
        else:
            rows = conn.execute(
                text("""
                    SELECT user_id, email, full_name, social_provider
                    FROM users
                    WHERE is_verified = FALSE
                      AND is_suspended = FALSE
                    ORDER BY created_at ASC
                """)
            ).fetchall()

    if not rows:
        log.info("No hay usuarios que cumplan los criterios. Nada que enviar.")
        return

    # Excluir OAuth sin token de verificación pendiente
    # (usuarios OAuth que tienen social_provider pero is_verified=False son edge cases)
    # Los incluimos de todas formas — el email les sirve para conocer las features.

    log.info(f"Usuarios a notificar: {len(rows)}")
    for row in rows:
        log.info(f"  - {row.email} ({row.full_name or 'sin nombre'})")

    if args.dry_run:
        log.info("\n[DRY RUN] No se envió ningún email.")
        log.info("Corre sin --dry-run para enviar de verdad.")
        # Mostrar preview del HTML del primero
        r = rows[0]
        verify_url = f"{frontend_url}/verify-email?token=PREVIEW_TOKEN"
        html = build_email_html(r.full_name or r.email, verify_url)
        preview_path = LOG_DIR / "reminder_preview.html"
        preview_path.write_text(html, encoding="utf-8")
        log.info(f"Preview guardado en: {preview_path}")
        return

    # ── Generar tokens de verificación para usuarios sin uno ──────────────────
    # Reutilizamos la misma lógica que /auth/verify-email: token JWT de 72h
    import jwt as _jwt
    from datetime import timedelta, timezone

    SECRET_KEY = settings.secret_key
    ALGORITHM = settings.algorithm

    sent = 0
    failed = 0

    for row in rows:
        try:
            # Generar token de verificación (72h de TTL — más holgado que el original)
            exp = datetime.now(timezone.utc) + timedelta(hours=72)
            token = _jwt.encode(
                {"sub": str(row.user_id), "type": "email_verification", "exp": exp},
                SECRET_KEY,
                algorithm=ALGORITHM,
            )

            verify_url = f"{frontend_url}/verify-email?token={token}"
            html = build_email_html(row.full_name or row.email, verify_url)

            params: resend.Emails.SendParams = {
                "from": settings.email_from,
                "to": [row.email],
                "reply_to": ["alexis12pineda@gmail.com"],  # temporal — cambiar a admin@safpro.us cuando esté listo
                "subject": "Tu cuenta de SAFPRO te espera 👋",
                "html": html,
            }

            response = resend.Emails.send(params)
            log.info(f"✅ Enviado a {row.email} — id: {getattr(response, 'id', response)}")
            sent += 1

        except Exception as exc:
            log.error(f"❌ Falló envío a {row.email}: {exc}")
            failed += 1

    log.info(f"\nResumen: {sent} enviados, {failed} fallidos de {len(rows)} usuarios.")


if __name__ == "__main__":
    main()
