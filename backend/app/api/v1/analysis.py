import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.user import User
from app.schemas.analysis import AnalysisSnapshotResponse
from app.models.analysis_transaction import AnalysisTransaction
from app.schemas.analysis_transaction import AnalysisTransactionResponse

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

@router.get(
    "/{snapshot_id}/transactions",
    response_model=list[AnalysisTransactionResponse],
    summary="Listar transacciones de un análisis",
)
def get_analysis_transactions(
    snapshot_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    requires_review: bool | None = None,
    max_confidence: float | None = None,
):
    snapshot = db.get(AnalysisSnapshot, snapshot_id)

    if snapshot is None or snapshot.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Análisis no encontrado")

    transactions = (
        db.query(AnalysisTransaction)
        .filter(AnalysisTransaction.snapshot_id == snapshot_id)
        .order_by(AnalysisTransaction.created_at.desc())
        .all()
    )

    result = []
    for t in transactions:
        requires_review_flag = float(t.confidence) < 0.8

        if requires_review is not None and requires_review != requires_review_flag:
            continue

        if max_confidence is not None and float(t.confidence) > max_confidence:
            continue

        item = AnalysisTransactionResponse.model_validate(t)
        item.requires_review = requires_review_flag
        result.append(item)

    return result