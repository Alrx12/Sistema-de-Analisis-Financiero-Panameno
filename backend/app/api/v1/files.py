from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.file import FileUploadAnalysisResponse
from app.services.file_service import FileService
from app.services.processing_service import ProcessingService

router = APIRouter()


@router.post("/upload", response_model=FileUploadAnalysisResponse)
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileUploadAnalysisResponse:
    file_service = FileService()
    processing_service = ProcessingService(db)

    content = await file.read()
    extension = file_service.validate_upload(file, len(content))
    temp_file_path = file_service.save_temp_file(content, extension)

    result = processing_service.process_file(temp_file_path, file.filename or temp_file_path, current_user)
    return FileUploadAnalysisResponse(**result)