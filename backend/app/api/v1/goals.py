"""
Endpoints para gestión de metas de ahorro del usuario.
"""

import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.savings_goal import SavingsGoal
from app.models.user import User

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class GoalCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    icon: str = Field(default="Star", max_length=50)
    color: str = Field(default="#8B5CF6", max_length=20)
    target_amount: float = Field(..., gt=0)
    current_amount: float = Field(default=0.0, ge=0)
    deadline: Optional[date] = None


class GoalUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    target_amount: Optional[float] = Field(None, gt=0)
    deadline: Optional[date] = None


class GoalDepositRequest(BaseModel):
    amount: float = Field(..., description="Monto a agregar (positivo) o retirar (negativo)")


class GoalResponse(BaseModel):
    goal_id: str
    user_id: str
    name: str
    icon: str
    color: str
    target_amount: float
    current_amount: float
    progress_pct: float          # porcentaje completado 0–100
    deadline: Optional[str]
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_model(cls, g: SavingsGoal) -> "GoalResponse":
        target = float(g.target_amount)
        current = float(g.current_amount)
        pct = round(min(current / target * 100, 100), 1) if target > 0 else 0.0
        return cls(
            goal_id=str(g.goal_id),
            user_id=str(g.user_id),
            name=g.name,
            icon=g.icon,
            color=g.color,
            target_amount=target,
            current_amount=current,
            progress_pct=pct,
            deadline=g.deadline.isoformat() if g.deadline else None,
            created_at=g.created_at.isoformat(),
            updated_at=g.updated_at.isoformat(),
        )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_goal_or_404(db: Session, goal_id: uuid.UUID, user_id: uuid.UUID) -> SavingsGoal:
    g = (
        db.query(SavingsGoal)
        .filter(SavingsGoal.goal_id == goal_id, SavingsGoal.user_id == user_id)
        .first()
    )
    if not g:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meta no encontrada")
    return g


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[GoalResponse])
def list_goals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista todas las metas de ahorro del usuario."""
    goals = (
        db.query(SavingsGoal)
        .filter(SavingsGoal.user_id == current_user.user_id)
        .order_by(SavingsGoal.created_at.asc())
        .all()
    )
    return [GoalResponse.from_orm_model(g) for g in goals]


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    body: GoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea una nueva meta de ahorro."""
    goal = SavingsGoal(
        user_id=current_user.user_id,
        name=body.name,
        icon=body.icon,
        color=body.color,
        target_amount=body.target_amount,
        current_amount=body.current_amount,
        deadline=body.deadline,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return GoalResponse.from_orm_model(goal)


@router.patch("/{goal_id}", response_model=GoalResponse)
def update_goal(
    goal_id: uuid.UUID,
    body: GoalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Actualiza los datos de una meta (nombre, ícono, monto objetivo, deadline)."""
    goal = _get_goal_or_404(db, goal_id, current_user.user_id)

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(goal, field, value)

    goal.updated_at = datetime.now(tz=timezone.utc)
    db.commit()
    db.refresh(goal)
    return GoalResponse.from_orm_model(goal)


@router.post("/{goal_id}/deposit", response_model=GoalResponse)
def deposit_to_goal(
    goal_id: uuid.UUID,
    body: GoalDepositRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Agrega o retira dinero de una meta de ahorro.

    - amount positivo → abono a la meta
    - amount negativo → retiro de la meta (no baja de 0)
    """
    goal = _get_goal_or_404(db, goal_id, current_user.user_id)

    new_amount = float(goal.current_amount) + body.amount
    if new_amount < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El retiro excede el saldo acumulado (B/. {float(goal.current_amount):.2f})",
        )

    goal.current_amount = new_amount
    goal.updated_at = datetime.now(tz=timezone.utc)
    db.commit()
    db.refresh(goal)
    return GoalResponse.from_orm_model(goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Elimina una meta de ahorro."""
    goal = _get_goal_or_404(db, goal_id, current_user.user_id)
    db.delete(goal)
    db.commit()
