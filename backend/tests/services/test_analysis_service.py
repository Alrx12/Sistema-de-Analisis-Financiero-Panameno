from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.services.analysis_service import AnalysisService


class FakeSession:
    def __init__(self) -> None:
        self.added = []
        self.added_all = []
        self.commits = 0
        self.refreshed = []

    def add(self, obj) -> None:
        self.added.append(obj)

    def add_all(self, objs) -> None:
        self.added_all.extend(objs)

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, obj) -> None:
        self.refreshed.append(obj)


@pytest.fixture
def fake_db() -> FakeSession:
    return FakeSession()


def test_build_analysis_returns_transactions_and_summary(monkeypatch, fake_db: FakeSession) -> None:
    categorized = [
        {
            "transaction_date": "2026-02-01",
            "description": "SPOTIFY",
            "amount": -10.99,
            "economic_type": "gasto",
            "economic_type_detail": "gasto_recurrente",
            "subtype_economic": "recurrente",
            "budget_category": "entretenimiento",
            "budget_role": "presupuestable",
            "confidence": 1.0,
            "method": "builtin:spotify",
        },
        {
            "transaction_date": "2026-02-02",
            "description": "SALARIO EMPRESA",
            "amount": 1000.00,
            "economic_type": "ingreso",
            "economic_type_detail": "salario",
            "subtype_economic": "recurrente",
            "budget_category": "otros",
            "budget_role": "presupuestable",
            "confidence": 0.95,
            "method": "builtin:salario",
        },
        {
            "transaction_date": "2026-02-03",
            "description": "TRANSFERENCIA ENTRE CUENTAS",
            "amount": -200.00,
            "economic_type": "transferencia_propia",
            "economic_type_detail": "transferencia_propia",
            "subtype_economic": "interno",
            "budget_category": "ahorro",
            "budget_role": "solo_balance",
            "confidence": 0.99,
            "method": "builtin:entre_cuentas",
        },
        {
            "transaction_date": "2026-02-04",
            "description": "COMERCIO RARO",
            "amount": -25.00,
            "economic_type": "gasto",
            "economic_type_detail": "gasto_variable",
            "subtype_economic": "desconocido",
            "budget_category": "consumo_desconocido",
            "budget_role": "revisar",
            "confidence": 0.30,
            "method": "fallback_debito",
        },
    ]

    monkeypatch.setattr(
        "app.services.analysis_service.categorize_transactions",
        lambda transactions, user_id, user_name: categorized,
    )

    service = AnalysisService(fake_db)
    analysis = service.build_analysis(
        transactions=[{"dummy": True}],
        user_id="user-1",
        user_name="Lex",
    )

    assert analysis["total_transactions"] == 4
    assert analysis["total_income"] == 1000.00
    assert analysis["total_expenses"] == 35.99
    assert analysis["balance"] == 964.01

    assert analysis["categories"]["entretenimiento"] == 10.99
    assert analysis["categories"]["otros"] == 1000.00
    # solo_balance se excluye de categories (igual que de totales) para mantener consistencia.
    assert "ahorro" not in analysis["categories"]
    assert analysis["categories"]["consumo_desconocido"] == 25.00

    assert analysis["budget_roles"]["presupuestable"] == 1010.99
    assert analysis["budget_roles"]["solo_balance"] == 200.00
    assert analysis["budget_roles"]["revisar"] == 25.00

    assert analysis["period_start"] == "2026-02-01"
    assert analysis["period_end"] == "2026-02-04"

    assert len(analysis["low_confidence"]) == 1
    assert analysis["low_confidence"][0]["description"] == "COMERCIO RARO"
    assert analysis["low_confidence"][0]["method"] == "fallback_debito"

    assert "transactions" in analysis
    assert len(analysis["transactions"]) == 4


def test_build_analysis_adds_warning_when_expenses_exceed_income(monkeypatch, fake_db: FakeSession) -> None:
    categorized = [
        {
            "transaction_date": "2026-02-01",
            "description": "SUPERMERCADO XTRA",
            "amount": -120.00,
            "budget_category": "vivienda",
            "budget_role": "presupuestable",
            "confidence": 0.95,
            "method": "exact:global:canonical",
        }
    ]

    monkeypatch.setattr(
        "app.services.analysis_service.categorize_transactions",
        lambda transactions, user_id, user_name: categorized,
    )

    service = AnalysisService(fake_db)
    analysis = service.build_analysis(
        transactions=[{"dummy": True}],
        user_id="user-1",
        user_name="Lex",
    )

    # Con income=0 y expenses=120 el engine dispara "no_income_detected" (critical),
    # no "expenses_exceed_income" (que solo aplica cuando income > 0 pero expenses lo superan).
    codes = [r["code"] for r in analysis["recommendations"]]
    assert "no_income_detected" in codes


def test_save_snapshot_persists_snapshot(fake_db: FakeSession) -> None:
    service = AnalysisService(fake_db)

    class DummyUser:
        user_id = uuid4()

    analysis = {
        "total_transactions": 2,
        "total_income": 100.0,
        "total_expenses": 20.0,
        "balance": 80.0,
        "categories": {"otros": 100.0, "entretenimiento": 20.0},
        "recommendations": [{"type": "info", "message": "ok"}],
        "period_start": "2026-02-01",
        "period_end": "2026-02-28",
        "transactions": [],
    }

    snapshot = service.save_snapshot(analysis, DummyUser())

    assert fake_db.commits == 1
    assert len(fake_db.added) == 1
    assert snapshot in fake_db.added
    assert snapshot in fake_db.refreshed
    expected_summary = {k: v for k, v in analysis.items() if k != "transactions"}
    assert snapshot.summary == expected_summary
    assert snapshot.period_start == date(2026, 2, 1)
    assert snapshot.period_end == date(2026, 2, 28)


def test_save_transactions_persists_enriched_transactions(fake_db: FakeSession) -> None:
    service = AnalysisService(fake_db)

    snapshot_id = uuid4()
    user_id = uuid4()

    transactions = [
        {
            "transaction_date": "2026-02-05",
            "description": "SPOTIFY",
            "amount": -10.99,
            "economic_type": "gasto",
            "economic_type_detail": "gasto_recurrente",
            "subtype_economic": "recurrente",
            "budget_category": "entretenimiento",
            "budget_role": "presupuestable",
            "confidence": 1.0,
            "method": "exact:global:canonical",
        },
        {
            "transaction_date": "2026-02-06",
            "detail": "SALARIO EMPRESA",
            "amount": 1000,
            "economic_type": "ingreso",
            "economic_type_detail": "salario",
            "subtype_economic": "recurrente",
            "budget_category": "otros",
            "budget_role": "presupuestable",
            "confidence": 0.95,
            "method": "builtin:salario",
        },
    ]

    service.save_transactions(snapshot_id=snapshot_id, user_id=user_id, transactions=transactions)

    assert fake_db.commits == 1
    assert len(fake_db.added_all) == 2

    first = fake_db.added_all[0]
    second = fake_db.added_all[1]

    assert first.snapshot_id == snapshot_id
    assert first.user_id == user_id
    assert first.date == date(2026, 2, 5)
    assert first.detail == "SPOTIFY"
    assert float(first.amount) == pytest.approx(10.99 * -1)
    assert first.movement_type == "debit"
    assert first.economic_type == "gasto"
    assert first.budget_category == "entretenimiento"
    assert float(first.confidence) == pytest.approx(1.0)

    assert second.detail == "SALARIO EMPRESA"
    assert second.movement_type == "credit"
    assert float(second.amount) == pytest.approx(1000.0)
    assert second.economic_type_detail == "salario"


def test_save_transactions_skips_commit_when_empty(fake_db: FakeSession) -> None:
    service = AnalysisService(fake_db)

    service.save_transactions(snapshot_id=uuid4(), user_id=uuid4(), transactions=[])

    assert fake_db.commits == 0
    assert fake_db.added_all == []


def test_build_analysis_does_not_count_solo_balance_as_expense(monkeypatch, fake_db: FakeSession) -> None:
    categorized = [
        {
            "transaction_date": "2026-02-01",
            "description": "ENTRE CUENTAS",
            "amount": -500.0,
            "budget_category": "ahorro",
            "budget_role": "solo_balance",
            "confidence": 0.99,
            "method": "builtin:entre_cuentas",
        }
    ]

    monkeypatch.setattr(
        "app.services.analysis_service.categorize_transactions",
        lambda transactions, user_id, user_name: categorized,
    )

    service = AnalysisService(fake_db)
    analysis = service.build_analysis(
        transactions=[{"dummy": True}],
        user_id="user-1",
        user_name="Lex",
    )

    assert analysis["total_income"] == 0.0
    assert analysis["total_expenses"] == 0.0
    assert analysis["balance"] == 0.0
    # solo_balance no debe aparecer en categories (misma lógica que totales)
    assert "ahorro" not in analysis["categories"]
    # pero sí debe quedar registrado en budget_roles para trazabilidad
    assert analysis["budget_roles"]["solo_balance"] == 500.0

def test_build_analysis_normalizes_category_accents(monkeypatch, fake_db: FakeSession) -> None:
    """Dos transacciones con 'alimentación' y 'alimentacion' deben acumularse en la misma clave."""
    categorized = [
        {
            "transaction_date": "2026-02-01",
            "description": "SUPER XTRA",
            "amount": -30.00,
            "budget_category": "alimentación",  # con acento (viene del KB)
            "budget_role": "presupuestable",
            "confidence": 0.9,
            "method": "pattern:global",
        },
        {
            "transaction_date": "2026-02-02",
            "description": "RIBA SMITH",
            "amount": -45.00,
            "budget_category": "alimentacion",  # sin acento (viene de otro path)
            "budget_role": "presupuestable",
            "confidence": 0.9,
            "method": "exact:global:canonical",
        },
    ]

    monkeypatch.setattr(
        "app.services.analysis_service.categorize_transactions",
        lambda transactions, user_id, user_name: categorized,
    )

    service = AnalysisService(fake_db)
    analysis = service.build_analysis(
        transactions=[{"dummy": True}],
        user_id="user-1",
        user_name="Lex",
    )

    # Debe haber UNA sola clave, no dos
    assert "alimentacion" in analysis["categories"]
    assert "alimentación" not in analysis["categories"]
    assert analysis["categories"]["alimentacion"] == pytest.approx(75.00)
