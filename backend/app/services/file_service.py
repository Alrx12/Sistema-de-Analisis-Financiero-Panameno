from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings


class FileService:
    allowed_extensions = {".xls", ".xlsx"}  # CSV deshabilitado — añadir de vuelta cuando haya parsers validados para ese formato
    max_file_size_bytes = 5 * 1024 * 1024

    def validate_upload(self, upload: UploadFile, file_size: int) -> str:
        extension = Path(upload.filename or "").suffix.lower()
        if extension not in self.allowed_extensions:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo inválido")
        if file_size <= 0 or file_size > self.max_file_size_bytes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo inválido")
        return extension

    def save_temp_file(self, content: bytes, extension: str) -> str:
        os.makedirs(settings.temp_dir, exist_ok=True)
        filename = f"{uuid4().hex}{extension}"
        file_path = os.path.join(settings.temp_dir, filename)
        with open(file_path, "wb") as file_handle:
            file_handle.write(content)
        return file_path