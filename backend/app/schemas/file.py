from typing import Any

from pydantic import BaseModel

class FileUploadAnalysisResponse(BaseModel):
    status: str
    analysis: dict[str, Any]