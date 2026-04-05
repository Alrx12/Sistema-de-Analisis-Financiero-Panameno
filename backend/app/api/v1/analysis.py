import logging
import unicodedata
from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.bank_account import BankAccount
from app.models.user import User
from app.services.detail_normalizer import canonicalize_detail
from app.schemas.analysis import (
    AggregatedSummaryResponse,
    MerchantStat,
    MonthTrendStat,
    TypeStat,
    AnalysisSnapshotResponse,
    BulkReclassifyRequest,
    BulkReclassifyResponse,
    ConfidenceStatsResponse,
)
from app.models.analysis_transaction import AnalysisTransaction
from app.schemas.analysis_transaction import AnalysisTransactionResponse
from app.schemas.features import SnapshotFeaturesResponse
from app.services.analysis_service import AnalysisService
from app.services.feature_engineering_service import compute_features

logger = logging.getLogger(__name__)

router = APIRouter()


@router.delete(
    "/all",
    status_code=200,
    summary="Eliminar todos los análisis del usuario",
    description=(
        "Borra permanentemente todos los snapshots y transacciones del usuario. "
        "Los archivos Excel subidos (deduplicación) se eliminan también para permitir "
        "volver a subirlos. El Knowledge Base personal y el perfil se conservan intactos."
    ),
)
def delete_all_analysis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    from app.models.uploaded_file import UploadedFile
    from pathlib import Path

    # 1. Borrar transacciones (CASCADE desde snapshots, pero lo hacemos explícito)
    snapshots = (
        db.query(AnalysisSnapshot)
        .filter(AnalysisSnapshot.user_id == current_user.user_id)
        .all()
    )
    snapshot_ids = [s.snapshot_id for s in snapshots]

    transactions_deleted = 0
    if snapshot_ids:
        transactions_deleted = (
            db.query(AnalysisTransaction)
            .filter(AnalysisTransaction.snapshot_id.in_(snapshot_ids))
            .delete(synchronize_session=False)
        )
        db.query(AnalysisSnapshot).filter(
            AnalysisSnapshot.user_id == current_user.user_id
        ).delete(synchronize_session=False)

    # 2. Borrar registros de uploaded_files + archivos físicos
    uploaded = (
        db.query(UploadedFile)
        .filter(UploadedFile.user_id == current_user.user_id)
        .all()
    )
    files_deleted = 0
    for uf in uploaded:
        try:
            if uf.storage_path:
                p = Path(uf.storage_path)
                if p.exists():
                    p.unlink()
                    files_deleted += 1
        except Exception:
            pass
        db.delete(uf)

    db.commit()

    logging.getLogger(__name__).info(
        "delete_all_analysis | user_id=%s snapshots=%d transactions=%d files=%d",
        current_user.user_id, len(snapshot_ids), transactions_deleted, files_deleted,
    )

    return {
        "message": "Todos los análisis eliminados correctamente.",
        "snapshots_deleted": len(snapshot_ids),
        "transactions_deleted": transactions_deleted,
        "files_deleted": files_deleted,
    }


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
    # Batch-query para evitar N+1: un solo SELECT para todas las cuentas referenciadas
    account_ids = {s.bank_account_id for s in snapshots if s.bank_account_id}
    accounts: dict = {}
    if account_ids:
        rows = db.query(BankAccount).filter(BankAccount.account_id.in_(account_ids)).all()
        accounts = {a.account_id: a for a in rows}
    return [
        AnalysisSnapshotResponse.model_validate(s, bank_account=accounts.get(s.bank_account_id))
        for s in snapshots
    ]


@router.get(
    "/aggregated",
    response_model=AggregatedSummaryResponse,
    summary="KPIs agregados desde transacciones con filtros opcionales",
    description=(
        "Calcula ingresos, gastos, balance y categorías directamente desde "
        "analysis_transactions. A diferencia de los snapshots, permite filtrar "
        "por año, mes y banco con resultados exactos al rango pedido."
    ),
)
def get_aggregated_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    year: int | None = Query(default=None, description="Año de la transacción (EXTRACT year)"),
    month: int | None = Query(default=None, description="Mes de la transacción 1–12"),
    bank_account_id: UUID | None = Query(default=None, description="Filtrar por banco"),
    budget_category: str | None = Query(default=None, description="Filtrar top_merchants por categoría de presupuesto"),
) -> AggregatedSummaryResponse:
    _MONTH_ABBR = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

    query = (
        db.query(AnalysisTransaction)
        .join(AnalysisSnapshot, AnalysisTransaction.snapshot_id == AnalysisSnapshot.snapshot_id)
        .filter(AnalysisTransaction.user_id == current_user.user_id)
    )
    if year is not None:
        query = query.filter(extract("year", AnalysisTransaction.date) == year)
    if month is not None:
        query = query.filter(extract("month", AnalysisTransaction.date) == month)
    if bank_account_id is not None:
        query = query.filter(AnalysisSnapshot.bank_account_id == bank_account_id)

    transactions = query.all()

    # ── Acumuladores ──────────────────────────────────────────────────────────
    total_income = 0.0
    total_expenses = 0.0
    categories: dict[str, float] = defaultdict(float)

    # merchant → (amount_total, count, last_category)
    merchants: dict[str, list] = defaultdict(lambda: [0.0, 0, None])
    # economic_type → (amount_total, count)
    by_etype: dict[str, list] = defaultdict(lambda: [0.0, 0])
    # budget_role → (amount_total, count) — solo gastos (amount < 0)
    by_brole: dict[str, list] = defaultdict(lambda: [0.0, 0])
    # "YYYY-MM" → {income, expenses, transactions}
    monthly: dict[str, dict] = defaultdict(lambda: {"income": 0.0, "expenses": 0.0, "tx": 0})

    for tx in transactions:
        budget_role = (tx.budget_role or "revisar").lower().strip()
        amount = float(tx.amount)
        abs_amount = abs(amount)

        # ── Tendencia mensual (todas las transacciones, incluye solo_balance para contar) ──
        if tx.date:
            mk = f"{tx.date.year}-{tx.date.month:02d}"
            monthly[mk]["tx"] += 1
            if budget_role != "solo_balance":
                if amount >= 0:
                    monthly[mk]["income"] += amount
                else:
                    monthly[mk]["expenses"] += abs_amount

        if budget_role == "solo_balance":
            continue

        # ── KPIs ──
        if amount >= 0:
            total_income += amount
        else:
            total_expenses += abs_amount

        # ── Categorías (solo gastos) ──
        if amount < 0 and tx.budget_category:
            raw_cat = tx.budget_category.lower().strip()
            cat = unicodedata.normalize("NFD", raw_cat).encode("ascii", "ignore").decode("ascii")
            categories[cat] += abs_amount

        # ── Top merchants (solo gastos con detalle) ──
        if amount < 0 and tx.detail:
            # Si se pidió filtro por categoría, solo acumular merchants de esa categoría
            tx_cat = (tx.budget_category or "").lower().strip()
            filter_cat = budget_category.lower().strip() if budget_category else None
            if filter_cat is None or tx_cat == filter_cat:
                try:
                    key = canonicalize_detail(tx.detail) or tx.detail[:30]
                except Exception:
                    key = tx.detail[:30]
                merchants[key][0] += abs_amount
                merchants[key][1] += 1
                if tx.budget_category:
                    merchants[key][2] = tx.budget_category

        # ── Por tipo económico ──
        etype = (tx.economic_type or "desconocido").lower()
        by_etype[etype][0] += abs_amount
        by_etype[etype][1] += 1

        # ── Por budget_role (solo gastos) ──
        if amount < 0:
            brole = budget_role  # ya calculado arriba, sin "solo_balance" (fue filtrado)
            by_brole[brole][0] += abs_amount
            by_brole[brole][1] += 1

    # ── Construir respuesta ────────────────────────────────────────────────────
    top_merchants = sorted(
        [MerchantStat(name=k, amount=round(v[0], 2), count=v[1], category=v[2])
         for k, v in merchants.items()],
        key=lambda x: -x.amount,
    )[:15]

    by_economic_type = sorted(
        [TypeStat(type=k, amount=round(v[0], 2), count=v[1])
         for k, v in by_etype.items()],
        key=lambda x: -x.amount,
    )

    by_budget_role = sorted(
        [TypeStat(type=k, amount=round(v[0], 2), count=v[1])
         for k, v in by_brole.items()],
        key=lambda x: -x.amount,
    )

    monthly_trend = [
        MonthTrendStat(
            month=mk,
            label=f"{_MONTH_ABBR[int(mk[5:7]) - 1]} {mk[2:4]}",
            income=round(v["income"], 2),
            expenses=round(v["expenses"], 2),
            transactions=v["tx"],
        )
        for mk, v in sorted(monthly.items())
    ]

    return AggregatedSummaryResponse(
        total_income=round(total_income, 2),
        total_expenses=round(total_expenses, 2),
        balance=round(total_income - total_expenses, 2),
        total_transactions=len(transactions),
        categories={k: round(v, 2) for k, v in sorted(categories.items(), key=lambda x: -x[1])},
        top_merchants=top_merchants,
        by_economic_type=by_economic_type,
        by_budget_role=by_budget_role,
        monthly_trend=monthly_trend,
    )


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

    bank_account = (
        db.get(BankAccount, snapshot.bank_account_id)
        if snapshot.bank_account_id
        else None
    )
    return AnalysisSnapshotResponse.model_validate(snapshot, bank_account=bank_account)

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


@router.get(
    "/{snapshot_id}/features",
    response_model=SnapshotFeaturesResponse,
    summary="Features de ingeniería financiera de un análisis",
    description=(
        "Computa agregaciones avanzadas sobre las transacciones del snapshot: "
        "gasto por semana, por día de la semana, velocidad de gasto, ratios por categoría, "
        "concentración por merchant y breakdown de recurrencia. "
        "Pipeline de entrenamiento separado del pipeline de procesamiento."
    ),
)
def get_snapshot_features(
    snapshot_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SnapshotFeaturesResponse:
    snapshot = db.get(AnalysisSnapshot, snapshot_id)

    if snapshot is None or snapshot.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Análisis no encontrado.")

    transactions = (
        db.query(AnalysisTransaction)
        .filter(AnalysisTransaction.snapshot_id == snapshot_id)
        .all()
    )

    # Convertir ORM objects a dicts para el módulo puro de feature engineering
    tx_dicts = [
        {
            "amount": float(tx.amount),
            "date": tx.date,
            "budget_role": tx.budget_role,
            "budget_category": tx.budget_category,
            "subtype_economic": tx.subtype_economic,
            "economic_type_detail": tx.economic_type_detail,
            "detail": tx.detail,
        }
        for tx in transactions
    ]

    features = compute_features(
        tx_dicts,
        period_start=snapshot.period_start,
        period_end=snapshot.period_end,
    )

    return SnapshotFeaturesResponse(
        snapshot_id=snapshot_id,
        period_start=snapshot.period_start,
        period_end=snapshot.period_end,
        **features,
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