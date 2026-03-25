"""
Tests para GET /api/v1/analysis/{snapshot_id}/features.

Patrón: override de get_db y get_current_user con mocks, sin SQLite real.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_db
from app.main import app


# ─────────────────────────────────────────────────────────────────────────────
# Helpers / Dummies
# ─────────────────────────────────────────────────────────────────────────────

class DummyUser:
    def __init__(self, user_id=None):
        self.user_id = user_id or uuid4()
        self.full_name = "Lex"


class DummySnapshot:
    def __init__(self, snapshot_id, user_id):
        self.snapshot_id = snapshot_id
        self.user_id = user_id
        self.created_at = datetime.now(timezone.utc)
        self.period_start = date(2025, 1, 1)
        self.period_end = date(2025, 1, 31)
        self.summary = {}
        self.recommendations = []


class DummyTx:
    def __init__(
        self,
        *,
        snapshot_id,
        user_id,
        amount: float = -50.0,
        tx_date: date = date(2025, 1, 5),
        budget_role: str = "presupuestable",
        budget_category: str = "alimentacion",
        subtype_economic: str = "extraordinario",
        economic_type: str = "gasto",
        economic_type_detail: str = "gasto_variable",
        detail: str = "SUPERMERCADO",
        confidence: float = 0.95,
    ):
        self.transaction_id = uuid4()
        self.snapshot_id = snapshot_id
        self.user_id = user_id
        self.date = tx_date
        self.detail = detail
        self.amount = Decimal(str(amount))
        self.movement_type = "debit" if amount < 0 else "credit"
        self.economic_type = economic_type
        self.economic_type_detail = economic_type_detail
        self.subtype_economic = subtype_economic
        self.budget_category = budget_category
        self.budget_role = budget_role
        self.confidence = Decimal(str(confidence))
        self.method = "builtin:test"


def _make_db(snapshot: DummySnapshot | None, transactions: list[DummyTx]):
    """Devuelve una clase DB fake que sirve el snapshot y las transacciones."""
    class FakeQuery:
        def __init__(self, model):
            self._model = model
        def filter(self, *a, **kw): return self
        def order_by(self, *a, **kw): return self
        def limit(self, *a, **kw): return self
        def all(self):
            from app.models.analysis_transaction import AnalysisTransaction
            if self._model is AnalysisTransaction:
                return transactions
            return []

    class FakeDB:
        def get(self, model, pk):
            from app.models.analysis_snapshot import AnalysisSnapshot
            if model is AnalysisSnapshot:
                return snapshot if (snapshot and snapshot.snapshot_id == pk) else None
            return None
        def query(self, model):
            return FakeQuery(model)

    return FakeDB()


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def user():
    return DummyUser()


@pytest.fixture
def snapshot(user):
    return DummySnapshot(snapshot_id=uuid4(), user_id=user.user_id)


@pytest.fixture
def transactions(snapshot, user):
    """10 transacciones mezcladas: ingresos, gastos recurrentes y extraordinarios."""
    return [
        DummyTx(snapshot_id=snapshot.snapshot_id, user_id=user.user_id,
                amount=1000.0, tx_date=date(2025, 1, 1),
                budget_role="presupuestable", budget_category="salario",
                economic_type="ingreso", economic_type_detail="salario",
                subtype_economic="recurrente", detail="PLANILLA"),
        DummyTx(snapshot_id=snapshot.snapshot_id, user_id=user.user_id,
                amount=-15.99, tx_date=date(2025, 1, 3),
                budget_category="entretenimiento", subtype_economic="recurrente",
                detail="NETFLIX"),
        DummyTx(snapshot_id=snapshot.snapshot_id, user_id=user.user_id,
                amount=-9.99, tx_date=date(2025, 1, 3),
                budget_category="entretenimiento", subtype_economic="recurrente",
                detail="SPOTIFY"),
        DummyTx(snapshot_id=snapshot.snapshot_id, user_id=user.user_id,
                amount=-80.0, tx_date=date(2025, 1, 7),
                budget_category="alimentacion", subtype_economic="extraordinario",
                detail="SUPERMERCADO XTRA"),
        DummyTx(snapshot_id=snapshot.snapshot_id, user_id=user.user_id,
                amount=-45.0, tx_date=date(2025, 1, 10),
                budget_category="transporte", subtype_economic="extraordinario",
                detail="UBER"),
        DummyTx(snapshot_id=snapshot.snapshot_id, user_id=user.user_id,
                amount=-120.0, tx_date=date(2025, 1, 14),
                budget_category="alimentacion", subtype_economic="extraordinario",
                detail="RESTAURANTE"),
        DummyTx(snapshot_id=snapshot.snapshot_id, user_id=user.user_id,
                amount=-30.0, tx_date=date(2025, 1, 17),
                budget_category="transporte", subtype_economic="extraordinario",
                detail="GASOLINA"),
        DummyTx(snapshot_id=snapshot.snapshot_id, user_id=user.user_id,
                amount=-55.0, tx_date=date(2025, 1, 21),
                budget_category="alimentacion", subtype_economic="extraordinario",
                detail="SUPERMERCADO XTRA"),
        DummyTx(snapshot_id=snapshot.snapshot_id, user_id=user.user_id,
                amount=-22.0, tx_date=date(2025, 1, 24),
                budget_category="otros", subtype_economic="extraordinario",
                detail="FARMACIA"),
        DummyTx(snapshot_id=snapshot.snapshot_id, user_id=user.user_id,
                amount=-18.0, tx_date=date(2025, 1, 28),
                budget_category="otros", subtype_economic="extraordinario",
                detail="FERRETERIA"),
    ]


@pytest.fixture
def client(user, snapshot, transactions):
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: _make_db(snapshot, transactions)
    yield TestClient(app)
    app.dependency_overrides.clear()


# ─────────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestFeaturesHappyPath:
    def test_returns_200(self, client, snapshot):
        resp = client.get(f"/api/v1/analysis/{snapshot.snapshot_id}/features")
        assert resp.status_code == 200

    def test_snapshot_id_in_response(self, client, snapshot):
        resp = client.get(f"/api/v1/analysis/{snapshot.snapshot_id}/features")
        assert resp.json()["snapshot_id"] == str(snapshot.snapshot_id)

    def test_all_feature_keys_present(self, client, snapshot):
        body = client.get(f"/api/v1/analysis/{snapshot.snapshot_id}/features").json()
        for key in ("by_week", "by_day_of_week", "spending_velocity",
                    "category_ratios", "merchant_concentration",
                    "recurrence_stats", "income_stats"):
            assert key in body, f"Falta key: {key}"

    def test_by_day_of_week_has_7_entries(self, client, snapshot):
        body = client.get(f"/api/v1/analysis/{snapshot.snapshot_id}/features").json()
        assert len(body["by_day_of_week"]) == 7

    def test_by_day_of_week_days_in_spanish(self, client, snapshot):
        body = client.get(f"/api/v1/analysis/{snapshot.snapshot_id}/features").json()
        days = [d["day"] for d in body["by_day_of_week"]]
        assert "lunes" in days
        assert "domingo" in days

    def test_spending_velocity_positive(self, client, snapshot):
        body = client.get(f"/api/v1/analysis/{snapshot.snapshot_id}/features").json()
        vel = body["spending_velocity"]
        assert vel["avg_daily_spend"] > 0
        assert vel["projected_monthly"] > 0
        assert vel["period_days"] == 31  # enero: 1..31

    def test_spending_velocity_cumulative_not_empty(self, client, snapshot):
        body = client.get(f"/api/v1/analysis/{snapshot.snapshot_id}/features").json()
        assert len(body["spending_velocity"]["cumulative"]) > 0

    def test_category_ratios_sum_to_100(self, client, snapshot):
        body = client.get(f"/api/v1/analysis/{snapshot.snapshot_id}/features").json()
        total_pct = sum(r["pct"] for r in body["category_ratios"])
        assert total_pct == pytest.approx(100.0, abs=0.5)

    def test_merchant_concentration_max_10(self, client, snapshot):
        body = client.get(f"/api/v1/analysis/{snapshot.snapshot_id}/features").json()
        assert len(body["merchant_concentration"]) <= 10

    def test_recurrence_stats_has_breakdown(self, client, snapshot):
        body = client.get(f"/api/v1/analysis/{snapshot.snapshot_id}/features").json()
        stats = body["recurrence_stats"]
        assert "recurrente_total" in stats
        assert "breakdown" in stats
        subtypes = [b["subtype"] for b in stats["breakdown"]]
        assert "recurrente" in subtypes or "extraordinario" in subtypes

    def test_income_stats_has_total(self, client, snapshot):
        body = client.get(f"/api/v1/analysis/{snapshot.snapshot_id}/features").json()
        assert body["income_stats"]["total"] == pytest.approx(1000.0)


class TestFeatures404:
    def test_404_when_snapshot_not_found(self, user, transactions):
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: _make_db(None, transactions)
        resp = TestClient(app).get(f"/api/v1/analysis/{uuid4()}/features")
        app.dependency_overrides.clear()
        assert resp.status_code == 404

    def test_404_when_snapshot_belongs_to_other_user(self, transactions):
        owner = DummyUser()
        intruder = DummyUser()
        snap = DummySnapshot(snapshot_id=uuid4(), user_id=owner.user_id)

        app.dependency_overrides[get_current_user] = lambda: intruder
        app.dependency_overrides[get_db] = lambda: _make_db(snap, transactions)
        resp = TestClient(app).get(f"/api/v1/analysis/{snap.snapshot_id}/features")
        app.dependency_overrides.clear()
        assert resp.status_code == 404
