from __future__ import annotations

import hashlib
import re
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.bank_account import BankAccount
from app.models.user import User
from app.repositories.account_repository import *
from app.schemas.account import AccountCreate, AccountUpdate


class AccountService:
    def __init__(self, db: Session):
        self.repository = AccountRepository(db)

    def list_accounts(self, current_user: User) -> list[BankAccount]:
        return self.repository.list_by_user(current_user.user_id)

    def get_account(self, account_id: UUID, current_user: User) -> BankAccount:
        account = self.repository.get_by_id_for_user(account_id, current_user.user_id)
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta no encontrada")
        return account

    def create_account(self, payload: AccountCreate, current_user: User) -> BankAccount:
        fingerprint = self._build_fingerprint(
            user_id=current_user.user_id,
            bank_name=payload.bank_name,
            account_type=payload.account_type,
            nickname=payload.nickname,
            account_number_last4=payload.account_number_last4,
        )
        self._ensure_unique_fingerprint(fingerprint, current_user.user_id)

        account = BankAccount(
            user_id=current_user.user_id,
            bank_name=payload.bank_name.strip(),
            account_type=payload.account_type.strip(),
            nickname=payload.nickname.strip(),
            account_number_last4=self._normalize_last4(payload.account_number_last4),
            account_fingerprint=fingerprint,
            detection_source="manual",
            confidence_score=None,
            is_active=True,
        )
        return self._save_account(account)

    def update_account(self, account_id: UUID, payload: AccountUpdate, current_user: User) -> BankAccount:
        account = self.get_account(account_id, current_user)

        account_type = payload.account_type.strip() if payload.account_type is not None else account.account_type
        nickname = payload.nickname.strip() if payload.nickname is not None else account.nickname
        account_number_last4 = (
            self._normalize_last4(payload.account_number_last4)
            if payload.account_number_last4 is not None
            else account.account_number_last4
        )

        new_fingerprint = self._build_fingerprint(
            user_id=current_user.user_id,
            bank_name=account.bank_name,
            account_type=account_type,
            nickname=nickname,
            account_number_last4=account_number_last4,
        )

        existing = self.repository.get_by_fingerprint_for_user(new_fingerprint, current_user.user_id)
        if existing and existing.account_id != account.account_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe una cuenta con la misma huella para este usuario",
            )

        account.account_type = account_type
        account.nickname = nickname
        account.account_number_last4 = account_number_last4
        account.account_fingerprint = new_fingerprint
        if payload.is_active is not None:
            account.is_active = payload.is_active

        return self._save_account(account)

    def deactivate_account(self, account_id: UUID, current_user: User) -> BankAccount:
        account = self.get_account(account_id, current_user)
        account.is_active = False
        return self._save_account(account)

    def _save_account(self, account: BankAccount) -> BankAccount:
        try:
            return self.repository.save(account)
        except IntegrityError:
            self.repository.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe una cuenta con la misma huella para este usuario",
            )

    def _ensure_unique_fingerprint(self, fingerprint: str, user_id: UUID) -> None:
        existing = self.repository.get_by_fingerprint_for_user(fingerprint, user_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe una cuenta con la misma huella para este usuario",
            )

    @staticmethod
    def _normalize_last4(last4: str | None) -> str | None:
        if last4 is None:
            return None
        normalized = last4.strip()
        return normalized or None

    @staticmethod
    def _normalize_text(value: str) -> str:
        return re.sub(r"\s+", " ", value.strip().lower())

    def _build_fingerprint(
        self,
        *,
        user_id: UUID,
        bank_name: str,
        account_type: str,
        nickname: str,
        account_number_last4: str | None,
    ) -> str:
        parts = [
            str(user_id),
            self._normalize_text(bank_name),
            self._normalize_text(account_type),
        ]
        if account_number_last4:
            parts.append(account_number_last4.strip())
        else:
            parts.append(self._normalize_text(nickname))
        raw_value = "|".join(parts)
        return hashlib.sha256(raw_value.encode("utf-8")).hexdigest()