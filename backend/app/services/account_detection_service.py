from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models.bank_account import BankAccount
from app.models.user import User
from app.services.account_service import AccountService

logger = logging.getLogger(__name__)


class AccountDetectionService:
    def __init__(self, db: Session):
        self.db = db
        self.account_service = AccountService(db)

    def detect_or_create_account(
        self,
        *,
        current_user: User,
        bank_name: str,
        account_type: str,
        nickname: str,
        account_number_last4: str | None = None,
        confidence_score: float | None = None,
    ) -> BankAccount:
        normalized_last4 = self.account_service._normalize_last4(account_number_last4)
        computed_confidence = self._compute_confidence_score(bank_name, normalized_last4)
        fingerprint = self.account_service._build_fingerprint(
            user_id=current_user.user_id,
            bank_name=bank_name,
            account_type=account_type,
            nickname=nickname,
            account_number_last4=normalized_last4,
        )
        existing = self.account_service.repository.get_by_fingerprint_for_user(fingerprint, current_user.user_id)
        if existing:
            return existing

        if computed_confidence < 0.5:
            logger.warning(
                "Detección de cuenta con baja confianza para user_id=%s, bank_name=%s, last4=%s, confidence=%s",
                current_user.user_id,
                bank_name,
                normalized_last4,
                computed_confidence,
            )

        account = BankAccount(
            user_id=current_user.user_id,
            bank_name=bank_name.strip(),
            account_type=account_type.strip(),
            nickname=nickname.strip(),
            account_number_last4=normalized_last4,
            account_fingerprint=fingerprint,
            detection_source="file",
            confidence_score=confidence_score if confidence_score is not None else computed_confidence,
            is_active=True,
        )
        return self.account_service._save_account(account)

    @staticmethod
    def _compute_confidence_score(bank_name: str, account_number_last4: str | None) -> float:
        if account_number_last4:
            return 0.95
        if bank_name and bank_name != "Banco no identificado":
            return 0.35
        return 0.2