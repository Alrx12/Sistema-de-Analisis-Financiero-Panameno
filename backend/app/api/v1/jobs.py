import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.processing_job import ProcessingJob
from app.models.user import User
from app.schemas.job import JobStatusResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/{job_id}",
    response_model=JobStatusResponse,
    summary="Estado de un job de procesamiento",
    description=(
        "Retorna el estado actual de un job de procesamiento. "
        "Útil para polling después de POST /files/upload. "
        "Solo el usuario dueño del job puede consultarlo."
    ),
)
def get_job_status(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobStatusResponse:
    job = db.get(ProcessingJob, job_id)

    if job is None or job.user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job no encontrado.",
        )

    return JobStatusResponse.model_validate(job)


@router.get(
    "/",
    response_model=list[JobStatusResponse],
    summary="Historial de jobs del usuario",
    description="Lista todos los jobs de procesamiento del usuario actual, ordenados del más reciente al más antiguo.",
)
def list_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 20,
) -> list[JobStatusResponse]:
    jobs = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.user_id == current_user.user_id)
        .order_by(ProcessingJob.created_at.desc())
        .limit(min(limit, 100))
        .all()
    )
    return [JobStatusResponse.model_validate(j) for j in jobs]
