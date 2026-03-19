from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bank_account import BankAccount


class AccountRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, account: BankAccount) -> BankAccount:
        self.db.add(account)
        self.db.commit()
        self.db.refresh(account)
        return account

    def list_by_user(self, user_id: UUID) -> list[BankAccount]:
        statement = (
            select(BankAccount)
            .where(BankAccount.user_id == user_id)
            .order_by(BankAccount.created_at.desc())
        )
        return list(self.db.scalars(statement).all())

    def get_by_id_for_user(self, account_id: UUID, user_id: UUID) -> BankAccount | None:
        statement = select(BankAccount).where(
            BankAccount.account_id == account_id,
            BankAccount.user_id == user_id,
        )
        return self.db.scalar(statement)

    def get_by_fingerprint_for_user(self, fingerprint: str, user_id: UUID) -> BankAccount | None:
        statement = select(BankAccount).where(
            BankAccount.user_id == user_id,
            BankAccount.account_fingerprint == fingerprint,
        )
        return self.db.scalar(statement)

    def save(self, account: BankAccount) -> BankAccount:
        self.db.add(account)
        self.db.commit()
        self.db.refresh(account)
        return account