from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class FileUploadResponse(BaseModel):
    file_id: UUID
    original_filename: str
    checksum: str
    status: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}