import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.user import User
from app.schemas.analysis import (
    AnalysisSnapshotResponse,
    BulkReclassifyRequest,
    BulkReclassifyResponse,
    ConfidenceStatsResponse,
)
from app.models.analysis_transaction import AnalysisTransaction
from app.schemas.analysis_transaction import AnalysisTransactionResponse
from app.services.analysis_service import AnalysisService

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


@router.get(
    "/{snapshot_id}/confidence-stats",
    response_model=ConfidenceStatsResponse,
    summary="Estadísticas de confianza de un análisis",
    description=(
        "Retorna la distribución de confianza de las transacciones del snapshot. "
        "Útil para medir la efectividad del KB: si fallback_pct baja entre uploads "
        "significa que el entrenamiento está funcionando."
    ),
)
def get_confidence_stats(
    snapshot_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConfidenceStatsResponse:
    snapshot = db.get(AnalysisSnapshot, snapshot_id)

    if snapshot is None or snapshot.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Análisis no encontrado")

    transactions = (
        db.query(AnalysisTransaction)
        .filter(AnalysisTransaction.snapshot_id == snapshot_id)
        .all()
    )

    total = len(transactions)
    if total == 0:
        return ConfidenceStatsResponse(
            snapshot_id=snapshot_id,
            total=0,
            requires_review_count=0,
            requires_review_pct=0.0,
            fallback_count=0,
            fallback_pct=0.0,
            avg_confidence=0.0,
            by_method={},
        )

    requires_review_count = sum(1 for t in transactions if float(t.confidence) < 0.8)
    # Fallback puro: confidence <= 0.35 (0.3 = fallback, 0.35 = cota segura por redondeo)
    fallback_count = sum(1 for t in transactions if float(t.confidence) <= 0.35)
    avg_confidence = round(sum(float(t.confidence) for t in transactions) / total, 4)

    # Agrupa métodos en categorías legibles
    by_method: dict[str, int] = {}
    for t in transactions:
        method = t.method or "other"
        if method.startswith("kb_personal"):
            key = "kb_personal"
        elif method.startswith("kb_global"):
            key = "kb_global"
        elif method.startswith("builtin:"):
            key = "builtin"
        elif method == "user_reclassified":
            key = "user_reclassified"
        elif method.startswith("fallback"):
            key = "fallback"
        else:
            key = "other"
        by_method[key] = by_method.get(key, 0) + 1

    def pct(n: int) -> float:
        return round(n / total * 100, 2)

    return ConfidenceStatsResponse(
        snapshot_id=snapshot_id,
        total=total,
        requires_review_count=requires_review_count,
        requires_review_pct=pct(requires_review_count),
        fallback_count=fallback_count,
        fallback_pct=pct(fallback_count),
        avg_confidence=avg_confidence,
        by_method=by_method,
    )


@router.post(
    "/{snapshot_id}/reclassify-bulk",
    response_model=BulkReclassifyResponse,
    summary="Re-categorizar todas las transacciones de un análisis con el KB actual",
    description=(
        "Vuelve a correr el clasificador sobre todas las transacciones del snapshot "
        "usando el estado actual del KB (personal + global). También recalcula los KPIs "
        "del snapshot (totales, categorías, recomendaciones). "
        "Las transacciones corregidas manualmente con /reclassify se omiten por defecto "
        "(skip_user_reclassified=true)."
    ),
)
def reclassify_snapshot_bulk(
    snapshot_id: UUID,
    body: BulkReclassifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BulkReclassifyResponse:
    snapshot = db.get(AnalysisSnapshot, snapshot_id)

    if snapshot is None or snapshot.user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Análisis no encontrado.",
        )

    service = AnalysisService(db)
    result = service.reclassify_snapshot(
        snapshot=snapshot,
        user=current_user,
        skip_user_reclassified=body.skip_user_reclassified,
    )
    return BulkReclassifyResponse(**result)