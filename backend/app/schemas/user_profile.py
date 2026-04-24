from datetime import datetime
from typing import Any, Literal, Optional
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
    "entretenimiento",
    "otro",
]

# Tipo de vivienda
HousingType = Literal["rent", "mortgage", "own", "family", "other"]

# Tipo de empleo
EmploymentType = Literal[
    "employed_fixed",
    "employed_variable",
    "self_employed",
    "business_owner",
    "unemployed",
    "retired",
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
    # Perfil extendido para presupuesto personalizado
    dependents_count: int = 0
    housing_type: Optional[str] = None
    employment_type: Optional[str] = None
    monthly_debt_payments: Optional[float] = None
    has_pets: bool = False
    pets_count: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    industry: str | None = Field(default=None)
    expected_monthly_income: float | None = Field(default=None, ge=0)
    financial_goals: list[str] = Field(default_factory=list)
    onboarding_completed: bool = Field(default=False)
    manual_expenses: list[Any] | None = Field(default=None)
    # Perfil extendido — todos opcionales, se omiten si no se envían
    dependents_count: Optional[int] = Field(default=None, ge=0)
    housing_type: Optional[str] = Field(default=None)
    employment_type: Optional[str] = Field(default=None)
    monthly_debt_payments: Optional[float] = Field(default=None, ge=0)
    has_pets: Optional[bool] = Field(default=None)
    pets_count: Optional[int] = Field(default=None, ge=0, le=10)
