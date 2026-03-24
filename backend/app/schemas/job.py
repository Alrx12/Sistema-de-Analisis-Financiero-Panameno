from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class JobQueuedResponse(BaseModel):
    """Respuesta inmediata de POST /files/upload cuando el archivo se encola."""

    status: Literal["queued"] = "queued"
    job_id: UUID
    message: str = "Archivo recibido y en cola de procesamiento."


class JobStatusResponse(BaseModel):
    """Respuesta de GET /jobs/{job_id} — estado actual del job."""

    job_id: UUID
    status: str  # queued | processing | success | error
    original_filename: str | None = None
    file_type: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
