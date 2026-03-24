from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class AnalysisResponse(BaseModel):
    """Schema interno usado por AnalysisService.build_analysis()."""
    total_transactions: int
    total_income: float
    total_expenses: float
    balance: float
    categories: dict[str, float]
    recommendations: list[dict[str, Any]]
    period_start: date | None
    period_end: date | None


class AnalysisSnapshotResponse(BaseModel):
    """Schema de la API — representa un AnalysisSnapshot persistido en DB."""
    snapshot_id: UUID
    created_at: datetime
    period_start: date | None = None
    period_end: date | None = None

    # Campos aplanados desde summary JSON para facilitar el consumo del frontend
    total_transactions: int
    total_income: float
    total_expenses: float
    balance: float
    categories: dict[str, float]
    recommendations: list[dict[str, Any]]

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):  # type: ignore[override]
        """
        Aplana el campo `summary` del AnalysisSnapshot en los campos del schema.
        """
        if hasattr(obj, "summary"):
            summary = obj.summary or {}
            data = {
                "snapshot_id": obj.snapshot_id,
                "created_at": obj.created_at,
                "period_start": obj.period_start,
                "period_end": obj.period_end,
                "total_transactions": summary.get("total_transactions", 0),
                "total_income": summary.get("total_income", 0.0),
                "total_expenses": summary.get("total_expenses", 0.0),
                "balance": summary.get("balance", 0.0),
                "categories": summary.get("categories", {}),
                "recommendations": obj.recommendations or [],
            }
            return cls(**data)
        return super().model_validate(obj, **kwargs)
