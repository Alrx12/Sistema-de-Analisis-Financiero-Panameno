"""
Tests para POST /api/v1/transactions/{transaction_id}/reclassify.

Cubren:
  - Actualización correcta de campos en la DB (happy path con also_learn=True)
  - also_learn=False: solo actualiza DB, no toca el KB
  - confidence siempre queda en 1.0 y method en 'user_reclassified'
  - 404 si la transacción no existe
  - 404 si la transacción pertenece a otro usuario
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_db
from app.main import app


# ── Helpers ───────────────────────────────────────────────────────────────────

class DummyUser:
    def __init__(self, user_id=None):
        self.user_id = user_id or uuid4()
        self.username = "lex"
        self.full_name = "Lex Test"


class DummyTransaction:
    """Simula una instancia de AnalysisTransaction."""

    def __init__(self, *, transaction_id, user_id, detail="COMERCIO RARO"):
        self.transaction_id = transaction_id
        self.snapshot_id = uuid4()
        self.user_id = user_id
        self.date = None
        self.detail = detail
        self.amount = Decimal("45.00")
        self.movement_type = "debit"

        # Campos de clasificación (valores iniciales: fallback)
        self.economic_type = "gasto"
        self.economic_type_detail = "gasto_variable"
        self.subtype_economic = "extraordinario"
        self.budget_category = "otros"
        self.budget_role = "revisar"
        self.confidence = Decimal("0.30")
        self.method = "fallback_debito"

        self.created_at = datetime.now(timezone.utc)


class FakeDB:
    """
    Fake de SQLAlchemy Session que soporta las operaciones usadas por
    reclassify_transaction(): get(), commit(), refresh().
    """

    def __init__(self, transaction):
        self._transaction = transaction
        self.committed = False
        self.refreshed = False

    def get(self, model, obj_id):
        if self._transaction is not None and self._transaction.transaction_id == obj_id:
            return self._transaction
        return None

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        self.refreshed = True


def _override_user(user):
    def _dep():
        return user
    return _dep


def _override_db(db):
    def _dep():
        yield db
    return _dep


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_reclassify_updates_transaction_fields_and_learns() -> None:
    """
    Happy path: la transacción existe, pertenece al usuario.
    Los campos deben quedar actualizados; confidence=1.0; method='user_reclassified'.
    also_learn=True (default) → se llama a classifier.learn().
    """
    user = DummyUser()
    transaction_id = uuid4()
    tx = DummyTransaction(transaction_id=transaction_id, user_id=user.user_id)
    fake_db = FakeDB(tx)

    mock_learn_result = MagicMock()
    mock_learn_result.return_value = "COMERCIO RARO"

    mock_classifier = MagicMock()
    mock_classifier.learn = mock_learn_result
    mock_classifier.global_rules = {"exact_matches": {}, "patterns": []}
    mock_classifier.personal_rules = {"exact_matches": {"COMERCIO RARO": {}}, "patterns": []}

    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_db] = _override_db(fake_db)

    with patch("app.services.transaction_service.FinancialClassifier", return_value=mock_classifier):
        client = TestClient(app)
        response = client.post(
            f"/api/v1/transactions/{transaction_id}/reclassify",
            json={
                "economic_type": "gasto",
                "economic_type_detail": "gasto_variable",
                "budget_category": "restaurantes",
                "budget_role": "no_presupuestable",
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()

    # Transacción actualizada
    assert body["transaction"]["budget_category"] == "restaurantes"
    assert body["transaction"]["budget_role"] == "no_presupuestable"
    assert body["transaction"]["subtype_economic"] == "extraordinario"
    assert body["transaction"]["confidence"] == 1.0
    assert body["transaction"]["method"] == "user_reclassified"
    assert body["transaction"]["requires_review"] is False  # confidence=1.0 → no necesita revisión

    # Resultado del KB
    assert body["learned"] is True
    assert body["detail_learned"] == "COMERCIO RARO"
    assert body["kb_target"] is not None

    # Commit fue llamado
    assert fake_db.committed is True


def test_reclassify_without_learn_skips_kb() -> None:
    """
    also_learn=False: la DB se actualiza pero NO se llama a FinancialClassifier.
    """
    user = DummyUser()
    transaction_id = uuid4()
    tx = DummyTransaction(transaction_id=transaction_id, user_id=user.user_id)
    fake_db = FakeDB(tx)

    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_db] = _override_db(fake_db)

    with patch("app.services.transaction_service.FinancialClassifier") as MockClassifier:
        client = TestClient(app)
        response = client.post(
            f"/api/v1/transactions/{transaction_id}/reclassify",
            json={
                "economic_type": "ingreso",
                "economic_type_detail": "otros_ingresos",
                "budget_category": "ingresos",
                "budget_role": "presupuestable",
                "also_learn": False,
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()

    # Campos actualizados en DB
    assert body["transaction"]["economic_type"] == "ingreso"
    assert body["transaction"]["budget_category"] == "ingresos"
    assert body["transaction"]["confidence"] == 1.0

    # KB no tocado
    assert body["learned"] is False
    assert body["detail_learned"] is None
    assert body["kb_target"] is None

    # El clasificador nunca fue instanciado
    MockClassifier.assert_not_called()

    assert fake_db.committed is True


def test_reclassify_returns_404_when_transaction_not_found() -> None:
    """Si la transacción no existe en DB → 404."""
    user = DummyUser()
    fake_db = FakeDB(transaction=None)

    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_db] = _override_db(fake_db)

    client = TestClient(app)
    response = client.post(
        f"/api/v1/transactions/{uuid4()}/reclassify",
        json={
            "economic_type": "gasto",
            "budget_category": "alimentacion",
            "budget_role": "presupuestable",
        },
    )

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["detail"] == "Transacción no encontrada."


def test_reclassify_returns_404_when_transaction_belongs_to_other_user() -> None:
    """Si la transacción pertenece a otro usuario → 404 (no filtramos por user_id en get, lo validamos en el servicio)."""
    current_user = DummyUser()
    other_user_id = uuid4()

    transaction_id = uuid4()
    tx = DummyTransaction(transaction_id=transaction_id, user_id=other_user_id)
    fake_db = FakeDB(tx)

    app.dependency_overrides[get_current_user] = _override_user(current_user)
    app.dependency_overrides[get_db] = _override_db(fake_db)

    client = TestClient(app)
    response = client.post(
        f"/api/v1/transactions/{transaction_id}/reclassify",
        json={
            "economic_type": "gasto",
            "budget_category": "alimentacion",
            "budget_role": "presupuestable",
        },
    )

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["detail"] == "Transacción no encontrada."

    # La DB no debe haber sido modificada
    assert fake_db.committed is False


def test_reclassify_sets_budget_role_solo_balance() -> None:
    """
    Verifica que cualquier budget_role válido (incluyendo solo_balance) sea aceptado.
    """
    user = DummyUser()
    transaction_id = uuid4()
    tx = DummyTransaction(transaction_id=transaction_id, user_id=user.user_id)
    fake_db = FakeDB(tx)

    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_db] = _override_db(fake_db)

    with patch("app.services.transaction_service.FinancialClassifier") as MockClassifier:
        mock_instance = MagicMock()
        mock_instance.learn.return_value = "ENTRE CUENTAS"
        mock_instance.global_rules = {"exact_matches": {}, "patterns": []}
        mock_instance.personal_rules = {"exact_matches": {}, "patterns": []}
        MockClassifier.return_value = mock_instance

        client = TestClient(app)
        response = client.post(
            f"/api/v1/transactions/{transaction_id}/reclassify",
            json={
                "economic_type": "transferencia_propia",
                "economic_type_detail": "transferencia_propia",
                "budget_category": "otros",
                "budget_role": "solo_balance",
                "also_learn": True,
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["transaction"]["budget_role"] == "solo_balance"
    assert body["transaction"]["confidence"] == 1.0
