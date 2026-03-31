from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.schemas.user import UserResponse

router = APIRouter()


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


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

    return {"message": "Cuenta eliminada correctamente."}