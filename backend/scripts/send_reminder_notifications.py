#!/usr/bin/env python3
"""
Script de recordatorios push — SAFPRO
======================================
Envía notificaciones push de recordatorio a usuarios que llevan
tiempo sin subir su estado de cuenta.

Lógica:
  - Usuarios SIN ningún upload:
    → Recordatorio en los días 3, 5, 8, 15, 22 desde el registro
    → Se detiene después del día 22 para no spamear

  - Usuarios CON uploads previos pero inactivos:
    → Recordatorio cuando llevan 15, 30, 45 días sin subir
    → Se detiene después de 45 días

Este script debe correr vía cron preferiblemente de noche (8 PM Panama = 01:00 UTC)
y los fines de semana. Ejemplo de cron:

    # Recordatorios nocturnos Panama (01:00 UTC = 20:00 UTC-5), lunes a viernes:
    0 1 * * 1-5 cd ~/safpro/backend && .venv/bin/python scripts/send_reminder_notifications.py --quiet >> storage/logs/reminders.log 2>&1

    # Recordatorios adicionales en fines de semana (sábado/domingo Panama 8 PM y 10 PM):
    0 1,3 * * 6,0 cd ~/safpro/backend && .venv/bin/python scripts/send_reminder_notifications.py --quiet >> storage/logs/reminders.log 2>&1

Uso:
    python scripts/send_reminder_notifications.py           # normal (imprime resultados)
    python scripts/send_reminder_notifications.py --dry-run # solo muestra quién recibiría
    python scripts/send_reminder_notifications.py --quiet   # solo errores en stderr
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime, timezone

# ── Setup de path para importar el backend ──────────────────────────────────
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("APP_ENV", "production")

# ── Imports del proyecto ─────────────────────────────────────────────────────
from app.core.database import SessionLocal                          # noqa: E402
from app.models.user import User                                    # noqa: E402
from app.models.uploaded_file import UploadedFile                   # noqa: E402
from app.services.push_notification_service import (                # noqa: E402
    notify_reminder_no_uploads,
    notify_reminder_inactive,
    _is_valid_expo_token,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("safpro.reminders")

# Días desde el registro en los que recordamos a usuarios sin uploads
NO_UPLOAD_REMIND_DAYS = {3, 5, 8, 15, 22}

# Días desde el último upload en los que recordamos a usuarios inactivos
HAS_UPLOAD_REMIND_DAYS = {15, 30, 45}


def days_since(dt: datetime) -> int:
    """Días completos desde una fecha (timezone-aware o naive)."""
    if dt.tzinfo is not None:
        today = datetime.now(timezone.utc).date()
        return (today - dt.astimezone(timezone.utc).date()).days
    else:
        today = datetime.utcnow().date()
        return (today - dt.date()).days


def run(dry_run: bool = False, quiet: bool = False) -> None:
    if quiet:
        logger.setLevel(logging.WARNING)

    db = SessionLocal()
    sent = 0
    skipped = 0

    try:
        # Cargar todos los usuarios con token push válido y no suspendidos
        users = (
            db.query(User)
            .filter(
                User.expo_push_token.isnot(None),
                User.is_suspended.is_(False),
            )
            .all()
        )

        logger.info("Usuarios con push token: %d", len(users))

        for user in users:
            token = user.expo_push_token
            if not _is_valid_expo_token(token):
                skipped += 1
                continue

            # Determinar el último upload del usuario
            last_upload = (
                db.query(UploadedFile)
                .filter(UploadedFile.user_id == user.user_id)
                .order_by(UploadedFile.uploaded_at.desc())
                .first()
            )

            if last_upload is None:
                # Usuario sin ningún upload todavía
                reg_days = days_since(user.created_at)
                if reg_days in NO_UPLOAD_REMIND_DAYS:
                    logger.info(
                        "Recordatorio (sin uploads) → %s (día %d desde registro)",
                        user.email, reg_days,
                    )
                    if not dry_run:
                        notify_reminder_no_uploads(token)  # type: ignore[arg-type]
                    sent += 1
                else:
                    skipped += 1

            else:
                # Usuario con uploads: ¿cuánto lleva sin subir?
                inactive_days = days_since(last_upload.uploaded_at)
                if inactive_days in HAS_UPLOAD_REMIND_DAYS:
                    logger.info(
                        "Recordatorio (inactivo %d días) → %s",
                        inactive_days, user.email,
                    )
                    if not dry_run:
                        notify_reminder_inactive(token, inactive_days)  # type: ignore[arg-type]
                    sent += 1
                else:
                    skipped += 1

    finally:
        db.close()

    mode = "[DRY RUN] " if dry_run else ""
    logger.info(
        "%sRecordatorios finalizados — enviados: %d | sin acción: %d",
        mode, sent, skipped,
    )
    if not quiet:
        print(f"{mode}Recordatorios enviados: {sent} | Sin acción: {skipped}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Enviar recordatorios push a usuarios inactivos")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra quién recibiría, sin enviar")
    parser.add_argument("--quiet",   action="store_true", help="Solo imprime errores")
    args = parser.parse_args()
    run(dry_run=args.dry_run, quiet=args.quiet)


if __name__ == "__main__":
    main()
