from datetime import date
from uuid import UUID

from pydantic import BaseModel


class AnalysisTransactionResponse(BaseModel):
    transaction_id: UUID
    snapshot_id: UUID
    date: date | None
    detail: str
    amount: float
    movement_type: str

    economic_type: str | None
    subtype_economic: str | None
    transaction_category: str | None
    budget_category: str | None
    budget_role: str | None

    confidence: float
    method: str

    requires_review: bool = False

    class Config:
        from_attributes = True