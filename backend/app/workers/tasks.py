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
import threading
from uuid import UUID

from celery import Task
from sqlalchemy.exc import OperationalError

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _maybe_alert_admin_on_failure(db, user, job, original_filename: str) -> None:
    """
    Comprueba si el usuario tiene 2+ jobs fallidos consecutivos y, si es así,
    envía un email de alerta a admin@safpro.us de forma asíncrona (fire-and-forget).

    Solo se considera el historial de jobs con status 'success' o 'error' para
    calcular la racha de errores — los jobs en 'queued' / 'processing' no interrumpen
    el conteo pero tampoco se incluyen en la ventana de comparación.
    """
    from app.models.processing_job import ProcessingJob as _PJ

    # Últimos 5 jobs terminados de este usuario (más reciente primero)
    recent = (
        db.query(_PJ)
        .filter(
            _PJ.user_id == user.user_id,
            _PJ.status.in_(["success", "error"]),
        )
        .order_by(_PJ.created_at.desc())
        .limit(5)
        .all()
    )

    consecutive = 0
    for j in recent:
        if j.status == "error":
            consecutive += 1
        else:
            break  # racha cortada — el job más reciente no-fallido detiene el conteo

    if consecutive < 2:
        return  # sin alerta necesaria

    # Capturar todos los datos antes de lanzar el thread (la sesión DB se cerrará)
    user_email = user.email
    user_id_str = str(user.user_id)
    job_id_str = str(job.job_id)
    error_msg = (job.error_message or "Sin detalle")[:500]

    logger.warning(
        "ALERT — %d jobs fallidos consecutivos: user_id=%s job_id=%s",
        consecutive,
        user_id_str,
        job_id_str,
    )

    def _send() -> None:
        try:
            from app.services.email_service import send_admin_job_failed_alert
            send_admin_job_failed_alert(
                user_email=user_email,
                user_id=user_id_str,
                job_id=job_id_str,
                filename=original_filename,
                error_message=error_msg,
                consecutive_count=consecutive,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("No se pudo enviar alerta de job fallido: %s", exc)

    threading.Thread(target=_send, daemon=True).start()


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

        # Alerta admin si hay 2+ errores consecutivos para este usuario
        if pipeline_status == "error":
            _maybe_alert_admin_on_failure(db, user, job, original_filename)

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
