from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
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
    
    def process_file(self, file_path: str, original_filename: str, current_user: User) -> dict[str, Any]:
        file_type = Path(original_filename).suffix.lower().lstrip(".") or Path(file_path).suffix.lower().lstrip(".")
        job = ProcessingJob(
            user_id=current_user.user_id,
            status="processing",
            original_filename=original_filename,
            file_type=file_type,
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)

        try:
            parser = ParserFactory.get_parser(file_path)
            parse_result = parser.parse(file_path)
            account_signatures = parse_result["account_signatures"]
            if len(account_signatures) > 1:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Archivo inconsistente o múltiples cuentas detectadas",
                )

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
                    "Cuenta detectada con baja confianza para job_id=%s, account_id=%s, confidence=%s",
                    job.job_id,
                    account.account_id,
                    account.confidence_score,
                )

            normalized_transactions = [
                {
                    **transaction,
                    "account_id": str(account.account_id),
                    "bank_name": account.bank_name,
                }
                for transaction in transactions
            ]
            user_display_name = current_user.full_name or current_user.username
            analysis = self.analysis_service.build_analysis(
                normalized_transactions,
                user_id=str(current_user.user_id),
                user_name=user_display_name,
            )
            self.analysis_service.save_snapshot(analysis, current_user)

            job.status = "success"
            job.completed_at = datetime.now(timezone.utc)
            self.db.add(job)
            self.db.commit()

            return {"status": "done", "analysis": analysis}
        except ValueError as exc:
            job.status = "error"
            job.error_message = str(exc)
            job.completed_at = datetime.now(timezone.utc)
            self.db.add(job)
            self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            )
        except HTTPException as exc:
            job.status = "error"
            job.error_message = exc.detail if isinstance(exc.detail, str) else "http_error"
            job.completed_at = datetime.now(timezone.utc)
            self.db.add(job)
            self.db.commit()
            raise
        except Exception as exc:
            logger.exception(
                "Error inesperado en process_file — user_id=%s file=%s",
                current_user.user_id,
                original_filename,
            )
            job.status = "error"
            job.error_message = str(exc)[:500]
            job.completed_at = datetime.now(timezone.utc)
            self.db.add(job)
            self.db.commit()
            from app.core.config import settings
            detail = str(exc) if settings.debug else "Error interno"
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail)
        finally:
            if os.path.exists(file_path):
                os.remove(file_path)