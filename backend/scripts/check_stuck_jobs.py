#!/usr/bin/env python3
"""
check_stuck_jobs.py — Detecta y limpia jobs de Celery bloqueados en status="processing".

Un job se considera "bloqueado" si lleva más de STUCK_THRESHOLD_MINUTES en status="processing"
sin completarse. Esto ocurre cuando el worker Celery muere o falla silenciosamente.

Acción: marca el job como "error" con mensaje claro para que el usuario pueda reintentar.

Uso:
    python scripts/check_stuck_jobs.py               # solo detectar (dry-run)
    python scripts/check_stuck_jobs.py --fix         # detectar y marcar como error
    python scripts/check_stuck_jobs.py --fix --quiet # sin output (para cron)

Cron recomendado (cada 15 minutos):
    */15 * * * * cd /home/lex/safpro/backend && .venv/bin/python scripts/check_stuck_jobs.py --fix --quiet >> storage/logs/stuck_jobs.log 2>&1
"""

import argparse
import sys
import os
from datetime import datetime, timezone, timedelta

# Permite correr el script desde el directorio backend/ sin instalar el paquete
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.processing_job import ProcessingJob

# ── Configuración ──────────────────────────────────────────────────────────────
STUCK_THRESHOLD_MINUTES = 10   # job en "processing" por más de este tiempo = bloqueado
ERROR_MESSAGE = (
    "El procesamiento tardó demasiado y fue cancelado automáticamente. "
    "Puedes volver a subir el archivo."
)

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def find_stuck_jobs(session: Session, threshold_minutes: int = STUCK_THRESHOLD_MINUTES) -> list[ProcessingJob]:
    """Devuelve jobs en status='processing' que llevan más de threshold_minutes sin completarse."""
    cutoff = now_utc() - timedelta(minutes=threshold_minutes)

    stuck = (
        session.query(ProcessingJob)
        .filter(
            ProcessingJob.status == "processing",
            ProcessingJob.started_at != None,          # noqa: E711
            ProcessingJob.started_at < cutoff,
        )
        .all()
    )

    # También detectar jobs en "queued" muy viejos (worker muerto antes de tomar el job)
    queued_cutoff = now_utc() - timedelta(minutes=threshold_minutes * 3)
    stuck_queued = (
        session.query(ProcessingJob)
        .filter(
            ProcessingJob.status == "queued",
            ProcessingJob.created_at < queued_cutoff,
        )
        .all()
    )

    return stuck + stuck_queued


def fix_stuck_jobs(session: Session, jobs: list[ProcessingJob], quiet: bool = False) -> int:
    """Marca los jobs bloqueados como 'error'. Devuelve el número de jobs fijados."""
    fixed = 0
    for job in jobs:
        if not quiet:
            age_minutes = int((now_utc() - (job.started_at or job.created_at).replace(tzinfo=timezone.utc)).total_seconds() / 60)
            print(
                f"  [FIX] job_id={job.job_id} user_id={job.user_id} "
                f"status={job.status} age={age_minutes}min file={job.original_filename}"
            )
        job.status = "error"
        job.error_message = ERROR_MESSAGE
        job.completed_at = now_utc()
        fixed += 1

    if fixed > 0:
        session.commit()

    return fixed


def main() -> None:
    parser = argparse.ArgumentParser(description="Detecta y limpia jobs de Celery bloqueados.")
    parser.add_argument("--fix",   action="store_true", help="Marcar jobs bloqueados como error (sin este flag solo detecta)")
    parser.add_argument("--quiet", action="store_true", help="Suprimir output normal (útil para cron)")
    parser.add_argument("--threshold", type=int, default=STUCK_THRESHOLD_MINUTES,
                        help=f"Minutos antes de considerar un job como bloqueado (default: {STUCK_THRESHOLD_MINUTES})")
    args = parser.parse_args()

    engine = create_engine(settings.database_url)
    with Session(engine) as session:
        stuck = find_stuck_jobs(session, threshold_minutes=args.threshold)

        if not stuck:
            if not args.quiet:
                print(f"[{now_utc().strftime('%Y-%m-%d %H:%M:%S UTC')}] No hay jobs bloqueados.")
            sys.exit(0)

        if not args.quiet:
            print(f"[{now_utc().strftime('%Y-%m-%d %H:%M:%S UTC')}] Jobs bloqueados encontrados: {len(stuck)}")
            for job in stuck:
                age = (now_utc() - (job.started_at or job.created_at).replace(tzinfo=timezone.utc))
                print(
                    f"  job_id={job.job_id} user_id={job.user_id} "
                    f"status={job.status} age={int(age.total_seconds()//60)}min "
                    f"file={job.original_filename}"
                )

        if args.fix:
            fixed = fix_stuck_jobs(session, stuck, quiet=args.quiet)
            if not args.quiet:
                print(f"  → {fixed} job(s) marcado(s) como error.")
            # Exit code 2 cuando se fijaron jobs (útil para alertas en cron)
            sys.exit(2 if fixed > 0 else 0)
        else:
            if not args.quiet:
                print("  (dry-run — usa --fix para marcarlos como error)")
            sys.exit(1 if stuck else 0)


if __name__ == "__main__":
    main()
