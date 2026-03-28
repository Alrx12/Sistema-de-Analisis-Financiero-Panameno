from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AccountCreate(BaseModel):
    bank_name: str = Field(min_length=2, max_length=100)
    account_type: str = Field(min_length=2, max_length=50)
    nickname: str = Field(min_length=2, max_length=100)
    account_number_last4: str | None = Field(default=None, max_length=4)


class AccountUpdate(BaseModel):
    nickname: str | None = Field(default=None, min_length=2, max_length=100)
    account_type: str | None = Field(default=None, min_length=2, max_length=50)
    account_number_last4: str | None = Field(default=None, max_length=4)
    is_active: bool | None = None
    available_balance: float | None = Field(default=None, ge=0, description="Saldo disponible real en la cuenta (ingresado manualmente)")


class AccountResponse(BaseModel):
    account_id: UUID
    bank_name: str
    account_type: str
    nickname: str
    account_number_last4: str | None
    account_fingerprint: str
    detection_source: str
    confidence_score: float | None
    is_active: bool
    available_balance: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}