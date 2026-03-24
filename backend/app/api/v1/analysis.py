import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.user import User
from app.schemas.analysis import AnalysisSnapshotResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/",
    response_model=list[AnalysisSnapshotResponse],
    summary="Listar análisis del usuario",
    description="Retorna todos los AnalysisSnapshots del usuario actual, ordenados del más reciente al más antiguo.",
)
def list_analysis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 20,
) -> list[AnalysisSnapshotResponse]:
    snapshots = (
        db.query(AnalysisSnapshot)
        .filter(AnalysisSnapshot.user_id == current_user.user_id)
        .order_by(AnalysisSnapshot.created_at.desc())
        .limit(min(limit, 100))
        .all()
    )
    return [AnalysisSnapshotResponse.model_validate(s) for s in snapshots]


@router.get(
    "/{snapshot_id}",
    response_model=AnalysisSnapshotResponse,
    summary="Obtener un análisis por ID",
)
def get_analysis(
    snapshot_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnalysisSnapshotResponse:
    snapshot = db.get(AnalysisSnapshot, snapshot_id)

    if snapshot is None or snapshot.user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Análisis no encontrado.",
        )

    return AnalysisSnapshotResponse.model_validate(snapshot)
