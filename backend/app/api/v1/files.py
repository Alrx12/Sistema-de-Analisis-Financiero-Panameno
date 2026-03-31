import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.schemas.job import JobQueuedResponse
from app.services.analytics_service import track_event
from app.services.file_fingerprint_service import compute_checksum
from app.services.file_service import FileService
from app.services.processing_service import ProcessingService
from app.workers.tasks import process_file_task

logger = logging.getLogger(__name__)

router = APIRouter()


@router.delete(
    "/uploads",
    status_code=200,
    summary="Borrar todos los estados de cuenta subidos",
    description=(
        "Elimina todos los registros de archivos subidos del usuario y sus archivos físicos. "
        "Los análisis, snapshots y transacciones se conservan intactos. "
        "Después de esta operación, el usuario puede volver a subir los mismos archivos sin recibir un 409."
    ),
)
def clear_uploaded_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    uploaded = (
        db.query(UploadedFile)
        .filter(UploadedFile.user_id == current_user.user_id)
        .all()
    )

    deleted_physical = 0
    for uf in uploaded:
        path = Path(uf.storage_path)
        if path.exists():
            try:
                path.unlink()
                deleted_physical += 1
            except Exception:
                pass
        db.delete(uf)

    db.commit()

    logger.info(
        "Uploads borrados — user_id=%s records=%d files=%d",
        current_user.user_id,
        len(uploaded),
        deleted_physical,
    )

    return {
        "message": f"{len(uploaded)} estado(s) de cuenta eliminado(s). Puedes volver a subirlos.",
        "records_deleted": len(uploaded),
        "files_deleted": deleted_physical,
    }


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

    # 2. Deduplicación: calcular hash y verificar si ya fue procesado
    content_hash = compute_checksum(content)
    existing = (
        db.query(UploadedFile)
        .filter(
            UploadedFile.user_id == current_user.user_id,
            UploadedFile.checksum == content_hash,
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "duplicate_file",
                "message": "Este archivo ya fue procesado anteriormente.",
                "original_filename": existing.original_filename,
                "uploaded_at": existing.uploaded_at.isoformat(),
                "detected_bank": existing.detected_bank_name,
            },
        )

    # 3. Guardar en storage/temp/
    temp_file_path = file_service.save_temp_file(content, extension)

    # 4. Crear job en estado "queued" (fuente de verdad en PostgreSQL)
    job = processing_service.create_job(
        current_user=current_user,
        original_filename=original_filename,
        file_type=file_type,
    )

    # 5. Encolar tarea Celery (con hash para que registre en uploaded_files al terminar)
    process_file_task.delay(
        file_path=temp_file_path,
        original_filename=original_filename,
        user_id=str(current_user.user_id),
        job_id=str(job.job_id),
        content_hash=content_hash,
        file_size=len(content),
    )

    logger.info(
        "Archivo encolado — job_id=%s user_id=%s filename=%s",
        job.job_id,
        current_user.user_id,
        original_filename,
    )

    track_event(
        user_id=current_user.user_id,
        event_type="upload_queued",
        plan=getattr(current_user, "plan", None),
        metadata={
            "job_id": str(job.job_id),
            "filename": original_filename,
            "file_size": len(content),
        },
    )

    return JobQueuedResponse(job_id=job.job_id)
