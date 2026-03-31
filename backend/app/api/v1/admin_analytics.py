"""
GET /admin/analytics — Dashboard de métricas de negocio SAFPRO

Protegido por require_admin. Devuelve métricas de adaptación digital y
monetización para seguimiento de la salud del producto.
"""

from datetime import date, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import func, distinct, case, text
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.models.user import User
from app.models.uploaded_file import UploadedFile
from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.analysis_transaction import AnalysisTransaction
from app.models.processing_job import ProcessingJob

router = APIRouter()


@router.get("/analytics")
def get_analytics(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> dict:
    """Dashboard completo de métricas de negocio y calidad del sistema."""

    # ── 1. OVERVIEW ─────────────────────────────────────────────────────────────

    total_users: int = db.query(func.count(User.user_id)).scalar() or 0

    # Usuarios con al menos 1 upload
    activated_users: int = (
        db.query(func.count(distinct(UploadedFile.user_id))).scalar() or 0
    )

    activation_rate = round(activated_users / total_users * 100, 1) if total_users else 0.0

    total_uploads: int = db.query(func.count(UploadedFile.file_id)).scalar() or 0
    total_analyses: int = db.query(func.count(AnalysisSnapshot.snapshot_id)).scalar() or 0
    failed_jobs: int = (
        db.query(func.count(ProcessingJob.job_id))
        .filter(ProcessingJob.status == "error")
        .scalar()
        or 0
    )

    # Distribución por plan
    plan_rows = (
        db.query(User.plan, func.count(User.user_id))
        .group_by(User.plan)
        .all()
    )
    users_by_plan = {row[0]: row[1] for row in plan_rows}

    # Usuarios suspendidos / admin
    suspended_users: int = (
        db.query(func.count(User.user_id))
        .filter(User.is_suspended == True)  # noqa: E712
        .scalar()
        or 0
    )
    admin_users: int = (
        db.query(func.count(User.user_id))
        .filter(User.is_admin == True)  # noqa: E712
        .scalar()
        or 0
    )

    # ── 2. RETENCIÓN ────────────────────────────────────────────────────────────

    # Usuarios con exactamente 1 análisis vs más de 1
    analyses_per_user_rows = (
        db.query(AnalysisSnapshot.user_id, func.count(AnalysisSnapshot.snapshot_id).label("n"))
        .group_by(AnalysisSnapshot.user_id)
        .all()
    )

    users_1_analysis = sum(1 for r in analyses_per_user_rows if r.n == 1)
    users_2plus_analyses = sum(1 for r in analyses_per_user_rows if r.n >= 2)
    total_with_analysis = len(analyses_per_user_rows)
    retention_rate = (
        round(users_2plus_analyses / total_with_analysis * 100, 1)
        if total_with_analysis > 0
        else 0.0
    )
    avg_analyses_per_user = (
        round(sum(r.n for r in analyses_per_user_rows) / total_with_analysis, 2)
        if total_with_analysis > 0
        else 0.0
    )

    uploads_per_user_rows = (
        db.query(UploadedFile.user_id, func.count(UploadedFile.file_id).label("n"))
        .group_by(UploadedFile.user_id)
        .all()
    )
    avg_uploads_per_user = (
        round(
            sum(r.n for r in uploads_per_user_rows) / len(uploads_per_user_rows), 2
        )
        if uploads_per_user_rows
        else 0.0
    )

    # ── 3. CALIDAD DEL SISTEMA ───────────────────────────────────────────────────

    quality_row = db.query(
        func.avg(AnalysisTransaction.confidence).label("avg_conf"),
        func.count(AnalysisTransaction.transaction_id).label("total"),
        func.sum(
            case((AnalysisTransaction.confidence < 0.8, 1), else_=0)
        ).label("low"),
    ).first()

    avg_confidence = round(float(quality_row.avg_conf or 0), 3)
    total_transactions = int(quality_row.total or 0)
    low_confidence_count = int(quality_row.low or 0)
    low_confidence_ratio = (
        round(low_confidence_count / total_transactions * 100, 1)
        if total_transactions > 0
        else 0.0
    )

    # Distribución por método de clasificación (indica nivel de aprendizaje del KB)
    method_rows = (
        db.query(AnalysisTransaction.method, func.count(AnalysisTransaction.transaction_id))
        .group_by(AnalysisTransaction.method)
        .all()
    )
    transactions_by_method = {row[0]: row[1] for row in method_rows}

    # ── 4. TENDENCIAS MENSUALES ──────────────────────────────────────────────────

    # Nuevos usuarios por mes (últimos 12 meses)
    users_by_month_rows = (
        db.query(
            func.to_char(User.created_at, "YYYY-MM").label("month"),
            func.count(User.user_id).label("count"),
        )
        .filter(User.created_at >= date.today() - timedelta(days=365))
        .group_by(text("month"))
        .order_by(text("month"))
        .all()
    )
    users_by_month = [{"month": r.month, "count": r.count} for r in users_by_month_rows]

    # Uploads por mes (últimos 12 meses)
    uploads_by_month_rows = (
        db.query(
            func.to_char(UploadedFile.uploaded_at, "YYYY-MM").label("month"),
            func.count(UploadedFile.file_id).label("count"),
        )
        .filter(UploadedFile.uploaded_at >= date.today() - timedelta(days=365))
        .group_by(text("month"))
        .order_by(text("month"))
        .all()
    )
    uploads_by_month = [{"month": r.month, "count": r.count} for r in uploads_by_month_rows]

    # ── 5. BANCOS ────────────────────────────────────────────────────────────────

    bank_rows = (
        db.query(
            UploadedFile.detected_bank_name,
            func.count(UploadedFile.file_id).label("count"),
        )
        .filter(UploadedFile.detected_bank_name.isnot(None))
        .group_by(UploadedFile.detected_bank_name)
        .order_by(func.count(UploadedFile.file_id).desc())
        .all()
    )
    top_banks = [{"bank": r.detected_bank_name, "count": r.count} for r in bank_rows]

    # ── 6. JOBS RECIENTES FALLIDOS ───────────────────────────────────────────────

    recent_failed = (
        db.query(
            ProcessingJob.job_id,
            ProcessingJob.user_id,
            ProcessingJob.created_at,
            ProcessingJob.error_message,
        )
        .filter(ProcessingJob.status == "error")
        .order_by(ProcessingJob.created_at.desc())
        .limit(10)
        .all()
    )
    failed_jobs_recent = [
        {
            "job_id": str(r.job_id),
            "user_id": str(r.user_id),
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "error_message": r.error_message,
        }
        for r in recent_failed
    ]

    # ── RESPUESTA ────────────────────────────────────────────────────────────────

    return {
        "overview": {
            "total_users": total_users,
            "activated_users": activated_users,
            "activation_rate": activation_rate,
            "total_uploads": total_uploads,
            "total_analyses": total_analyses,
            "failed_jobs": failed_jobs,
            "suspended_users": suspended_users,
            "admin_users": admin_users,
            "users_by_plan": users_by_plan,
        },
        "retention": {
            "users_with_1_analysis": users_1_analysis,
            "users_with_2plus_analyses": users_2plus_analyses,
            "retention_rate": retention_rate,
            "avg_analyses_per_user": avg_analyses_per_user,
            "avg_uploads_per_user": avg_uploads_per_user,
        },
        "quality": {
            "avg_confidence": avg_confidence,
            "total_transactions": total_transactions,
            "low_confidence_count": low_confidence_count,
            "low_confidence_ratio": low_confidence_ratio,
            "transactions_by_method": transactions_by_method,
        },
        "trends": {
            "users_by_month": users_by_month,
            "uploads_by_month": uploads_by_month,
        },
        "top_banks": top_banks,
        "failed_jobs_recent": failed_jobs_recent,
    }
