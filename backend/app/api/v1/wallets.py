"""
Endpoints para gestión de billeteras manuales del usuario.
(Tarjeta, Efectivo, etc. — independientes de las cuentas bancarias detectadas).
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.manual_wallet import ManualWallet
from app.models.user import User

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class WalletCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    wallet_type: str = Field(default="cash", pattern="^(card|cash|savings|other)$")
    icon: str = Field(default="Wallet", max_length=50)
    color: str = Field(default="#6B7280", max_length=20)
    current_balance: float = Field(default=0.0, ge=0)
    is_default: bool = Field(default=False)


class WalletUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    wallet_type: Optional[str] = Field(None, pattern="^(card|cash|savings|other)$")
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    current_balance: Optional[float] = Field(None, ge=0)
    is_default: Optional[bool] = None


class WalletResponse(BaseModel):
    wallet_id: str
    user_id: str
    name: str
    wallet_type: str
    icon: str
    color: str
    current_balance: float
    is_default: bool
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_model(cls, w: ManualWallet) -> "WalletResponse":
        return cls(
            wallet_id=str(w.wallet_id),
            user_id=str(w.user_id),
            name=w.name,
            wallet_type=w.wallet_type,
            icon=w.icon,
            color=w.color,
            current_balance=float(w.current_balance),
            is_default=w.is_default,
            created_at=w.created_at.isoformat(),
            updated_at=w.updated_at.isoformat(),
        )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_wallet_or_404(db: Session, wallet_id: uuid.UUID, user_id: uuid.UUID) -> ManualWallet:
    w = (
        db.query(ManualWallet)
        .filter(ManualWallet.wallet_id == wallet_id, ManualWallet.user_id == user_id)
        .first()
    )
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Billetera no encontrada")
    return w


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[WalletResponse])
def list_wallets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista todas las billeteras manuales del usuario, ordenadas por defecto primero."""
    wallets = (
        db.query(ManualWallet)
        .filter(ManualWallet.user_id == current_user.user_id)
        .order_by(ManualWallet.is_default.desc(), ManualWallet.created_at.asc())
        .all()
    )
    return [WalletResponse.from_orm_model(w) for w in wallets]


@router.post("", response_model=WalletResponse, status_code=status.HTTP_201_CREATED)
def create_wallet(
    body: WalletCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea una nueva billetera manual."""
    user_id = current_user.user_id

    # Si la nueva billetera es la default, quitar la flag de las demás
    if body.is_default:
        db.query(ManualWallet).filter(ManualWallet.user_id == user_id).update(
            {"is_default": False}
        )

    wallet = ManualWallet(
        user_id=user_id,
        name=body.name,
        wallet_type=body.wallet_type,
        icon=body.icon,
        color=body.color,
        current_balance=body.current_balance,
        is_default=body.is_default,
    )
    db.add(wallet)
    db.commit()
    db.refresh(wallet)
    return WalletResponse.from_orm_model(wallet)


@router.patch("/{wallet_id}", response_model=WalletResponse)
def update_wallet(
    wallet_id: uuid.UUID,
    body: WalletUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Actualiza una billetera del usuario."""
    user_id = current_user.user_id
    wallet = _get_wallet_or_404(db, wallet_id, user_id)

    # Si se está marcando como default, desmarcar las demás
    if body.is_default is True:
        db.query(ManualWallet).filter(
            ManualWallet.user_id == user_id,
            ManualWallet.wallet_id != wallet_id,
        ).update({"is_default": False})

    updates = body.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(wallet, field, value)

    wallet.updated_at = datetime.now(tz=timezone.utc)
    db.commit()
    db.refresh(wallet)
    return WalletResponse.from_orm_model(wallet)


@router.delete("/{wallet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wallet(
    wallet_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Elimina una billetera del usuario."""
    wallet = _get_wallet_or_404(db, wallet_id, current_user.user_id)
    db.delete(wallet)
    db.commit()
