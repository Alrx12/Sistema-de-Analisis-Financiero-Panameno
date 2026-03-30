"""
Tests para verificar que GET /analysis y GET /analysis/{id} incluyen
la información de la cuenta bancaria (bank_account) en el response.

Patrón: mocks explícitos (DummyUser, DummySnapshot, DummyBankAccount, FakeDB)
sin levantar lifespan ni conectar a PostgreSQL.
TestClient(app) sin context manager para no disparar lifespan.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_db
from app.main import app


# ---------------------------------------------------------------------------
# Fixtures helpers
# ---------------------------------------------------------------------------

class DummyUser:
    def __init__(self, user_id):
        self.user_id = user_id
        self.username = "lex"
        self.full_name = "Lex"


class DummyBankAccount:
    def __init__(self, account_id, bank_name, nickname, last4=None):
        self.account_id = account_id
        self.bank_name = bank_name
        self.nickname = nickname
        self.account_number_last4 = last4
        self.available_balance = None  # añadido en migración i9d6e4f3g2h1


class DummySnapshot:
    def __init__(self, snapshot_id, user_id, bank_account_id=None):
        self.snapshot_id = snapshot_id
        self.user_id = user_id
        self.bank_account_id = bank_account_id
        self.created_at = datetime.now(timezone.utc)
        self.period_start = None
        self.period_end = None
        self.summary = {
            "total_transactions": 3,
            "total_income": 1000.0,
            "total_expenses": 200.0,
            "balance": 800.0,
            "categories": {"alimentacion": 200.0},
        }
        self.recommendations = []


class FakeDB:
    """
    DB mínima para los endpoints de analysis.
    - query().filter().order_by().limit().all()  → lista de snapshots
    - query().filter().all()                     → lista de BankAccounts
    - get(Model, pk)                             → objeto por PK
    """
    def __init__(self, snapshots, bank_accounts):
        self._snapshots = {s.snapshot_id: s for s in snapshots}
        self._bank_accounts = {a.account_id: a for a in bank_accounts}

    def get(self, model, pk):
        from app.models.analysis_snapshot import AnalysisSnapshot
        from app.models.bank_account import BankAccount
        if model is AnalysisSnapshot:
            return self._snapshots.get(pk)
        if model is BankAccount:
            return self._bank_accounts.get(pk)
        return None

    def query(self, model):
        return _FakeQuery(model, self._snapshots, self._bank_accounts)


class _FakeQuery:
    def __init__(self, model, snapshots, bank_accounts):
        from app.models.analysis_snapshot import AnalysisSnapshot
        from app.models.bank_account import BankAccount
        if model is AnalysisSnapshot:
            self._items = list(snapshots.values())
        elif model is BankAccount:
            self._items = list(bank_accounts.values())
        else:
            self._items = []

    def filter(self, *args):
        return self

    def filter_by(self, **kwargs):
        return self

    def order_by(self, *args):
        return self

    def limit(self, n):
        return self

    def in_(self, values):
        return self

    def all(self):
        return self._items

    def first(self):
        return self._items[0] if self._items else None


# ---------------------------------------------------------------------------
# Tests: GET /analysis — lista con bank_account
# ---------------------------------------------------------------------------

class TestListAnalysisWithBankAccount:
    def test_snapshot_with_bank_account_returns_bank_info(self):
        user_id = uuid4()
        account_id = uuid4()
        snapshot_id = uuid4()

        account = DummyBankAccount(account_id, "Banco General", "BG Principal", last4="1234")
        snapshot = DummySnapshot(snapshot_id, user_id, bank_account_id=account_id)

        fake_db = FakeDB([snapshot], [account])

        def override_db():
            return fake_db

        def override_user():
            return DummyUser(user_id)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = override_user

        try:
            client = TestClient(app)
            resp = client.get("/api/v1/analysis/")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            ba = data[0]["bank_account"]
            assert ba is not None
            assert ba["bank_name"] == "Banco General"
            assert ba["account_last4"] == "1234"
            assert ba["nickname"] == "BG Principal"
            assert ba["account_id"] == str(account_id)
        finally:
            app.dependency_overrides.pop(get_db, None)
            app.dependency_overrides.pop(get_current_user, None)

    def test_snapshot_without_bank_account_returns_null(self):
        user_id = uuid4()
        snapshot_id = uuid4()
        snapshot = DummySnapshot(snapshot_id, user_id, bank_account_id=None)

        fake_db = FakeDB([snapshot], [])

        def override_db():
            return fake_db

        def override_user():
            return DummyUser(user_id)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = override_user

        try:
            client = TestClient(app)
            resp = client.get("/api/v1/analysis/")
            assert resp.status_code == 200
            data = resp.json()
            assert data[0]["bank_account"] is None
        finally:
            app.dependency_overrides.pop(get_db, None)
            app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# Tests: GET /analysis/{id} — detalle con bank_account
# ---------------------------------------------------------------------------

class TestGetAnalysisWithBankAccount:
    def test_returns_bank_account_for_known_snapshot(self):
        user_id = uuid4()
        account_id = uuid4()
        snapshot_id = uuid4()

        account = DummyBankAccount(account_id, "BAC Credomatic", "BAC Ahorros", last4="7909")
        snapshot = DummySnapshot(snapshot_id, user_id, bank_account_id=account_id)

        fake_db = FakeDB([snapshot], [account])

        def override_db():
            return fake_db

        def override_user():
            return DummyUser(user_id)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = override_user

        try:
            client = TestClient(app)
            resp = client.get(f"/api/v1/analysis/{snapshot_id}")
            assert resp.status_code == 200
            ba = resp.json()["bank_account"]
            assert ba["bank_name"] == "BAC Credomatic"
            assert ba["account_last4"] == "7909"
            assert ba["nickname"] == "BAC Ahorros"
        finally:
            app.dependency_overrides.pop(get_db, None)
            app.dependency_overrides.pop(get_current_user, None)

    def test_returns_null_bank_account_when_not_linked(self):
        user_id = uuid4()
        snapshot_id = uuid4()
        snapshot = DummySnapshot(snapshot_id, user_id, bank_account_id=None)

        fake_db = FakeDB([snapshot], [])

        def override_db():
            return fake_db

        def override_user():
            return DummyUser(user_id)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = override_user

        try:
            client = TestClient(app)
            resp = client.get(f"/api/v1/analysis/{snapshot_id}")
            assert resp.status_code == 200
            assert resp.json()["bank_account"] is None
        finally:
            app.dependency_overrides.pop(get_db, None)
            app.dependency_overrides.pop(get_current_user, None)

    def test_returns_404_for_wrong_user(self):
        user_id = uuid4()
        other_user_id = uuid4()
        snapshot_id = uuid4()
        snapshot = DummySnapshot(snapshot_id, other_user_id)  # otro usuario

        fake_db = FakeDB([snapshot], [])

        def override_db():
            return fake_db

        def override_user():
            return DummyUser(user_id)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = override_user

        try:
            client = TestClient(app)
            resp = client.get(f"/api/v1/analysis/{snapshot_id}")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.pop(get_db, None)
            app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# Tests: BankAccountSummary schema directo
# ---------------------------------------------------------------------------

class TestBankAccountSummarySchema:
    def test_builds_from_fields(self):
        from app.schemas.analysis import BankAccountSummary
        account_id = uuid4()
        ba = BankAccountSummary(
            account_id=account_id,
            bank_name="Banistmo",
            account_last4="9629",
            nickname="Banistmo Principal",
        )
        assert ba.bank_name == "Banistmo"
        assert ba.account_last4 == "9629"
        assert ba.account_id == account_id

    def test_account_last4_is_optional(self):
        from app.schemas.analysis import BankAccountSummary
        ba = BankAccountSummary(
            account_id=uuid4(),
            bank_name="Banco General",
            nickname="BG",
        )
        assert ba.account_last4 is None
