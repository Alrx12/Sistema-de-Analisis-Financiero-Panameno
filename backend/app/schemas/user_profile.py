from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

# Industrias válidas — categorías genéricas
IndustryType = Literal[
    "tecnologia",
    "salud",
    "educacion",
    "finanzas",
    "comercio",
    "construccion",
    "gobierno",
    "transporte",
    "servicios",
    "otro",
]

# Metas financieras válidas
GoalType = Literal[
    "fondo_emergencia",
    "ahorro_general",
    "eliminar_deuda",
    "invertir",
    "meta_especifica",
]


class ManualExpense(BaseModel):
    """Un gasto no reflejado en estados de cuenta (efectivo, otro banco, etc.)"""
    id: str                     # uuid generado en el frontend
    description: str
    amount: float               # monto en la frecuencia indicada
    frequency: Literal["weekly", "monthly", "annual"]
    monthly_amount: float       # normalizado a mensual por el frontend
    category: str               # categoría de presupuesto (ej: "alquiler", "deuda")
    origins: list[str]          # ["efectivo", "otro_banco", "tarjeta_externa", "prestamo", "otro"]


class UserProfileResponse(BaseModel):
    profile_id: UUID
    user_id: UUID
    industry: str | None
    expected_monthly_income: float | None
    financial_goals: list[str]
    onboarding_completed: bool
    manual_expenses: list[Any] | None   # None = nunca configurado; [] = sin gastos adicionales
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    industry: str | None = Field(default=None)
    expected_monthly_income: float | None = Field(default=None, ge=0)
    financial_goals: list[str] = Field(default_factory=list)
    onboarding_completed: bool = Field(default=False)
    manual_expenses: list[Any] | None = Field(default=None)
