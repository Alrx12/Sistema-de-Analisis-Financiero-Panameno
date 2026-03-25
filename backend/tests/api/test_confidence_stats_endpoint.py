"""
Tests para GET /api/v1/analysis/{snapshot_id}/confidence-stats.

Verifica que el endpoint calcule correctamente:
- requires_review (confidence < 0.8)
- fallback puro (confidence <= 0.35)
- distribución por método (kb_personal, kb_global, builtin, user_reclassified, fallback, other)
- avg_confidence
- caso vacío (snapshot sin transacciones)
- 404 cuando el snapshot no existe o pertenece a otro usuario
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_db
from app.main import app


# ── Helpers compartidos con otros tests de api ─────────────────────────────────

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


class DummyTx:
    """Transacción mínima para tests de confidence-stats."""
    def __init__(self, *, snapshot_id, confidence: float, method: str):
        self.transaction_id = uuid4()
        self.snapshot_id = snapshot_id
        self.user_id = uuid4()
        self.date = None
        self.detail = "DESCRIPTOR"
        self.amount = Decimal("10.00")
        self.movement_type = "debit"
        self.economic_type = "gasto"
        self.economic_type_detail = "gasto_variable"
        self.subtype_economic = "extraordinario"
        self.budget_category = "otros"
        self.budget_role = "presupuestable"
        self.confidence = Decimal(str(confidence))
        self.method = method
        self.created_at = datetime.now(timezone.utc)


class FakeQuery:
    def __init__(self, items):
        self._items = items

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def all(self):
        return self._items


class FakeDB:
    def __init__(self, snapshot, transactions):
        self._snapshot = snapshot
        self._transactions = transactions

    def get(self, model, obj_id):
        return self._snapshot

    def query(self, model):
        return FakeQuery(self._transactions)


def _override_user(user):
    def _fn():
        return user
    return _fn


def _override_db(db):
    def _fn():
        yield db
    return _fn


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_confidence_stats_correct_counts() -> None:
    """Verifica requires_review, fallback, avg_confidence y by_method con un mix realista."""
    user_id = uuid4()
    snapshot_id = uuid4()
    user = DummyUser(user_id)
    snapshot = DummySnapshot(snapshot_id, user_id)

    transactions = [
        DummyTx(snapshot_id=snapshot_id, confidence=1.00, method="kb_personal"),
        DummyTx(snapshot_id=snapshot_id, confidence=1.00, method="kb_global"),
        DummyTx(snapshot_id=snapshot_id, confidence=0.90, method="builtin:salario"),
        DummyTx(snapshot_id=snapshot_id, confidence=0.90, method="builtin:pago_tdc"),
        DummyTx(snapshot_id=snapshot_id, confidence=1.00, method="user_reclassified"),
        DummyTx(snapshot_id=snapshot_id, confidence=0.30, method="fallback_debito"),
        DummyTx(snapshot_id=snapshot_id, confidence=0.30, method="fallback_credito"),
    ]
    # total=7, requires_review (< 0.8) = 2, fallback (<= 0.35) = 2
    # avg = (1 + 1 + 0.9 + 0.9 + 1 + 0.3 + 0.3) / 7 ≈ 0.7714

    db = FakeDB(snapshot, transactions)
    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_db] = _override_db(db)

    client = TestClient(app)
    r = client.get(f"/api/v1/analysis/{snapshot_id}/confidence-stats")
    app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()

    assert body["total"] == 7
    assert body["requires_review_count"] == 2
    assert body["requires_review_pct"] == round(2 / 7 * 100, 2)
    assert body["fallback_count"] == 2
    assert body["fallback_pct"] == round(2 / 7 * 100, 2)
    assert body["avg_confidence"] == round((1 + 1 + 0.9 + 0.9 + 1 + 0.3 + 0.3) / 7, 4)

    # Distribución por método
    assert body["by_method"]["kb_personal"] == 1
    assert body["by_method"]["kb_global"] == 1
    assert body["by_method"]["builtin"] == 2
    assert body["by_method"]["user_reclassified"] == 1
    assert body["by_method"]["fallback"] == 2


def test_confidence_stats_empty_snapshot() -> None:
    """Un snapshot sin transacciones devuelve ceros sin dividir por cero."""
    user_id = uuid4()
    snapshot_id = uuid4()
    user = DummyUser(user_id)
    snapshot = DummySnapshot(snapshot_id, user_id)

    db = FakeDB(snapshot, [])
    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_db] = _override_db(db)

    client = TestClient(app)
    r = client.get(f"/api/v1/analysis/{snapshot_id}/confidence-stats")
    app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert body["requires_review_count"] == 0
    assert body["requires_review_pct"] == 0.0
    assert body["fallback_count"] == 0
    assert body["fallback_pct"] == 0.0
    assert body["avg_confidence"] == 0.0
    assert body["by_method"] == {}


def test_confidence_stats_all_high_confidence() -> None:
    """KB bien entrenado: todo clasificado con alta confianza, fallback=0."""
    user_id = uuid4()
    snapshot_id = uuid4()
    user = DummyUser(user_id)
    snapshot = DummySnapshot(snapshot_id, user_id)

    transactions = [
        DummyTx(snapshot_id=snapshot_id, confidence=1.00, method="kb_personal"),
        DummyTx(snapshot_id=snapshot_id, confidence=1.00, method="kb_global"),
        DummyTx(snapshot_id=snapshot_id, confidence=0.95, method="builtin:salario"),
    ]

    db = FakeDB(snapshot, transactions)
    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_db] = _override_db(db)

    client = TestClient(app)
    r = client.get(f"/api/v1/analysis/{snapshot_id}/confidence-stats")
    app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    assert body["requires_review_count"] == 0
    assert body["requires_review_pct"] == 0.0
    assert body["fallback_count"] == 0
    assert body["fallback_pct"] == 0.0


def test_confidence_stats_404_snapshot_not_found() -> None:
    user = DummyUser(uuid4())
    db = FakeDB(snapshot=None, transactions=[])
    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_db] = _override_db(db)

    client = TestClient(app)
    r = client.get(f"/api/v1/analysis/{uuid4()}/confidence-stats")
    app.dependency_overrides.clear()

    assert r.status_code == 404


def test_confidence_stats_404_wrong_user() -> None:
    current_user = DummyUser(uuid4())
    snapshot = DummySnapshot(uuid4(), uuid4())  # snapshot de otro user
    db = FakeDB(snapshot=snapshot, transactions=[])
    app.dependency_overrides[get_current_user] = _override_user(current_user)
    app.dependency_overrides[get_db] = _override_db(db)

    client = TestClient(app)
    r = client.get(f"/api/v1/analysis/{snapshot.snapshot_id}/confidence-stats")
    app.dependency_overrides.clear()

    assert r.status_code == 404
