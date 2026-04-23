import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.core.logging_config import audit_logger
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.schemas.user import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


class UpdateMeRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100, strip_whitespace=True)


@router.patch("/me", response_model=UserResponse, summary="Actualizar nombre del usuario")
def update_me(
    body: UpdateMeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    name = body.full_name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="El nombre no puede estar vacío.")
    current_user.full_name = name
    db.commit()
    db.refresh(current_user)
    audit_logger.info(
        "name_updated | user_id=%s new_name=%s",
        current_user.user_id, name,
    )
    return UserResponse.model_validate(current_user)


class PushTokenRequest(BaseModel):
    token: str | None = Field(default=None, max_length=200)


@router.put("/push-token", status_code=200, summary="Registrar o borrar token de push notifications")
def update_push_token(
    body: PushTokenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Guarda (o borra) el Expo Push Token del usuario.

    - Enviar `token: "ExponentPushToken[...]"` para registrarlo.
    - Enviar `token: null` para borrarlo (ej: al cerrar sesión).
    """
    current_user.expo_push_token = body.token
    db.commit()
    return {"message": "Push token actualizado.", "registered": body.token is not None}


@router.delete("/me", status_code=200, summary="Eliminar cuenta del usuario")
def delete_my_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Elimina la cuenta del usuario y TODOS sus datos de forma irreversible.

    Borra en DB (vía CASCADE desde users):
        bank_accounts, processing_jobs, analysis_snapshots, analysis_transactions,
        uploaded_files, user_profiles, manual_wallets, savings_goals.

    Borra del filesystem:
        knowledge_base_user_{uuid}.json y todos los archivos físicos de uploads.
    """
    user_id = current_user.user_id
    email = current_user.email
    plan = getattr(current_user, "plan", "unknown")

    audit_logger.info(
        "account_delete_initiated | user_id=%s email=%s plan=%s",
        user_id, email, plan,
    )

    # Recopilar rutas físicas ANTES de borrar en DB
    file_paths = [
        Path(uf.storage_path)
        for uf in db.query(UploadedFile.storage_path)
        .filter(UploadedFile.user_id == user_id)
        .all()
    ]
    kb_path = Path(settings.knowledge_bases_dir) / f"knowledge_base_user_{user_id}.json"

    # Borrar el usuario — CASCADE se encarga del resto en DB
    db.delete(current_user)
    db.commit()

    # Limpiar filesystem (best-effort: si falla un archivo, continúa)
    if kb_path.exists():
        try:
            kb_path.unlink()
        except Exception:
            pass
    for path in file_paths:
        if path.exists():
            try:
                path.unlink()
            except Exception:
                pass

    audit_logger.info(
        "account_deleted | user_id=%s email=%s plan=%s",
        user_id, email, plan,
    )
    logger.info("Cuenta eliminada — user_id=%s", user_id)
    return {"message": "Cuenta eliminada correctamente."}