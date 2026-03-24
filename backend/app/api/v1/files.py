import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.job import JobQueuedResponse
from app.services.file_service import FileService
from app.services.processing_service import ProcessingService
from app.workers.tasks import process_file_task

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/upload",
    response_model=JobQueuedResponse,
    status_code=202,
    summary="Subir estado de cuenta bancario",
    description=(
        "Sube un estado de cuenta (CSV/XLS/XLSX). "
        "El archivo se encola para procesamiento asíncrono. "
        "Usa GET /jobs/{job_id} para consultar el progreso. "
        "Cuando el job esté en 'success', usa GET /analysis para ver los resultados."
    ),
)
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobQueuedResponse:
    file_service = FileService()
    processing_service = ProcessingService(db)

    # 1. Leer y validar
    content = await file.read()
    original_filename = file.filename or "upload"
    extension = file_service.validate_upload(file, len(content))
    file_type = Path(original_filename).suffix.lower().lstrip(".")

    # 2. Guardar en storage/temp/
    temp_file_path = file_service.save_temp_file(content, extension)

    # 3. Crear job en estado "queued" (fuente de verdad en PostgreSQL)
    job = processing_service.create_job(
        current_user=current_user,
        original_filename=original_filename,
        file_type=file_type,
    )

    # 4. Encolar tarea Celery
    process_file_task.delay(
        file_path=temp_file_path,
        original_filename=original_filename,
        user_id=str(current_user.user_id),
        job_id=str(job.job_id),
    )

    logger.info(
        "Archivo encolado — job_id=%s user_id=%s filename=%s",
        job.job_id,
        current_user.user_id,
        original_filename,
    )

    return JobQueuedResponse(job_id=job.job_id)
