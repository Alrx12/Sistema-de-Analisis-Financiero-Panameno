"""
GET/POST/PATCH/DELETE /admin/users/* — Gestión de usuarios para el admin de SAFPRO.
GET /admin/jobs          — Jobs fallidos o filtrados.
GET /admin/stats         — Contadores rápidos de sistema.

Todos los endpoints requieren is_admin=True (dependencia require_admin).
Admin actual: alexis12pineda@gmail.com
"""
from __future__ import annotations

import logging
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.core.config import settings
from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.processing_job import ProcessingJob
from app.models.uploaded_file import UploadedFile
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()

_VALID_PLANS = {"free", "pro", "friends_and_family"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class AdminUserSummary(BaseModel):
    user_id: str
    email: str
    full_name: str | None
    plan: str
    is_admin: bool
    is_suspended: bool
    is_verified: bool
    upload_count: int
    created_at: str

    model_config = {"from_attributes": True}


class AdminUserDetail(BaseModel):
    user_id: str
    email: str
    full_name: str | None
    plan: str
    is_admin: bool
    is_suspended: bool
    is_verified: bool
    social_provider: str | None
    totp_enabled: bool
    upload_count: int
    analysis_count: int
    kb_entries: int | None
    created_at: str
    updated_at: str


class PatchPlanRequest(BaseModel):
    plan: str = Field(..., description="free | pro | friends_and_family")


# ── GET /admin/users ──────────────────────────────────────────────────────────

@router.get("/users", summary="Lista paginada de usuarios")
def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> dict:
    """Lista todos los usuarios con conteo de uploads, paginada."""
    offset = (page - 1) * page_size
    total: int = db.scalar(select(func.count(User.user_id))) or 0
    users = db.scalars(
        select(User).order_by(User.created_at.desc()).offset(offset).limit(page_size)
    ).all()

    # Batch query de upload counts para evitar N+1
    user_ids = [u.user_id for u in users]
    upload_counts: dict[UUID, int] = {}
    if user_ids:
        rows = (
            db.query(UploadedFile.user_id, func.count(UploadedFile.file_id))
            .filter(UploadedFile.user_id.in_(user_ids))
            .group_by(UploadedFile.user_id)
            .all()
        )
        upload_counts = {r[0]: r[1] for r in rows}

    items = [
        {
            "user_id": str(u.user_id),
            "email": u.email,
            "full_name": u.full_name,
            "plan": u.plan,
            "is_admin": u.is_admin,
            "is_suspended": u.is_suspended,
            "is_verified": u.is_verified,
            "upload_count": upload_counts.get(u.user_id, 0),
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
    }


# ── GET /admin/users/{user_id} ────────────────────────────────────────────────

@router.get("/users/{user_id}", summary="Detalle de un usuario")
def get_user_detail(
    user_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> dict:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    upload_count: int = (
        db.scalar(
            select(func.count(UploadedFile.file_id)).where(
                UploadedFile.user_id == user_id
            )
        )
        or 0
    )
    analysis_count: int = (
        db.scalar(
            select(func.count(AnalysisSnapshot.snapshot_id)).where(
                AnalysisSnapshot.user_id == user_id
            )
        )
        or 0
    )

    # Último job
    last_job = (
        db.scalars(
            select(ProcessingJob)
            .where(ProcessingJob.user_id == user_id)
            .order_by(ProcessingJob.created_at.desc())
            .limit(1)
        ).first()
    )

    # Conteo de entradas KB personal
    kb_path = Path(settings.knowledge_bases_dir) / f"knowledge_base_user_{user_id}.json"
    kb_entries: int | None = None
    if kb_path.exists():
        try:
            import json
            with open(kb_path, "r", encoding="utf-8") as f:
                kb_data = json.load(f)
            kb_entries = len(kb_data.get("exact_matches", {}))
        except Exception:
            pass

    return {
        "user_id": str(user.user_id),
        "email": user.email,
        "full_name": user.full_name,
        "plan": user.plan,
        "is_admin": user.is_admin,
        "is_suspended": user.is_suspended,
        "is_verified": user.is_verified,
        "social_provider": user.social_provider,
        "totp_enabled": user.totp_enabled,
        "upload_count": upload_count,
        "analysis_count": analysis_count,
        "kb_entries": kb_entries,
        "last_job": {
            "job_id": str(last_job.job_id),
            "status": last_job.status,
            "created_at": last_job.created_at.isoformat() if last_job.created_at else None,
            "error_message": last_job.error_message,
        } if last_job else None,
        "created_at": user.created_at.isoformat(),
        "updated_at": user.updated_at.isoformat(),
    }


# ── POST /admin/users/{user_id}/suspend ──────────────────────────────────────

@router.post("/users/{user_id}/suspend", summary="Suspender un usuario")
def suspend_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="No se puede suspender a un administrador")
    user.is_suspended = True
    db.commit()
    logger.info("admin_action=suspend admin=%s target=%s", admin.email, user.email)
    return {"message": f"Usuario {user.email} suspendido.", "user_id": str(user_id)}


# ── POST /admin/users/{user_id}/unsuspend ─────────────────────────────────────

@router.post("/users/{user_id}/unsuspend", summary="Reactivar un usuario suspendido")
def unsuspend_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_suspended = False
    db.commit()
    logger.info("admin_action=unsuspend admin=%s target=%s", admin.email, user.email)
    return {"message": f"Usuario {user.email} reactivado.", "user_id": str(user_id)}


# ── PATCH /admin/users/{user_id}/plan ────────────────────────────────────────

@router.patch("/users/{user_id}/plan", summary="Cambiar plan de un usuario")
def patch_user_plan(
    user_id: UUID,
    body: PatchPlanRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    if body.plan not in _VALID_PLANS:
        raise HTTPException(
            status_code=400,
            detail=f"Plan inválido. Valores válidos: {sorted(_VALID_PLANS)}",
        )
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    old_plan = user.plan
    user.plan = body.plan
    db.commit()
    logger.info(
        "admin_action=change_plan admin=%s target=%s %s→%s",
        admin.email, user.email, old_plan, body.plan,
    )
    return {
        "message": f"Plan actualizado: {old_plan} → {body.plan}",
        "user_id": str(user_id),
        "plan": body.plan,
    }


# ── DELETE /admin/users/{user_id} ────────────────────────────────────────────

@router.delete("/users/{user_id}", summary="Eliminar usuario y todos sus datos")
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    """Elimina un usuario y TODOS sus datos (misma lógica que DELETE /users/me)."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="No se puede eliminar a un administrador")

    email = user.email  # guardar antes de borrar

    # Rutas físicas a limpiar ANTES de borrar en DB
    file_paths = [
        Path(uf.storage_path)
        for uf in db.query(UploadedFile.storage_path)
        .filter(UploadedFile.user_id == user_id)
        .all()
    ]
    kb_path = Path(settings.knowledge_bases_dir) / f"knowledge_base_user_{user_id}.json"

    # Borrar en DB — CASCADE limpia el resto
    db.delete(user)
    db.commit()

    # Limpiar filesystem (best-effort)
    for path in [kb_path, *file_paths]:
        if path.exists():
            try:
                path.unlink()
            except Exception:
                pass

    logger.info("admin_action=delete_user admin=%s target=%s", admin.email, email)
    return {"message": f"Usuario {email} eliminado correctamente."}


# ── GET /admin/jobs ───────────────────────────────────────────────────────────

@router.get("/jobs", summary="Jobs filtrados (por defecto, fallidos recientes)")
def list_jobs(
    job_status: str = Query(default="error", alias="status"),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> dict:
    jobs = (
        db.scalars(
            select(ProcessingJob)
            .where(ProcessingJob.status == job_status)
            .order_by(ProcessingJob.created_at.desc())
            .limit(limit)
        ).all()
    )
    return {
        "status_filter": job_status,
        "count": len(jobs),
        "jobs": [
            {
                "job_id": str(j.job_id),
                "user_id": str(j.user_id),
                "original_filename": j.original_filename,
                "status": j.status,
                "error_message": j.error_message,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "updated_at": j.updated_at.isoformat() if j.updated_at else None,
            }
            for j in jobs
        ],
    }


# ── GET /admin/stats ──────────────────────────────────────────────────────────

@router.get("/stats", summary="Contadores rápidos del sistema")
def get_stats(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> dict:
    total_users: int = db.scalar(select(func.count(User.user_id))) or 0
    verified_users: int = (
        db.scalar(select(func.count(User.user_id)).where(User.is_verified == True)) or 0  # noqa: E712
    )
    suspended_users: int = (
        db.scalar(select(func.count(User.user_id)).where(User.is_suspended == True)) or 0  # noqa: E712
    )
    total_uploads: int = db.scalar(select(func.count(UploadedFile.file_id))) or 0
    jobs_queued: int = (
        db.scalar(
            select(func.count(ProcessingJob.job_id)).where(
                ProcessingJob.status.in_(["queued", "processing"])
            )
        )
        or 0
    )
    jobs_error: int = (
        db.scalar(
            select(func.count(ProcessingJob.job_id)).where(ProcessingJob.status == "error")
        )
        or 0
    )

    plan_rows = (
        db.query(User.plan, func.count(User.user_id)).group_by(User.plan).all()
    )
    users_by_plan = {r[0]: r[1] for r in plan_rows}

    return {
        "users": {
            "total": total_users,
            "verified": verified_users,
            "unverified": total_users - verified_users,
            "suspended": suspended_users,
            "by_plan": users_by_plan,
        },
        "uploads": {"total": total_uploads},
        "jobs": {
            "queued_or_processing": jobs_queued,
            "error": jobs_error,
        },
    }
