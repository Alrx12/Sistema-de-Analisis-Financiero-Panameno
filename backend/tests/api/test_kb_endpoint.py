"""
Tests para los endpoints de gestión del KB personal:
  GET    /api/v1/kb
  GET    /api/v1/kb/preview?detail=...
  DELETE /api/v1/kb/{key}

Cubren:
  - Listar KB retorna entradas ordenadas alfabéticamente
  - Listar KB vacío retorna lista vacía sin error
  - Preview retorna la clave canónica correcta y el flag is_ambiguous
  - Preview de una clave ambigua retorna is_ambiguous=True
  - Delete elimina la entrada y retorna patrones_removed
  - Delete retorna 404 si la clave no existe
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.main import app


# ── Helpers ───────────────────────────────────────────────────────────────────


class DummyUser:
    def __init__(self):
        self.user_id = uuid4()
        self.username = "lex"
        self.full_name = "Lex Test"


def _override_user(user):
    def _dep():
        return user
    return _dep


def _make_mock_classifier(exact_matches=None, patterns=None, corrections_count=3):
    """Retorna un mock de FinancialClassifier con el KB personal configurado."""
    if exact_matches is None:
        exact_matches = {
            "TRESCUATES": {
                "Economic Type": "gasto",
                "Economic Type Detail": "gasto_variable",
                "SubType Economic": "extraordinario",
                "Categoría de presupuesto": "restaurantes",
                "budget_role": "no_presupuestable",
            },
            "NETFLIX": {
                "Economic Type": "gasto",
                "Economic Type Detail": "gasto_recurrente",
                "SubType Economic": "recurrente",
                "Categoría de presupuesto": "suscripciones",
                "budget_role": "presupuestable",
            },
        }
    if patterns is None:
        patterns = {
            "personal_gasto_TRESCUATES": {"regex": r"\bTRESCUATES\b", "categories": {}},
        }

    mock_clf = MagicMock()
    mock_clf.list_personal_kb.return_value = {
        "exact_matches": exact_matches,
        "patterns": patterns,
        "corrections_count": corrections_count,
    }
    mock_clf.list_global_kb_summary.return_value = {
        "exact_matches_count": 165,
        "patterns_count": 44,
        "corrections_count": 0,
    }
    mock_clf.delete_personal_entry.return_value = 1
    return mock_clf


# ── Tests: GET /kb ─────────────────────────────────────────────────────────────


def test_list_kb_returns_entries_sorted_alphabetically() -> None:
    """GET /kb retorna todas las entradas ordenadas por clave."""
    user = DummyUser()
    app.dependency_overrides[get_current_user] = _override_user(user)
    mock_clf = _make_mock_classifier()

    with patch("app.api.v1.kb.FinancialClassifier", return_value=mock_clf):
        client = TestClient(app)
        response = client.get("/api/v1/kb/")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()

    assert body["corrections_count"] == 3
    assert body["patterns_count"] == 1
    assert body["global_exact_matches_count"] == 165
    assert body["global_patterns_count"] == 44

    keys = [e["key"] for e in body["entries"]]
    assert keys == sorted(keys)
    assert "TRESCUATES" in keys
    assert "NETFLIX" in keys


def test_list_kb_returns_correct_categories() -> None:
    """Las categorías de cada entrada se mapean correctamente al schema."""
    user = DummyUser()
    app.dependency_overrides[get_current_user] = _override_user(user)
    mock_clf = _make_mock_classifier()

    with patch("app.api.v1.kb.FinancialClassifier", return_value=mock_clf):
        client = TestClient(app)
        response = client.get("/api/v1/kb/")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    entries = {e["key"]: e for e in response.json()["entries"]}

    trescuates = entries["TRESCUATES"]
    assert trescuates["economic_type"] == "gasto"
    assert trescuates["budget_category"] == "restaurantes"
    assert trescuates["budget_role"] == "no_presupuestable"


def test_list_kb_empty_returns_empty_list() -> None:
    """KB personal vacío retorna lista vacía, sin error."""
    user = DummyUser()
    app.dependency_overrides[get_current_user] = _override_user(user)
    mock_clf = _make_mock_classifier(exact_matches={}, patterns={}, corrections_count=0)

    with patch("app.api.v1.kb.FinancialClassifier", return_value=mock_clf):
        client = TestClient(app)
        response = client.get("/api/v1/kb/")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["entries"] == []
    assert body["corrections_count"] == 0


# ── Tests: GET /kb/preview ────────────────────────────────────────────────────


def test_preview_returns_canonical_key() -> None:
    """El preview limpia el descriptor y retorna la clave canónica."""
    user = DummyUser()
    app.dependency_overrides[get_current_user] = _override_user(user)

    client = TestClient(app)
    response = client.get(
        "/api/v1/kb/preview",
        params={"detail": "TRESCUATES-4187-94XX-XXXX-6798"},
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["canonical_key"] == "TRESCUATES"
    assert body["original"] == "TRESCUATES-4187-94XX-XXXX-6798"
    assert body["is_ambiguous"] is False


def test_preview_flags_ambiguous_key() -> None:
    """Un descriptor que produce una clave ambigua retorna is_ambiguous=True."""
    user = DummyUser()
    app.dependency_overrides[get_current_user] = _override_user(user)

    client = TestClient(app)
    # "PAGO" está en AMBIGUOUS_CANONICAL_KEYS
    response = client.get("/api/v1/kb/preview", params={"detail": "PAGO"})

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["is_ambiguous"] is True


# ── Tests: DELETE /kb/{key} ───────────────────────────────────────────────────


def test_delete_kb_entry_removes_entry() -> None:
    """DELETE /kb/{key} llama a delete_personal_entry y retorna la respuesta correcta."""
    user = DummyUser()
    app.dependency_overrides[get_current_user] = _override_user(user)
    mock_clf = _make_mock_classifier()

    with patch("app.api.v1.kb.FinancialClassifier", return_value=mock_clf):
        client = TestClient(app)
        response = client.delete("/api/v1/kb/TRESCUATES")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["key"] == "TRESCUATES"
    assert body["patterns_removed"] == 1

    mock_clf.delete_personal_entry.assert_called_once_with("TRESCUATES")


def test_delete_kb_entry_returns_404_when_not_found() -> None:
    """Si la clave no existe en el KB personal → 404."""
    user = DummyUser()
    app.dependency_overrides[get_current_user] = _override_user(user)
    mock_clf = _make_mock_classifier()
    mock_clf.delete_personal_entry.side_effect = KeyError("NO_EXISTE")

    with patch("app.api.v1.kb.FinancialClassifier", return_value=mock_clf):
        client = TestClient(app)
        response = client.delete("/api/v1/kb/NO_EXISTE")

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "NO_EXISTE" in response.json()["detail"]
