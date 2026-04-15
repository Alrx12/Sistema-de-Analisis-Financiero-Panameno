#!/usr/bin/env python3
"""
send_broadcast.py — Email masivo de novedades a todos los usuarios activos de SAFPRO.

Segmentación automática:
  - Usuario sin verificar (email/password, no OAuth) → banner naranja + CTA verificar
  - Usuario sin onboarding completado              → banner azul + CTA completar perfil
  - Usuario activo normal                          → solo el contenido principal

Uso:
  cd ~/safpro/backend
  .venv/bin/python scripts/send_broadcast.py --dry-run     # preview sin enviar
  .venv/bin/python scripts/send_broadcast.py               # envía a todos
  .venv/bin/python scripts/send_broadcast.py --email foo@bar.com  # solo uno (prueba)
"""
from __future__ import annotations

import argparse
import logging
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
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
        logging.FileHandler(LOG_DIR / "broadcast.log"),
    ],
)
log = logging.getLogger(__name__)


# ── Banners personalizados ────────────────────────────────────────────────────

def _banner_unverified(verify_url: str) -> str:
    # URL-encode completo para sobrevivir SafeLinks de Outlook/Hotmail
    # (los JWT son base64url y no necesitan encoding, pero SafeLinks a veces
    #  doble-encodea el '=' de padding — encode_url elimina ese riesgo)
    safe_url = verify_url  # el token ya es base64url (sin = si PyJWT lo omite)
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#fff8e6;border-left:4px solid #e05c19;border-radius:6px;padding:14px 18px;">
          <p style="margin:0 0 4px;font-size:14px;color:#92400e;font-weight:600;">⚠️ Todavía no has verificado tu correo</p>
          <p style="margin:4px 0 10px;font-size:13px;color:#92400e;line-height:1.5;">
            Sin verificar, no puedes subir tus estados de cuenta. Tarda menos de un minuto.
          </p>
          <a href="{safe_url}"
             style="display:inline-block;background:#e05c19;color:#fff;font-size:13px;
                    font-weight:600;padding:8px 18px;border-radius:6px;text-decoration:none;">
            Verificar mi correo →
          </a>
          <p style="margin:10px 0 0;font-size:11px;color:#a16207;word-break:break-all;">
            Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
            {safe_url}
          </p>
        </td>
      </tr>
    </table>
    """


def _banner_onboarding() -> str:
    return """
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:6px;padding:14px 18px;">
          <p style="margin:0 0 4px;font-size:14px;color:#1e40af;font-weight:600;">📋 Tu perfil financiero está incompleto</p>
          <p style="margin:4px 0 10px;font-size:13px;color:#1e40af;line-height:1.5;">
            Con tu perfil completo, SAFPRO ajusta las metas 50/30/20 a tu situación real.
            Son 3 pasos rápidos.
          </p>
          <a href="https://safpro.us"
             style="display:inline-block;background:#1c2b4b;color:#fff;font-size:13px;
                    font-weight:600;padding:8px 18px;border-radius:6px;text-decoration:none;">
            Completar mi perfil →
          </a>
        </td>
      </tr>
    </table>
    """


# ── HTML del email ────────────────────────────────────────────────────────────

def build_email_html(first_name: str, banner_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Novedades en SAFPRO</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
    <tr>
      <td align="center">
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

              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1c2b4b;">Hola, {first_name} 👋</p>

              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                Han pasado algunas semanas desde que entraste al beta de SAFPRO, y hemos estado
                trabajando duro. Queríamos avisarte de todo lo que ya puedes usar — y de algo
                que viene pronto que te va a interesar.
              </p>

              {banner_html}

              <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
                Esto es lo que tienes disponible ahora mismo:
              </p>

              <!-- Feature 1: Presupuesto -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                <tr>
                  <td style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;">
                    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1c2b4b;">📊 Presupuesto personalizado 50/30/20</p>
                    <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.5;">
                      SAFPRO ajusta tus metas según tu situación: si tienes dependientes, si eres independiente,
                      si tienes deudas activas o si trabajas en entretenimiento. No es una fórmula genérica
                      — es tu presupuesto real.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Feature 2: Entrenamiento masivo -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                <tr>
                  <td style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;">
                    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1c2b4b;">🧠 Entrenamiento masivo</p>
                    <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.5;">
                      En lugar de corregir transacción por transacción, ahora puedes ver todos los comercios
                      que el sistema no reconoce, corregirlos en un solo paso y enseñarle todo de golpe.
                      Mientras más lo uses, más preciso se vuelve.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Feature 3: Simulaciones -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                <tr>
                  <td style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;">
                    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1c2b4b;">🔮 Simulaciones</p>
                    <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.5;">
                      ¿Cuántos meses aguanta tu saldo si dejas de trabajar? ¿Cuánto ahorrarías si recortas
                      suscripciones? ¿Cuándo puedes pagar esa deuda? La sección Simulaciones te da esas
                      respuestas con tus datos reales — sin hojas de cálculo manuales.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr><td style="border-top:1px solid #e2e8f0;"></td></tr>
              </table>

              <!-- Recordatorio Excel -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#166534;">💡 ¿Cómo empezar?</p>
                    <p style="margin:0;font-size:14px;color:#166534;line-height:1.5;">
                      Para usar SAFPRO necesitas descargar tu estado de cuenta en Excel directamente
                      desde la banca en línea de tu banco (Banco General, BAC, Banistmo, Banesco o
                      Credicorp Bank). Luego lo subes en la sección <strong>Subir archivo</strong>
                      y el sistema hace todo lo demás.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Coming soon: PayPal -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#1c2b4b;border-radius:10px;padding:20px 24px;">
                    <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#ffffff;">🚀 Próximamente: Plan Pro con PayPal</p>
                    <p style="margin:0 0 14px;font-size:14px;color:#a0b0cc;line-height:1.5;">
                      Muy pronto habilitaremos pagos vía PayPal para el Plan Pro ($5/mes o $45/año).
                      Como parte del grupo de Friends &amp; Family, tú tienes acceso anticipado y completo
                      a todas las funciones mientras tanto — sin costo.
                    </p>
                    <p style="margin:0;font-size:13px;color:#6b7fa3;">
                      Te avisaremos cuando esté activo. No tienes que hacer nada ahora.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr>
                  <td align="center">
                    <a href="https://safpro.us"
                       style="display:inline-block;background:#e05c19;color:#ffffff;font-size:15px;
                              font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
                      Ir a SAFPRO →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;font-size:14px;color:#6b7280;text-align:center;line-height:1.5;">
                Cualquier duda o feedback, responde este correo directamente.<br/>
                — Alexis, <a href="mailto:admin@safpro.us" style="color:#e05c19;text-decoration:none;">admin@safpro.us</a>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f4f5f7;border-radius:0 0 12px 12px;padding:18px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                SAFPRO · <a href="https://safpro.us/terms" style="color:#9ca3af;">Términos</a> ·
                <a href="https://safpro.us/privacy" style="color:#9ca3af;">Privacidad</a>
              </p>
              <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;">
                Alexis Antonio Pineda Del Cid · admin@safpro.us · Panamá
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>"""


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Broadcast de novedades a todos los usuarios activos")
    parser.add_argument("--dry-run", action="store_true", help="Solo imprime la lista, no envía")
    parser.add_argument("--email", help="Enviar solo a este email (para prueba)")
    args = parser.parse_args()

    from app.core.config import settings

    if not settings.resend_api_key:
        log.error("RESEND_API_KEY no configurado en .env")
        sys.exit(1)

    import resend
    resend.api_key = settings.resend_api_key

    frontend_url = settings.frontend_url.rstrip("/")

    # ── Query: todos los usuarios activos (excluye suspendidos y el admin) ──────
    from sqlalchemy import create_engine, text

    engine = create_engine(settings.database_url)
    with engine.connect() as conn:
        if args.email:
            rows = conn.execute(
                text("""
                    SELECT
                        u.user_id, u.email, u.full_name,
                        u.is_verified, u.social_provider,
                        COALESCE(p.onboarding_completed, FALSE) AS onboarding_completed
                    FROM users u
                    LEFT JOIN user_profiles p ON p.user_id = u.user_id
                    WHERE u.email = :email
                      AND u.is_suspended = FALSE
                """),
                {"email": args.email},
            ).fetchall()
        else:
            rows = conn.execute(
                text("""
                    SELECT
                        u.user_id, u.email, u.full_name,
                        u.is_verified, u.social_provider,
                        COALESCE(p.onboarding_completed, FALSE) AS onboarding_completed
                    FROM users u
                    LEFT JOIN user_profiles p ON p.user_id = u.user_id
                    WHERE u.is_suspended = FALSE
                      AND u.is_admin = FALSE
                    ORDER BY u.created_at ASC
                """)
            ).fetchall()

    if not rows:
        log.info("No hay usuarios que cumplan los criterios.")
        return

    # ── Segmentación ──────────────────────────────────────────────────────────
    needs_verify   = [r for r in rows if not r.is_verified and not r.social_provider]
    needs_onboard  = [r for r in rows if r.is_verified and not r.onboarding_completed]
    active         = [r for r in rows if r.is_verified and r.onboarding_completed]

    log.info(f"Total usuarios: {len(rows)}")
    log.info(f"  Sin verificar (banner naranja): {len(needs_verify)}")
    log.info(f"  Sin onboarding (banner azul):   {len(needs_onboard)}")
    log.info(f"  Activos completos:              {len(active)}")

    if args.dry_run:
        log.info("\n[DRY RUN] Lista de destinatarios:")
        for r in rows:
            tag = ""
            if not r.is_verified and not r.social_provider:
                tag = "  ← SIN VERIFICAR"
            elif not r.onboarding_completed:
                tag = "  ← SIN ONBOARDING"
            log.info(f"  {r.email} ({r.full_name or 'sin nombre'}){tag}")

        # Guardar preview HTML de cada variante
        if needs_verify:
            sample = needs_verify[0]
            verify_url = f"{frontend_url}/verify-email?token=PREVIEW_TOKEN"
            html = build_email_html(
                (sample.full_name or sample.email).split()[0],
                _banner_unverified(verify_url),
            )
            p = LOG_DIR / "broadcast_preview_unverified.html"
            p.write_text(html, encoding="utf-8")
            log.info(f"Preview sin verificar: {p}")

        if needs_onboard:
            sample = needs_onboard[0]
            html = build_email_html(
                (sample.full_name or sample.email).split()[0],
                _banner_onboarding(),
            )
            p = LOG_DIR / "broadcast_preview_onboarding.html"
            p.write_text(html, encoding="utf-8")
            log.info(f"Preview sin onboarding: {p}")

        if active:
            sample = active[0]
            html = build_email_html(
                (sample.full_name or sample.email).split()[0],
                "",
            )
            p = LOG_DIR / "broadcast_preview_active.html"
            p.write_text(html, encoding="utf-8")
            log.info(f"Preview activo: {p}")

        log.info("\n[DRY RUN] Nada enviado. Corre sin --dry-run para enviar.")
        return

    # ── Generar token de verificación para usuarios sin verificar ─────────────
    import jwt as _jwt

    SECRET_KEY = settings.secret_key
    ALGORITHM  = settings.algorithm

    sent = failed = 0

    for row in rows:
        try:
            first_name = (row.full_name or row.email).split()[0]

            # Determinar banner
            if not row.is_verified and not row.social_provider:
                exp = datetime.now(timezone.utc) + timedelta(hours=72)
                token = _jwt.encode(
                    {"sub": str(row.user_id), "type": "email_verification", "exp": exp},
                    SECRET_KEY,
                    algorithm=ALGORITHM,
                )
                # URL-encode el token para que SafeLinks (Outlook/Hotmail) no lo corrompa
                token_encoded = urllib.parse.quote(token, safe="")
                verify_url = f"{frontend_url}/verify-email?token={token_encoded}"
                banner = _banner_unverified(verify_url)
            elif not row.onboarding_completed:
                banner = _banner_onboarding()
            else:
                banner = ""

            html = build_email_html(first_name, banner)

            params: resend.Emails.SendParams = {
                "from": settings.email_from,
                "to": [row.email],
                "reply_to": ["admin@safpro.us"],
                "subject": "Novedades en SAFPRO — y algo que viene pronto 🚀",
                "html": html,
            }

            response = resend.Emails.send(params)
            log.info(f"✅ {row.email} — id: {getattr(response, 'id', response)}")
            sent += 1

        except Exception as exc:
            log.error(f"❌ Falló {row.email}: {exc}")
            failed += 1

    log.info(f"\nResumen: {sent} enviados, {failed} fallidos de {len(rows)} usuarios.")


if __name__ == "__main__":
    main()
