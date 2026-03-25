from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_db
from app.main import app


class DummyUser:
    def __init__(self, user_id):
        self.user_id = user_id
        self.username = "lex"
        self.full_name = "Lex"


class DummySnapshot:
    def __init__(self, snapshot_id, user_id):
        self.snapshot_id = snapshot_id
        self.user_id = user_id
        self.created_at = datetime.now(timezone.utc)


class DummyAnalysisTransaction:
    def __init__(
        self,
        *,
        transaction_id,
        snapshot_id,
        detail,
        amount,
        confidence,
        method,
        economic_type="gasto",
        economic_type_detail="gasto_variable",
        subtype_economic="extraordinario",
        budget_category="vivienda",
        budget_role="presupuestable",
        movement_type="debit",
        date=None,
    ):
        self.transaction_id = transaction_id
        self.snapshot_id = snapshot_id
        self.user_id = uuid4()
        self.date = date
        self.detail = detail
        self.amount = Decimal(str(amount))
        self.movement_type = movement_type
        self.economic_type = economic_type
        self.economic_type_detail = economic_type_detail
        self.subtype_economic = subtype_economic
        self.budget_category = budget_category
        self.budget_role = budget_role
        self.confidence = Decimal(str(confidence))
        self.method = method
        self.created_at = datetime.now(timezone.utc)


class FakeQuery:
    def __init__(self, items):
        self.items = items

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def all(self):
        return self.items


class FakeDB:
    def __init__(self, snapshot, transactions):
        self.snapshot = snapshot
        self.transactions = transactions

    def get(self, model, obj_id):
        return self.snapshot

    def query(self, model):
        return FakeQuery(self.transactions)


def override_get_current_user_factory(user):
    def _override():
        return user
    return _override


def override_get_db_factory(db):
    def _override():
        yield db
    return _override


def test_get_analysis_transactions_returns_items() -> None:
    user_id = uuid4()
    snapshot_id = uuid4()

    user = DummyUser(user_id)
    snapshot = DummySnapshot(snapshot_id, user_id)
    transactions = [
        DummyAnalysisTransaction(
            transaction_id=uuid4(),
            snapshot_id=snapshot_id,
            detail="SUPER XTRA TRANSISTMICA",
            amount=-25.50,
            confidence=0.30,
            method="fallback_debito",
        ),
        DummyAnalysisTransaction(
            transaction_id=uuid4(),
            snapshot_id=snapshot_id,
            detail="SPOTIFY",
            amount=-10.99,
            confidence=1.00,
            method="exact:global:canonical",
            budget_category="entretenimiento",
            subtype_economic="recurrente",
        ),
    ]

    db = FakeDB(snapshot, transactions)

    app.dependency_overrides[get_current_user] = override_get_current_user_factory(user)
    app.dependency_overrides[get_db] = override_get_db_factory(db)

    client = TestClient(app)
    response = client.get(f"/api/v1/analysis/{snapshot_id}/transactions")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()

    assert len(body) == 2
    assert body[0]["detail"] == "SUPER XTRA TRANSISTMICA"
    assert body[0]["method"] == "fallback_debito"
    assert body[0]["requires_review"] is True

    assert body[1]["detail"] == "SPOTIFY"
    assert body[1]["method"] == "exact:global:canonical"
    assert body[1]["requires_review"] is False


def test_get_analysis_transactions_filters_requires_review_true() -> None:
    user_id = uuid4()
    snapshot_id = uuid4()

    user = DummyUser(user_id)
    snapshot = DummySnapshot(snapshot_id, user_id)
    transactions = [
        DummyAnalysisTransaction(
            transaction_id=uuid4(),
            snapshot_id=snapshot_id,
            detail="COMERCIO RARO",
            amount=-11.00,
            confidence=0.20,
            method="fallback_debito",
        ),
        DummyAnalysisTransaction(
            transaction_id=uuid4(),
            snapshot_id=snapshot_id,
            detail="NETFLIX",
            amount=-8.99,
            confidence=1.00,
            method="exact:global:canonical",
            budget_category="entretenimiento",
            subtype_economic="recurrente",
        ),
    ]

    db = FakeDB(snapshot, transactions)

    app.dependency_overrides[get_current_user] = override_get_current_user_factory(user)
    app.dependency_overrides[get_db] = override_get_db_factory(db)

    client = TestClient(app)
    response = client.get(f"/api/v1/analysis/{snapshot_id}/transactions?requires_review=true")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()

    assert len(body) == 1
    assert body[0]["detail"] == "COMERCIO RARO"
    assert body[0]["requires_review"] is True


def test_get_analysis_transactions_filters_by_max_confidence() -> None:
    user_id = uuid4()
    snapshot_id = uuid4()

    user = DummyUser(user_id)
    snapshot = DummySnapshot(snapshot_id, user_id)
    transactions = [
        DummyAnalysisTransaction(
            transaction_id=uuid4(),
            snapshot_id=snapshot_id,
            detail="LOW CONF",
            amount=-15.0,
            confidence=0.40,
            method="pattern:global:x",
        ),
        DummyAnalysisTransaction(
            transaction_id=uuid4(),
            snapshot_id=snapshot_id,
            detail="HIGH CONF",
            amount=-20.0,
            confidence=0.95,
            method="exact:global:canonical",
        ),
    ]

    db = FakeDB(snapshot, transactions)

    app.dependency_overrides[get_current_user] = override_get_current_user_factory(user)
    app.dependency_overrides[get_db] = override_get_db_factory(db)

    client = TestClient(app)
    response = client.get(f"/api/v1/analysis/{snapshot_id}/transactions?max_confidence=0.50")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()

    assert len(body) == 1
    assert body[0]["detail"] == "LOW CONF"


def test_get_analysis_transactions_returns_404_when_snapshot_not_found() -> None:
    user = DummyUser(uuid4())
    db = FakeDB(snapshot=None, transactions=[])

    app.dependency_overrides[get_current_user] = override_get_current_user_factory(user)
    app.dependency_overrides[get_db] = override_get_db_factory(db)

    client = TestClient(app)
    response = client.get(f"/api/v1/analysis/{uuid4()}/transactions")

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["detail"] == "Análisis no encontrado"


def test_get_analysis_transactions_returns_404_when_snapshot_belongs_to_other_user() -> None:
    current_user = DummyUser(uuid4())
    other_user_id = uuid4()
    snapshot_id = uuid4()

    snapshot = DummySnapshot(snapshot_id, other_user_id)
    db = FakeDB(snapshot=snapshot, transactions=[])

    app.dependency_overrides[get_current_user] = override_get_current_user_factory(current_user)
    app.dependency_overrides[get_db] = override_get_db_factory(db)

    client = TestClient(app)
    response = client.get(f"/api/v1/analysis/{snapshot_id}/transactions")

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["detail"] == "Análisis no encontrado"