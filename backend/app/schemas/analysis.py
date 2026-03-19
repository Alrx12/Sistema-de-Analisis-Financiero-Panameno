from datetime import date
from typing import Any

from pydantic import BaseModel


class AnalysisResponse(BaseModel):
    total_transactions: int
    total_income: float
    total_expenses: float
    balance: float
    categories: dict[str, float]
    recommendations: list[dict[str, Any]]
    period_start: date | None
    period_end: date | None