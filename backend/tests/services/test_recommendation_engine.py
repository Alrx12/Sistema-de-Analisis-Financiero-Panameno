"""Tests para recommendation_engine.py."""
from __future__ import annotations

import pytest

from app.services.recommendation_engine import generate_recommendations


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _rec(**kwargs):
    """Wrapper mínimo para generate_recommendations con defaults razonables."""
    defaults = {
        "total_income": 1000.0,
        "total_expenses": 800.0,
        "categories": {"alimentacion": 400.0, "transporte": 200.0, "otros": 200.0},
        "budget_roles": {"presupuestable": 800.0},
        "low_confidence_count": 0,
        "categorized_transactions": [],
        "merchant_history": None,
    }
    defaults.update(kwargs)
    return generate_recommendations(**defaults)


def _codes(recs):
    return [r["code"] for r in recs]


# ─────────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestNoIncomeDetected:
    def test_critical_when_no_income_and_has_expenses(self):
        recs = _rec(total_income=0.0, total_expenses=500.0)
        assert "no_income_detected" in _codes(recs)
        rec = next(r for r in recs if r["code"] == "no_income_detected")
        assert rec["type"] == "critical"

    def test_no_alert_when_both_zero(self):
        recs = _rec(total_income=0.0, total_expenses=0.0)
        assert "no_income_detected" not in _codes(recs)

    def test_no_alert_when_income_present(self):
        recs = _rec(total_income=500.0, total_expenses=300.0)
        assert "no_income_detected" not in _codes(recs)


class TestExpensesExceedIncome:
    def test_warning_when_deficit(self):
        recs = _rec(total_income=500.0, total_expenses=800.0)
        assert "expenses_exceed_income" in _codes(recs)
        rec = next(r for r in recs if r["code"] == "expenses_exceed_income")
        assert rec["type"] == "warning"
        assert rec["data"]["deficit"] == pytest.approx(300.0)

    def test_no_warning_when_balanced(self):
        recs = _rec(total_income=800.0, total_expenses=800.0)
        assert "expenses_exceed_income" not in _codes(recs)

    def test_no_warning_when_surplus(self):
        recs = _rec(total_income=1000.0, total_expenses=700.0)
        assert "expenses_exceed_income" not in _codes(recs)


class TestGoodSavingsRate:
    def test_success_when_savings_above_20pct(self):
        recs = _rec(total_income=1000.0, total_expenses=700.0)  # 30% ahorro
        assert "good_savings_rate" in _codes(recs)
        rec = next(r for r in recs if r["code"] == "good_savings_rate")
        assert rec["type"] == "success"
        assert rec["data"]["savings_rate_pct"] == pytest.approx(30.0)

    def test_no_success_when_below_threshold(self):
        recs = _rec(total_income=1000.0, total_expenses=850.0)  # 15% ahorro
        assert "good_savings_rate" not in _codes(recs)

    def test_exactly_20pct_triggers(self):
        recs = _rec(total_income=1000.0, total_expenses=800.0)  # exacto 20%
        assert "good_savings_rate" in _codes(recs)


class TestTopExpenseCategory:
    def test_always_present_when_expenses_exist(self):
        recs = _rec(
            categories={"alimentacion": 400.0, "transporte": 100.0},
            total_expenses=500.0,
        )
        assert "top_expense_category" in _codes(recs)

    def test_data_contains_correct_top_category(self):
        recs = _rec(
            categories={"transporte": 100.0, "alimentacion": 400.0, "entretenimiento": 200.0},
            total_expenses=700.0,
        )
        rec = next(r for r in recs if r["code"] == "top_expense_category")
        assert rec["data"]["category"] == "alimentacion"
        assert rec["data"]["amount"] == pytest.approx(400.0)
        assert rec["data"]["pct"] == pytest.approx(57.1, abs=0.2)

    def test_not_present_when_no_expenses(self):
        recs = _rec(categories={}, total_expenses=0.0)
        assert "top_expense_category" not in _codes(recs)


class TestCategoryConcentration:
    def test_warning_when_single_category_over_50pct(self):
        recs = _rec(
            categories={"alimentacion": 600.0, "transporte": 100.0},
            total_expenses=700.0,
        )
        assert "category_concentration" in _codes(recs)
        rec = next(r for r in recs if r["code"] == "category_concentration")
        assert rec["type"] == "warning"
        assert rec["data"]["category"] == "alimentacion"

    def test_no_warning_when_distributed(self):
        recs = _rec(
            categories={"alimentacion": 300.0, "transporte": 300.0, "entretenimiento": 200.0},
            total_expenses=800.0,
        )
        assert "category_concentration" not in _codes(recs)

    def test_exactly_50pct_no_warning(self):
        # El umbral es ESTRICTAMENTE > 50%, exactamente 50% no alerta
        recs = _rec(
            categories={"alimentacion": 500.0, "otros": 500.0},
            total_expenses=1000.0,
        )
        assert "category_concentration" not in _codes(recs)


class TestHighBankCharges:
    def test_warning_when_bank_charges_over_8pct(self):
        recs = _rec(
            budget_roles={"presupuestable": 900.0, "gasto_financiero": 100.0},
            total_expenses=1000.0,
        )
        assert "high_bank_charges" in _codes(recs)
        rec = next(r for r in recs if r["code"] == "high_bank_charges")
        assert rec["type"] == "warning"

    def test_no_warning_below_threshold(self):
        recs = _rec(
            budget_roles={"presupuestable": 950.0, "gasto_financiero": 50.0},
            total_expenses=1000.0,
        )
        assert "high_bank_charges" not in _codes(recs)


class TestHighUnknownSpend:
    def test_info_when_revisar_over_20pct(self):
        recs = _rec(
            budget_roles={"presupuestable": 700.0, "revisar": 300.0},
            total_expenses=1000.0,
        )
        assert "high_unknown_spend" in _codes(recs)

    def test_no_alert_below_threshold(self):
        recs = _rec(
            budget_roles={"presupuestable": 850.0, "revisar": 100.0},
            total_expenses=1000.0,
        )
        assert "high_unknown_spend" not in _codes(recs)


class TestLowConfidenceTransactions:
    def test_info_when_low_confidence_count_gt_zero(self):
        recs = _rec(low_confidence_count=5)
        assert "low_confidence_transactions" in _codes(recs)
        rec = next(r for r in recs if r["code"] == "low_confidence_transactions")
        assert rec["data"]["count"] == 5

    def test_not_present_when_zero(self):
        recs = _rec(low_confidence_count=0)
        assert "low_confidence_transactions" not in _codes(recs)


class TestRecurringSpendSummary:
    def test_shows_recurring_merchants(self):
        txns = [
            {"amount": -15.99, "description": "NETFLIX", "detail": "NETFLIX", "subtype_economic": "recurrente"},
            {"amount": -9.99, "description": "SPOTIFY", "detail": "SPOTIFY", "subtype_economic": "recurrente"},
            {"amount": -50.0, "description": "SUPERMERCADO XTRA", "detail": "SUPERMERCADO XTRA", "subtype_economic": "extraordinario"},
        ]
        recs = _rec(categorized_transactions=txns)
        assert "recurring_spend_summary" in _codes(recs)
        rec = next(r for r in recs if r["code"] == "recurring_spend_summary")
        assert rec["data"]["merchant_count"] == 2
        assert rec["data"]["total"] == pytest.approx(25.98)

    def test_not_present_when_no_recurrentes(self):
        txns = [
            {"amount": -50.0, "description": "UBER", "detail": "UBER", "subtype_economic": "extraordinario"},
        ]
        recs = _rec(categorized_transactions=txns)
        assert "recurring_spend_summary" not in _codes(recs)


class TestMerchantPriceIncrease:
    def test_warning_when_price_increases_over_threshold(self):
        # NETFLIX estaba a $12.99, ahora es $15.99 (~23% de aumento)
        txns = [
            {"amount": -15.99, "description": "NETFLIX", "detail": "NETFLIX", "subtype_economic": "recurrente"},
        ]
        history = {"NETFLIX": [12.99]}
        recs = _rec(categorized_transactions=txns, merchant_history=history)
        assert "merchant_price_increase" in _codes(recs)
        rec = next(r for r in recs if r["code"] == "merchant_price_increase")
        assert rec["type"] == "warning"
        assert rec["data"]["merchant"] == "NETFLIX"
        assert rec["data"]["prev_avg"] == pytest.approx(12.99)
        assert rec["data"]["curr_avg"] == pytest.approx(15.99)

    def test_no_warning_when_increase_below_threshold(self):
        txns = [
            {"amount": -15.99, "description": "NETFLIX", "detail": "NETFLIX", "subtype_economic": "recurrente"},
        ]
        # Aumento del 5% solamente
        history = {"NETFLIX": [15.25]}
        recs = _rec(categorized_transactions=txns, merchant_history=history)
        assert "merchant_price_increase" not in _codes(recs)

    def test_no_warning_when_no_history(self):
        txns = [
            {"amount": -15.99, "description": "NETFLIX", "detail": "NETFLIX", "subtype_economic": "recurrente"},
        ]
        recs = _rec(categorized_transactions=txns, merchant_history={})
        assert "merchant_price_increase" not in _codes(recs)

    def test_no_warning_when_price_decreased(self):
        txns = [
            {"amount": -9.99, "description": "NETFLIX", "detail": "NETFLIX", "subtype_economic": "recurrente"},
        ]
        history = {"NETFLIX": [15.99]}
        recs = _rec(categorized_transactions=txns, merchant_history=history)
        assert "merchant_price_increase" not in _codes(recs)


class TestAllClear:
    def test_fallback_success_when_no_alerts(self):
        # Finanzas perfectas: ahorra bien, sin cargos, sin concentración, sin desconocidos
        recs = generate_recommendations(
            total_income=1000.0,
            total_expenses=600.0,
            categories={"alimentacion": 200.0, "transporte": 200.0, "entretenimiento": 200.0},
            budget_roles={"presupuestable": 600.0},
            low_confidence_count=0,
            categorized_transactions=[],
            merchant_history=None,
        )
        # Debe tener good_savings_rate (40%) y top_expense_category, pero NO all_clear
        assert "all_clear" not in _codes(recs)

    def test_all_clear_when_literally_empty(self):
        recs = generate_recommendations(
            total_income=0.0,
            total_expenses=0.0,
            categories={},
            budget_roles={},
            low_confidence_count=0,
            categorized_transactions=[],
            merchant_history=None,
        )
        assert "all_clear" in _codes(recs)


class TestOutputStructure:
    def test_every_rec_has_required_fields(self):
        recs = _rec()
        for rec in recs:
            assert "type" in rec
            assert "code" in rec
            assert "message" in rec
            assert "data" in rec
            assert rec["type"] in ("critical", "warning", "info", "success")

    def test_no_duplicate_codes(self):
        recs = _rec(
            total_income=500.0,
            total_expenses=800.0,
            categories={"alimentacion": 700.0, "otros": 100.0},
            budget_roles={"presupuestable": 700.0, "gasto_financiero": 100.0},
            low_confidence_count=5,
            categorized_transactions=[],
        )
        codes = _codes(recs)
        # category_concentration puede co-existir con top_expense_category pero no duplicarse
        assert len(codes) == len(set(codes)), f"Códigos duplicados: {codes}"
