from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.processing_job import ProcessingJob
from app.models.uploaded_file import UploadedFile
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

    def record_uploaded_file(
        self,
        *,
        user_id,
        original_filename: str,
        file_path: str,
        content_hash: str,
        file_size: int | None,
        bank_name: str | None = None,
        account_last4: str | None = None,
        account_id=None,
    ) -> None:
        """
        Registra el archivo en `uploaded_files` tras un pipeline exitoso.
        La UniqueConstraint (user_id, checksum) garantiza que no haya duplicados silenciosos.
        Si por alguna razón ya existe (carrera de condición), simplemente no hace nada.
        """
        from sqlalchemy.exc import IntegrityError

        try:
            record = UploadedFile(
                user_id=user_id,
                account_id=account_id,
                original_filename=original_filename,
                storage_path=file_path,
                file_size_bytes=file_size,
                checksum=content_hash,
                detected_bank_name=bank_name,
                detected_account_last4=account_last4,
                status="processed",
            )
            self.db.add(record)
            self.db.commit()
        except IntegrityError:
            # Duplicado — ya existía (carrera de condición muy improbable). Ignorar.
            self.db.rollback()
            logger.warning(
                "record_uploaded_file: checksum ya existía (carrera de condición) — user_id=%s hash=%s",
                user_id, content_hash[:16],
            )

    def run_pipeline(
        self,
        job: ProcessingJob,
        file_path: str,
        current_user: User,
        content_hash: str | None = None,
        file_size: int | None = None,
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

            # Guardar el saldo más reciente del estado de cuenta en la cuenta bancaria
            latest_balance = parse_result.get("latest_balance")
            if latest_balance is not None:
                account.available_balance = latest_balance
                self.db.add(account)
                self.db.commit()

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

            snapshot = self.analysis_service.save_snapshot(
                analysis, current_user, bank_account_id=account.account_id
            )

            self.analysis_service.save_transactions(
                snapshot_id=snapshot.snapshot_id,
                user_id=current_user.user_id,
                transactions=analysis["transactions"],
            )

            job.status = "success"
            job.completed_at = datetime.now(timezone.utc)
            self.db.add(job)
            self.db.commit()

            # Registrar el archivo para deduplicación futura.
            # Solo si se recibió el hash (uploads vía API normal siempre lo pasan).
            if content_hash:
                self.record_uploaded_file(
                    user_id=current_user.user_id,
                    original_filename=job.original_filename or "",
                    file_path=file_path,
                    content_hash=content_hash,
                    file_size=file_size,
                    bank_name=detected_bank,
                    account_last4=detected_last4,
                    account_id=account.account_id,
                )

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
                try:
                    if job.status == "error":
                        # Preservar archivo para que el admin pueda descargarlo y diagnosticar
                        failed_dir = Path(settings.failed_dir)
                        failed_dir.mkdir(parents=True, exist_ok=True)
                        dest = failed_dir / str(job.job_id)
                        shutil.move(file_path, str(dest))
                        logger.info(
                            "Archivo fallido preservado — job_id=%s dest=%s", job.job_id, dest
                        )
                    else:
                        os.remove(file_path)
                except OSError:
                    logger.warning("No se pudo mover/eliminar archivo temporal: %s", file_path)