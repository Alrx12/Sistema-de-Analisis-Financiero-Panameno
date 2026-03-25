"""
Schemas de respuesta para el endpoint GET /analysis/{snapshot_id}/features.
"""
from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class WeeklyBreakdown(BaseModel):
    week: str = Field(description="Semana ISO, e.g. '2025-W03'")
    income: float
    expenses: float
    balance: float


class DayOfWeekBreakdown(BaseModel):
    day_index: int = Field(description="0=lunes … 6=domingo")
    day: str = Field(description="Nombre del día en español")
    total_spend: float = Field(description="Gasto total acumulado ese día de la semana")
    avg_per_occurrence: float = Field(description="Promedio de gasto por cada vez que apareció ese día en el período")
    occurrence_count: int = Field(description="Cuántas veces apareció ese día en el período")


class CumulativePoint(BaseModel):
    date: str
    daily_spend: float
    cumulative: float


class SpendingVelocity(BaseModel):
    avg_daily_spend: float = Field(description="Gasto promedio por día calendario del período")
    projected_monthly: float = Field(description="Proyección de gasto a 30 días al ritmo actual")
    period_days: int = Field(description="Duración del período en días")
    cumulative: list[CumulativePoint] = Field(description="Curva de gasto acumulado (solo días con transacciones)")


class CategoryRatio(BaseModel):
    category: str
    amount: float
    pct: float = Field(description="Porcentaje del total de gastos")
    tx_count: int


class MerchantConcentration(BaseModel):
    merchant: str
    amount: float
    pct_of_expenses: float
    tx_count: int


class RecurrenceBreakdown(BaseModel):
    subtype: str
    amount: float
    pct: float
    tx_count: int


class RecurrenceStats(BaseModel):
    recurrente_total: float
    recurrente_pct: float
    extraordinario_total: float
    extraordinario_pct: float
    breakdown: list[RecurrenceBreakdown]


class IncomeStats(BaseModel):
    total: float
    sources: dict[str, float] = Field(description="Monto por fuente de ingreso (economic_type_detail)")


class SnapshotFeaturesResponse(BaseModel):
    """
    Features de ingeniería financiera computadas sobre las transacciones de un snapshot.

    Estos datos están pensados para:
      - Alimentar visualizaciones de dashboard (gráficas, heatmaps)
      - Detectar patrones de gasto (días más caros, categorías dominantes)
      - Entrenar modelos downstream si se agrega ML en el futuro
    """
    snapshot_id: UUID
    period_start: date | None = None
    period_end: date | None = None

    by_week: list[WeeklyBreakdown] = Field(description="Ingresos/gastos/balance agrupados por semana ISO")
    by_day_of_week: list[DayOfWeekBreakdown] = Field(description="Gasto promedio por día de la semana")
    spending_velocity: SpendingVelocity = Field(description="Velocidad y proyección de gasto")
    category_ratios: list[CategoryRatio] = Field(description="% del gasto por categoría")
    merchant_concentration: list[MerchantConcentration] = Field(description="Top 10 merchants por monto")
    recurrence_stats: RecurrenceStats = Field(description="Breakdown recurrente vs extraordinario")
    income_stats: IncomeStats = Field(description="Fuentes de ingreso del período")
