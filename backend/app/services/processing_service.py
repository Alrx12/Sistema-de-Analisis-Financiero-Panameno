from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.processing_job import ProcessingJob
from app.models.user import User
from app.parsers.factory import ParserFactory
from app.services.account_detection_service import AccountDetectionService
from app.services.analysis_service import AnalysisService

logger = logging.getLogger(__name__)


class ProcessingService:
    def __init__(self, db: Session):
        self.db = db
        self.analysis_service = AnalysisService(db)
        self.account_detection_service = AccountDetectionService(db)

    def create_job(
        self,
        current_user: User,
        original_filename: str,
        file_type: str | None = None,
    ) -> ProcessingJob:
        job = ProcessingJob(
            user_id=current_user.user_id,
            status="queued",
            original_filename=original_filename,
            file_type=file_type,
            started_at=None,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def run_pipeline(
        self,
        job: ProcessingJob,
        file_path: str,
        current_user: User,
    ) -> dict[str, Any] | None:
        job.status = "processing"
        job.started_at = datetime.now(timezone.utc)
        self.db.add(job)
        self.db.commit()

        try:
            parser = ParserFactory.get_parser(file_path)
            parse_result = parser.parse(file_path)
            account_signatures = parse_result["account_signatures"]

            if len(account_signatures) > 1:
                raise ValueError("Archivo inconsistente o múltiples cuentas detectadas")

            transactions = parse_result["transactions"]
            detected_last4 = parse_result["detected_account_last4"]
            detected_bank = parser.bank_name

            account = self.account_detection_service.detect_or_create_account(
                current_user=current_user,
                bank_name=detected_bank,
                account_type="corriente",
                nickname=f"{detected_bank} principal",
                account_number_last4=detected_last4,
            )

            if account.confidence_score is not None and float(account.confidence_score) < 0.5:
                logger.warning(
                    "Cuenta detectada con baja confianza — job_id=%s account_id=%s confidence=%s",
                    job.job_id,
                    account.account_id,
                    account.confidence_score,
                )

            normalized_transactions = [
                {
                    **t,
                    "account_id": str(account.account_id),
                    "bank_name": account.bank_name,
                }
                for t in transactions
            ]

            user_display_name = current_user.full_name or current_user.username

            analysis = self.analysis_service.build_analysis(
                normalized_transactions,
                user_id=str(current_user.user_id),
                user_name=user_display_name,
            )

            snapshot = self.analysis_service.save_snapshot(analysis, current_user)

            self.analysis_service.save_transactions(
                snapshot_id=snapshot.snapshot_id,
                user_id=current_user.user_id,
                transactions=analysis["transactions"],
            )

            job.status = "success"
            job.completed_at = datetime.now(timezone.utc)
            self.db.add(job)
            self.db.commit()

            return analysis

        except Exception as exc:
            logger.exception(
                "Error en run_pipeline — job_id=%s user_id=%s file=%s",
                job.job_id,
                current_user.user_id,
                job.original_filename,
            )
            job.status = "error"
            job.error_message = str(exc)[:500]
            job.completed_at = datetime.now(timezone.utc)
            self.db.add(job)
            self.db.commit()
            return None

        finally:
            if os.path.exists(file_path):
                os.remove(file_path)