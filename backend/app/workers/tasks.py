"""
Tareas Celery de SAFPRO.

Tarea principal:
  process_file_task(file_path, original_filename, user_id, job_id)
    → Procesa un estado de cuenta bancario de forma asíncrona.

Política de reintentos:
  - Errores de negocio (archivo inválido, parser fallido, múltiples cuentas)
    → NO se reintenta. El job queda en "error" con mensaje descriptivo.
  - Errores transitorios (DB connection lost, Redis down mid-task)
    → Se reintenta máx. 3 veces con backoff: 30s / 60s / 120s.
"""
from __future__ import annotations

import logging
from uuid import UUID

from celery import Task
from sqlalchemy.exc import OperationalError

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="safpro.process_file",
    max_retries=3,
    default_retry_delay=30,
)
def process_file_task(
    self: Task,
    file_path: str,
    original_filename: str,
    user_id: str,
    job_id: str,
    content_hash: str | None = None,
    file_size: int | None = None,
) -> dict:
    """
    Ejecuta el pipeline de procesamiento de archivo en un worker Celery.

    Args:
        file_path       : Ruta al archivo temporal guardado en storage/temp/
        original_filename: Nombre original del archivo subido por el usuario
        user_id         : UUID del usuario como string
        job_id          : UUID del ProcessingJob ya creado (status="queued")

    Returns:
        {"job_id": str, "status": "success" | "error"}
    """
    # Imports locales para evitar import circular al cargar el módulo
    from app.core.database import SessionLocal
    from app.models.processing_job import ProcessingJob
    from app.models.user import User
    from app.services.processing_service import ProcessingService

    logger.info("Iniciando process_file_task — job_id=%s user_id=%s", job_id, user_id)

    db = SessionLocal()
    try:
        user = db.get(User, UUID(user_id))
        if user is None:
            logger.error("Usuario no encontrado — user_id=%s job_id=%s", user_id, job_id)
            return {"job_id": job_id, "status": "error", "detail": "usuario_no_encontrado"}

        job = db.get(ProcessingJob, UUID(job_id))
        if job is None:
            logger.error("Job no encontrado — job_id=%s", job_id)
            return {"job_id": job_id, "status": "error", "detail": "job_no_encontrado"}

        from app.services.analytics_service import track_event

        svc = ProcessingService(db)
        analysis = svc.run_pipeline(
            job=job,
            file_path=file_path,
            current_user=user,
            content_hash=content_hash,
            file_size=file_size,
        )

        pipeline_status = "success" if analysis is not None else "error"
        logger.info("process_file_task finalizado — job_id=%s status=%s", job_id, pipeline_status)

        track_event(
            user_id=UUID(user_id),
            event_type=f"job_{pipeline_status}",
            plan=getattr(user, "plan", None),
            metadata={"job_id": job_id, "filename": original_filename},
        )

        return {"job_id": job_id, "status": pipeline_status}

    except OperationalError as exc:
        # Error transitorio de DB — reintentamos
        logger.warning(
            "Error transitorio de DB en process_file_task — job_id=%s intento=%d/%d: %s",
            job_id, self.request.retries + 1, self.max_retries, exc,
        )
        raise self.retry(exc=exc, countdown=30 * (2 ** self.request.retries))

    except Exception as exc:
        # Error inesperado — loguear pero no reintentar (puede ser un bug)
        logger.exception(
            "Error inesperado en process_file_task — job_id=%s: %s", job_id, exc
        )
        return {"job_id": job_id, "status": "error", "detail": str(exc)[:200]}

    finally:
        db.close()
