from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    user_id: UUID
    username: str
    email: EmailStr
    full_name: str | None
    is_active: bool
    plan: str
    is_admin: bool
    is_verified: bool
    totp_enabled: bool
    expo_push_token: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}