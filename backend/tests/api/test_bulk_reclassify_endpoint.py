"""
Tests para POST /api/v1/analysis/{snapshot_id}/reclassify-bulk.

Cubren:
  - Happy path: todas las transacciones re-categorizadas, KPIs recalculados
  - skip_user_reclassified=True (default): transacciones manuales quedan intactas
  - skip_user_reclassified=False: también re-categoriza las manuales
  - 404 si el snapshot no existe
  - 404 si el snapshot pertenece a otro usuario
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_db
from app.main import app


# ── Helpers ───────────────────────────────────────────────────────────────────


class DummyUser:
    def __init__(self, user_id=None):
        self.user_id = user_id or uuid4()
        self.username = "lex"
        self.full_name = "Lex Test"


class DummySnapshot:
    """Simula un AnalysisSnapshot."""

    def __init__(self, snapshot_id=None, user_id=None):
        self.snapshot_id = snapshot_id or uuid4()
        self.user_id = user_id or uuid4()
        self.summary = {"total_transactions": 0, "total_income": 0.0, "total_expenses": 0.0, "balance": 0.0}
        self.category_analysis = {}
        self.recommendations = []
        self.period_start = None
        self.period_end = None
        self.created_at = datetime.now(timezone.utc)


class DummyTx:
    """Simula una AnalysisTransaction."""

    def __init__(
        self,
        *,
        snapshot_id,
        user_id,
        detail="COMERCIO RARO",
        amount="-25.00",
        method="fallback_debito",
    ):
        self.transaction_id = uuid4()
        self.snapshot_id = snapshot_id
        self.user_id = user_id
        self.date = date(2026, 1, 15)
        self.detail = detail
        self.amount = Decimal(amount)
        self.movement_type = "debit"

        # Clasificación inicial (fallback)
        self.economic_type = "gasto"
        self.economic_type_detail = "gasto_variable"
        self.subtype_economic = "extraordinario"
        self.budget_category = "otros"
        self.budget_role = "revisar"
        self.confidence = Decimal("0.30")
        self.method = method

        self.created_at = datetime.now(timezone.utc)


class FakeBulkQuery:
    """Simula el encadenamiento query().filter().all() de SQLAlchemy."""

    def __init__(self, items):
        self._items = items

    def filter(self, *_):
        return self

    def order_by(self, *_):
        return self

    def all(self):
        return list(self._items)


class FakeBulkDB:
    """
    Fake de SQLAlchemy Session para bulk reclassify.
    Soporta: get(), query().filter().all(), commit().
    """

    def __init__(self, snapshot, transactions):
        self._snapshot = snapshot
        self._transactions = transactions
        self.commit_count = 0

    def get(self, model, obj_id):
        from app.models.analysis_snapshot import AnalysisSnapshot

        if model is AnalysisSnapshot and self._snapshot is not None:
            if str(self._snapshot.snapshot_id) == str(obj_id):
                return self._snapshot
        return None

    def query(self, _model):
        return FakeBulkQuery(self._transactions)

    def commit(self):
        self.commit_count += 1


def _make_mock_classifier(cats=None):
    """Retorna un mock de FinancialClassifier cuyo predict() devuelve cats conocidas."""
    if cats is None:
        cats = {
            "Economic Type": "gasto",
            "Economic Type Detail": "gasto_variable",
            "SubType Economic": "extraordinario",
            "Categoría de presupuesto": "restaurantes",
            "budget_role": "no_presupuestable",
        }
    mock_clf = MagicMock()
    mock_clf.predict.return_value = (cats, 0.92, "exact:personal:canonical")
    return mock_clf


def _override_user(user):
    def _dep():
        return user
    return _dep


def _override_db(db):
    def _dep():
        yield db
    return _dep


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_bulk_reclassify_updates_all_transactions() -> None:
    """
    Happy path: 2 transacciones con fallback.
    Ambas deben quedar re-categorizadas con las categorías del KB.
    """
    user = DummyUser()
    snapshot = DummySnapshot(user_id=user.user_id)
    txns = [
        DummyTx(snapshot_id=snapshot.snapshot_id, user_id=user.user_id, detail="TRESCUATES"),
        DummyTx(snapshot_id=snapshot.snapshot_id, user_id=user.user_id, detail="SPOTIFY"),
    ]
    fake_db = FakeBulkDB(snapshot, txns)
    mock_clf = _make_mock_classifier()

    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_db] = _override_db(fake_db)

    with patch("app.services.categorization_service.FinancialClassifier", return_value=mock_clf):
        client = TestClient(app)
        response = client.post(
            f"/api/v1/analysis/{snapshot.snapshot_id}/reclassify-bulk",
            json={"skip_user_reclassified": True},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()

    assert body["total"] == 2
    assert body["updated"] == 2
    assert body["skipped"] == 0

    # Las transacciones deben haber sido actualizadas en el objeto ORM
    for tx in txns:
        assert tx.budget_category == "restaurantes"
        assert tx.budget_role == "no_presupuestable"
        assert float(tx.confidence) == pytest.approx(0.92)
        assert tx.method == "exact:personal:canonical"

    # El snapshot debe haber sido actualizado (commit llamado al menos 2 veces: txns + KPIs)
    assert fake_db.commit_count >= 2


def test_bulk_reclassify_skips_manual_corrections_by_default() -> None:
    """
    Con skip_user_reclassified=True (default):
    - La tx con method='user_reclassified' debe quedar intacta.
    - La tx normal debe re-categorizarse.
    """
    user = DummyUser()
    snapshot = DummySnapshot(user_id=user.user_id)

    tx_manual = DummyTx(
        snapshot_id=snapshot.snapshot_id,
        user_id=user.user_id,
        detail="TRESCUATES",
        method="user_reclassified",
    )
    tx_manual.budget_category = "restaurantes"
    tx_manual.confidence = Decimal("1.00")

    tx_auto = DummyTx(
        snapshot_id=snapshot.snapshot_id,
        user_id=user.user_id,
        detail="COMERCIO DESCONOCIDO",
    )

    txns = [tx_manual, tx_auto]
    fake_db = FakeBulkDB(snapshot, txns)
    mock_clf = _make_mock_classifier(
        cats={
            "Economic Type": "gasto",
            "Economic Type Detail": "gasto_variable",
            "SubType Economic": "extraordinario",
            "Categoría de presupuesto": "otros",
            "budget_role": "revisar",
        }
    )

    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_db] = _override_db(fake_db)

    with patch("app.services.categorization_service.FinancialClassifier", return_value=mock_clf):
        client = TestClient(app)
        response = client.post(
            f"/api/v1/analysis/{snapshot.snapshot_id}/reclassify-bulk",
            json={"skip_user_reclassified": True},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()

    assert body["total"] == 2
    assert body["updated"] == 1
    assert body["skipped"] == 1

    # La tx manual no debe haber cambiado
    assert tx_manual.budget_category == "restaurantes"
    assert float(tx_manual.confidence) == pytest.approx(1.0)
    assert tx_manual.method == "user_reclassified"


def test_bulk_reclassify_force_overrides_manual_corrections() -> None:
    """
    Con skip_user_reclassified=False: la tx manual también se re-categoriza.
    """
    user = DummyUser()
    snapshot = DummySnapshot(user_id=user.user_id)

    tx_manual = DummyTx(
        snapshot_id=snapshot.snapshot_id,
        user_id=user.user_id,
        detail="COMERCIO CUALQUIERA",
        method="user_reclassified",
    )
    tx_manual.budget_category = "restaurantes"

    txns = [tx_manual]
    fake_db = FakeBulkDB(snapshot, txns)
    mock_clf = _make_mock_classifier(
        cats={
            "Economic Type": "gasto",
            "Economic Type Detail": "gasto_variable",
            "SubType Economic": "extraordinario",
            "Categoría de presupuesto": "supermercado",
            "budget_role": "presupuestable",
        }
    )

    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_db] = _override_db(fake_db)

    with patch("app.services.categorization_service.FinancialClassifier", return_value=mock_clf):
        client = TestClient(app)
        response = client.post(
            f"/api/v1/analysis/{snapshot.snapshot_id}/reclassify-bulk",
            json={"skip_user_reclassified": False},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()

    assert body["total"] == 1
    assert body["updated"] == 1
    assert body["skipped"] == 0

    # La tx manual fue sobreescrita
    assert tx_manual.budget_category == "supermercado"
    assert tx_manual.method == "exact:personal:canonical"


def test_bulk_reclassify_returns_404_when_snapshot_not_found() -> None:
    """Si el snapshot no existe en DB → 404."""
    user = DummyUser()
    fake_db = FakeBulkDB(snapshot=DummySnapshot(user_id=uuid4()), transactions=[])
    # Hacemos que get() no encuentre el snapshot específico
    fake_db._snapshot = None  # type: ignore[assignment]

    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_db] = _override_db(fake_db)

    client = TestClient(app)
    response = client.post(
        f"/api/v1/analysis/{uuid4()}/reclassify-bulk",
        json={},
    )

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "no encontrado" in response.json()["detail"].lower()


def test_bulk_reclassify_returns_404_when_snapshot_belongs_to_other_user() -> None:
    """Si el snapshot pertenece a otro usuario → 404."""
    current_user = DummyUser()
    other_user = DummyUser()
    snapshot = DummySnapshot(user_id=other_user.user_id)  # pertenece al otro
    fake_db = FakeBulkDB(snapshot, [])

    app.dependency_overrides[get_current_user] = _override_user(current_user)
    app.dependency_overrides[get_db] = _override_db(fake_db)

    client = TestClient(app)
    response = client.post(
        f"/api/v1/analysis/{snapshot.snapshot_id}/reclassify-bulk",
        json={},
    )

    app.dependency_overrides.clear()

    assert response.status_code == 404
