"""
GET/POST/PATCH/DELETE /admin/users/* — Gestión de usuarios para el admin de SAFPRO.
GET /admin/jobs          — Jobs fallidos o filtrados.
GET /admin/stats         — Contadores rápidos de sistema.

Todos los endpoints requieren is_admin=True (dependencia require_admin).
Admin actual: alexis12pineda@gmail.com
"""
from __future__ import annotations

import logging
import shutil
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.core.config import settings
from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.processing_job import ProcessingJob
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.models.user_profile import UserProfile

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
    limit: int = Query(default=100, ge=1, le=500),
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

    # Batch-query emails para evitar N+1
    user_ids = list({j.user_id for j in jobs})
    user_emails: dict = {}
    if user_ids:
        rows = db.scalars(select(User).where(User.user_id.in_(user_ids))).all()
        user_emails = {u.user_id: u.email for u in rows}

    failed_dir = Path(settings.failed_dir)

    return {
        "status_filter": job_status,
        "count": len(jobs),
        "jobs": [
            {
                "job_id": str(j.job_id),
                "user_id": str(j.user_id),
                "user_email": user_emails.get(j.user_id, "—"),
                "original_filename": j.original_filename,
                "status": j.status,
                "error_message": j.error_message,
                "failed_file_exists": (failed_dir / str(j.job_id)).exists(),
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "updated_at": j.updated_at.isoformat() if j.updated_at else None,
            }
            for j in jobs
        ],
    }


# ── GET /admin/jobs/{job_id}/download ─────────────────────────────────────────

@router.get("/jobs/{job_id}/download", summary="Descargar archivo fallido para diagnóstico")
def download_failed_file(
    job_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> FileResponse:
    """Descarga el archivo que falló al procesarse. Solo disponible si el archivo fue preservado."""
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    failed_path = Path(settings.failed_dir) / str(job_id)
    if not failed_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Archivo no encontrado. Fue descartado o procesado exitosamente.",
        )

    filename = job.original_filename or f"failed_{job_id}.xlsx"
    return FileResponse(
        path=str(failed_path),
        filename=filename,
        media_type="application/octet-stream",
    )


# ── POST /admin/jobs/{job_id}/retry ───────────────────────────────────────────

@router.post("/jobs/{job_id}/retry", summary="Re-encolar un job fallido para re-procesamiento")
def retry_failed_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    """
    Mueve el archivo preservado de storage/failed/ a storage/temp/ y crea un nuevo job en Celery.
    El job original queda como 'error' en el historial — se crea uno nuevo.
    """
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    if job.status != "error":
        raise HTTPException(status_code=400, detail="Solo se pueden re-procesar jobs con status='error'")

    failed_path = Path(settings.failed_dir) / str(job_id)
    if not failed_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Archivo fallido no encontrado. No se puede re-procesar sin el archivo original.",
        )

    # Cargar el usuario dueño del job
    user = db.get(User, job.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Mover de failed/ → temp/ con nombre temporal único
    temp_dir = Path(settings.temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)
    new_temp_path = temp_dir / str(job_id)  # mismo nombre = job_id, sin extensión

    try:
        shutil.move(str(failed_path), str(new_temp_path))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo mover el archivo: {exc}")

    # Crear un nuevo ProcessingJob para el retry
    from app.services.processing_service import ProcessingService
    from app.workers.tasks import process_file_task

    svc = ProcessingService(db)
    new_job = svc.create_job(
        current_user=user,
        original_filename=job.original_filename,
        file_type=job.file_type,
    )

    # Encolar en Celery (sin content_hash para que no haya 409 por deduplicación)
    process_file_task.delay(
        file_path=str(new_temp_path),
        original_filename=job.original_filename or "",
        user_id=str(user.user_id),
        job_id=str(new_job.job_id),
    )

    logger.info(
        "admin_action=retry_job admin=%s original_job=%s new_job=%s user=%s",
        admin.email, job_id, new_job.job_id, user.email,
    )

    return {
        "message": "Re-procesamiento iniciado correctamente.",
        "original_job_id": str(job_id),
        "new_job_id": str(new_job.job_id),
        "user_email": user.email,
    }


# ── DELETE /admin/jobs/{job_id}/failed-file ───────────────────────────────────

@router.delete("/jobs/{job_id}/failed-file", summary="Descartar archivo fallido (sin re-procesar)")
def discard_failed_file(
    job_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    """Elimina el archivo fallido de storage/failed/. El job queda en el historial como 'error'."""
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    failed_path = Path(settings.failed_dir) / str(job_id)
    if not failed_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    try:
        failed_path.unlink()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo eliminar el archivo: {exc}")

    logger.info(
        "admin_action=discard_failed_file admin=%s job_id=%s user_id=%s",
        admin.email, job_id, job.user_id,
    )
    return {"message": "Archivo fallido descartado.", "job_id": str(job_id)}


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


# ── Email broadcast ───────────────────────────────────────────────────────────

_VALID_SEGMENTS = {
    "all", "unverified", "no_onboarding", "active",
    "free", "pro", "friends_and_family", "specific",
}

_SEGMENT_LABELS = {
    "all": "Todos los usuarios activos",
    "unverified": "Sin verificar (solo email/password)",
    "no_onboarding": "Sin onboarding completado",
    "active": "Verificados con onboarding completo",
    "free": "Plan Free",
    "pro": "Plan Pro",
    "friends_and_family": "Plan Friends & Family",
    "specific": "Email específico",
}


class EmailBroadcastRequest(BaseModel):
    subject: str = Field(..., min_length=1, max_length=200)
    body_html: str = Field(..., min_length=1, max_length=50_000)
    segment: str = Field(..., description="all|unverified|no_onboarding|active|free|pro|friends_and_family|specific")
    specific_email: str | None = Field(default=None)


def _query_segment(db: Session, segment: str, specific_email: str | None) -> list:
    """Devuelve lista de (email, full_name) según el segmento."""
    base = (
        db.query(User.email, User.full_name, User.is_verified, User.social_provider, User.plan)
        .filter(User.is_suspended == False, User.is_admin == False)  # noqa: E712
    )

    if segment == "specific":
        if not specific_email:
            return []
        return (
            db.query(User.email, User.full_name)
            .filter(User.email == specific_email, User.is_suspended == False)  # noqa: E712
            .all()
        )

    if segment == "unverified":
        rows = base.filter(User.is_verified == False, User.social_provider == None).all()  # noqa: E712
        return [(r.email, r.full_name) for r in rows]

    if segment == "no_onboarding":
        rows = (
            db.query(User.email, User.full_name)
            .join(UserProfile, UserProfile.user_id == User.user_id, isouter=True)
            .filter(
                User.is_suspended == False,  # noqa: E712
                User.is_admin == False,  # noqa: E712
                User.is_verified == True,  # noqa: E712
                (UserProfile.onboarding_completed == False) | (UserProfile.user_id == None),  # noqa: E712
            )
            .all()
        )
        return [(r.email, r.full_name) for r in rows]

    if segment == "active":
        rows = (
            db.query(User.email, User.full_name)
            .join(UserProfile, UserProfile.user_id == User.user_id)
            .filter(
                User.is_suspended == False,  # noqa: E712
                User.is_admin == False,  # noqa: E712
                User.is_verified == True,  # noqa: E712
                UserProfile.onboarding_completed == True,  # noqa: E712
            )
            .all()
        )
        return [(r.email, r.full_name) for r in rows]

    if segment in {"free", "pro", "friends_and_family"}:
        rows = base.filter(User.plan == segment).all()
        return [(r.email, r.full_name) for r in rows]

    # all
    rows = base.all()
    return [(r.email, r.full_name) for r in rows]


@router.get("/email/segments", summary="Conteo de usuarios por segmento de email")
def get_email_segments(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> dict:
    """Devuelve cuántos usuarios hay en cada segmento de envío."""
    counts = {}
    for seg in _VALID_SEGMENTS:
        if seg == "specific":
            counts[seg] = {"label": _SEGMENT_LABELS[seg], "count": None}
            continue
        recipients = _query_segment(db, seg, None)
        counts[seg] = {"label": _SEGMENT_LABELS[seg], "count": len(recipients)}
    return counts


@router.post("/email/send", summary="Enviar email broadcast a un segmento")
def send_email_broadcast(
    body: EmailBroadcastRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    """
    Envía un email compuesto por el admin a todos los usuarios del segmento elegido.
    El cuerpo (body_html) se envuelve automáticamente en el template SAFPRO.
    """
    if body.segment not in _VALID_SEGMENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Segmento inválido. Válidos: {sorted(_VALID_SEGMENTS)}",
        )
    if body.segment == "specific" and not body.specific_email:
        raise HTTPException(status_code=400, detail="specific_email es requerido para segmento 'specific'")

    recipients = _query_segment(db, body.segment, body.specific_email)
    if not recipients:
        return {"sent": 0, "failed": 0, "total": 0, "segment": body.segment}

    from app.services.email_service import send_admin_broadcast_email

    sent = failed = 0
    errors: list[str] = []

    for email, full_name in recipients:
        try:
            send_admin_broadcast_email(
                to_email=email,
                full_name=full_name,
                subject=body.subject,
                body_html=body.body_html,
            )
            sent += 1
        except Exception as exc:
            failed += 1
            errors.append(f"{email}: {exc}")
            logger.error("broadcast_fail to=%s err=%s", email, exc)

    logger.info(
        "admin_action=email_broadcast admin=%s segment=%s sent=%d failed=%d",
        admin.email, body.segment, sent, failed,
    )

    return {
        "sent": sent,
        "failed": failed,
        "total": len(recipients),
        "segment": body.segment,
        "errors": errors if errors else None,
    }
