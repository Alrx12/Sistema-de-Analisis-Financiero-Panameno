from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AnalysisTransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    transaction_id: UUID
    snapshot_id: UUID
    date: date | None
    detail: str
    amount: float
    movement_type: str

    economic_type: str | None
    economic_type_detail: str | None
    subtype_economic: str | None
    budget_category: str | None
    budget_role: str | None

    confidence: float
    method: str

    requires_review: bool = False