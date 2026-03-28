"""
Endpoint para ingresar transacciones manualmente (sin subir estado de cuenta).

Cada usuario tiene una cuenta bancaria virtual "Manual" y un snapshot persistente
asociado a ella. Las transacciones manuales se almacenan ahí.
"""

import uuid
import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.analysis_transaction import AnalysisTransaction
from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.bank_account import BankAccount
from app.models.user import User
from app.schemas.analysis_transaction import AnalysisTransactionResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# ─── Fingerprint fijo para la cuenta "Manual" de cada usuario ─────────────────
MANUAL_FINGERPRINT_PREFIX = "manual_account_"


# ─── Schemas de entrada ───────────────────────────────────────────────────────

class ManualTransactionCreate(BaseModel):
    date: date = Field(default_factory=date.today)
    detail: str = Field(..., min_length=1, max_length=500, description="Nombre o descripción del gasto (texto libre)")
    amount: float = Field(..., gt=0, description="Monto positivo — el sistema distingue por movement_type")
    movement_type: str = Field(..., pattern="^(debito|credito)$", description="'debito' = gasto, 'credito' = ingreso")
    budget_category: str = Field(..., description="Categoría del catálogo — no texto libre")
    budget_role: str = Field(default="presupuestable")
    economic_type: str = Field(default="gasto")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_or_create_manual_account(db: Session, user_id: uuid.UUID) -> BankAccount:
    """Devuelve la BankAccount 'Manual' del usuario, creándola si no existe."""
    fingerprint = f"{MANUAL_FINGERPRINT_PREFIX}{user_id}"
    account = (
        db.query(BankAccount)
        .filter(BankAccount.user_id == user_id, BankAccount.account_fingerprint == fingerprint)
        .first()
    )
    if account:
        return account

    account = BankAccount(
        user_id=user_id,
        bank_name="Manual",
        account_type="manual",
        nickname="Entrada Manual",
        account_fingerprint=fingerprint,
        detection_source="manual",
        confidence_score=1.0,
        is_active=True,
    )
    db.add(account)
    db.flush()
    return account


def _get_or_create_manual_snapshot(db: Session, user_id: uuid.UUID, account_id: uuid.UUID) -> AnalysisSnapshot:
    """Devuelve el AnalysisSnapshot 'manual' del usuario, creándolo si no existe."""
    snapshot = (
        db.query(AnalysisSnapshot)
        .filter(
            AnalysisSnapshot.user_id == user_id,
            AnalysisSnapshot.bank_account_id == account_id,
        )
        .first()
    )
    if snapshot:
        return snapshot

    snapshot = AnalysisSnapshot(
        user_id=user_id,
        bank_account_id=account_id,
        summary={
            "total_income": 0.0,
            "total_expenses": 0.0,
            "balance": 0.0,
            "total_transactions": 0,
            "categories": {},
        },
        category_analysis=None,
        recommendations=[],
        period_start=None,
        period_end=None,
    )
    db.add(snapshot)
    db.flush()
    return snapshot


def _refresh_snapshot_summary(db: Session, snapshot: AnalysisSnapshot) -> None:
    """Recalcula el summary del snapshot manual a partir de sus transacciones."""
    txns = (
        db.query(AnalysisTransaction)
        .filter(AnalysisTransaction.snapshot_id == snapshot.snapshot_id)
        .all()
    )

    total_income = sum(t.amount for t in txns if t.movement_type == "credito")
    total_expenses = sum(t.amount for t in txns if t.movement_type == "debito")

    categories: dict[str, float] = {}
    for t in txns:
        if t.movement_type == "debito" and t.budget_category:
            categories[t.budget_category] = categories.get(t.budget_category, 0.0) + t.amount

    snapshot.summary = {
        "total_income": round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "balance": round(total_income - total_expenses, 2),
        "total_transactions": len(txns),
        "categories": {k: round(v, 2) for k, v in categories.items()},
    }
    # Actualizar período
    dates = [t.date for t in txns if t.date]
    if dates:
        snapshot.period_start = min(dates)
        snapshot.period_end = max(dates)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", response_model=AnalysisTransactionResponse, status_code=status.HTTP_201_CREATED)
def create_manual_transaction(
    body: ManualTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea una transacción manual para el usuario autenticado."""
    user_id = current_user.user_id

    account = _get_or_create_manual_account(db, user_id)
    snapshot = _get_or_create_manual_snapshot(db, user_id, account.account_id)

    txn = AnalysisTransaction(
        snapshot_id=snapshot.snapshot_id,
        user_id=user_id,
        date=body.date,
        detail=body.detail,
        amount=body.amount,
        movement_type=body.movement_type,
        economic_type=body.economic_type,
        economic_type_detail=None,
        subtype_economic=None,
        budget_category=body.budget_category,
        budget_role=body.budget_role,
        confidence=1.0,
        method="manual",
    )
    db.add(txn)
    db.flush()

    _refresh_snapshot_summary(db, snapshot)
    db.commit()
    db.refresh(txn)

    logger.info("Manual transaction created: %s for user %s", txn.transaction_id, user_id)
    return txn


@router.get("", response_model=list[AnalysisTransactionResponse])
def list_manual_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista todas las transacciones manuales del usuario."""
    user_id = current_user.user_id
    fingerprint = f"{MANUAL_FINGERPRINT_PREFIX}{user_id}"

    account = (
        db.query(BankAccount)
        .filter(BankAccount.user_id == user_id, BankAccount.account_fingerprint == fingerprint)
        .first()
    )
    if not account:
        return []

    snapshot = (
        db.query(AnalysisSnapshot)
        .filter(
            AnalysisSnapshot.user_id == user_id,
            AnalysisSnapshot.bank_account_id == account.account_id,
        )
        .first()
    )
    if not snapshot:
        return []

    txns = (
        db.query(AnalysisTransaction)
        .filter(AnalysisTransaction.snapshot_id == snapshot.snapshot_id)
        .order_by(AnalysisTransaction.date.desc())
        .all()
    )
    return txns


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_manual_transaction(
    transaction_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Elimina una transacción manual del usuario."""
    user_id = current_user.user_id

    txn = (
        db.query(AnalysisTransaction)
        .filter(
            AnalysisTransaction.transaction_id == transaction_id,
            AnalysisTransaction.user_id == user_id,
            AnalysisTransaction.method == "manual",
        )
        .first()
    )
    if not txn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transacción no encontrada")

    snapshot_id = txn.snapshot_id
    db.delete(txn)
    db.flush()

    # Refrescar el summary del snapshot
    snapshot = db.query(AnalysisSnapshot).filter(AnalysisSnapshot.snapshot_id == snapshot_id).first()
    if snapshot:
        _refresh_snapshot_summary(db, snapshot)

    db.commit()
