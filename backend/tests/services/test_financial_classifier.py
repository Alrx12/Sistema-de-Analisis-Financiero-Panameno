import json
from pathlib import Path

import pytest

from app.services.financial_classifier import FinancialClassifier


@pytest.fixture
def kb_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(
        "app.services.financial_classifier.settings.knowledge_bases_dir",
        str(tmp_path),
    )
    return tmp_path


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def build_row(
    detalle: str,
    tipo: str = "DEBIT",
    deposito: float = 0.0,
    retiro: float = 10.0,
) -> dict:
    return {
        "Detalle": detalle,
        "Tipos de Movimientos": tipo,
        "Depósito": deposito,
        "Retiro": retiro,
    }


def test_predict_returns_fallback_debito_when_nothing_matches(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    categories, confidence, method = clf.predict(
        build_row("DETALLE COMPLETAMENTE DESCONOCIDO")
    )

    assert categories is not None
    assert categories["Economic Type"] == "gasto"
    assert categories["Categoría de presupuesto"] == "consumo_desconocido"
    assert categories["budget_role"] == "revisar"
    assert confidence == 0.3
    assert method == "fallback_debito"


def test_predict_returns_fallback_credito_when_nothing_matches(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    categories, confidence, method = clf.predict(
        build_row(
            detalle="ABONO EXTRAÑO NO CLASIFICADO",
            tipo="CREDIT",
            deposito=50.0,
            retiro=0.0,
        )
    )

    assert categories is not None
    assert categories["Economic Type"] == "otros_ingresos"
    assert categories["Tipo de transacción"] == "ingreso"
    assert categories["Categoría de presupuesto"] == "otros"
    assert categories["budget_role"] == "revisar"
    assert confidence == 0.3
    assert method == "fallback_credito"


def test_predict_detects_own_transfer_by_user_name(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    categories, confidence, method = clf.predict(
        build_row(
            detalle="TRANSFERENCIA ACH ALEXIS PINEDA",
            tipo="ACH",
            deposito=0.0,
            retiro=100.0,
        )
    )

    assert categories == clf.OWN_TRANSFER
    assert confidence == 1.0
    assert method == "own_transfer:name_match"


def test_predict_detects_third_party_transfer_when_ach_without_user_name(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    categories, confidence, method = clf.predict(
        build_row(
            detalle="TRANSFERENCIA ACH XPRESS A TERCERO",
            tipo="ACH",
            deposito=0.0,
            retiro=100.0,
        )
    )

    assert categories == clf.THIRD_TRANSFER
    assert confidence == 0.85
    assert method == "third_party_transfer:name_absent"


def test_learn_force_personal_stores_canonical_detail_in_personal_kb(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    categories = {
        "Economic Type": "gasto",
        "SubType Economic": "recurrente",
        "Tipo de transacción": "gasto",
        "Categoría de presupuesto": "entretenimiento",
        "budget_role": "presupuestable",
    }

    raw_detail = "DB COMPRA E-COMMERCE INTL MCD CTE-FRA-SPOTIFY P3-5925-15858680"
    clf.learn(raw_detail, categories, force_personal=True)

    personal_kb_path = kb_dir / "knowledge_base_user_user-1.json"
    assert personal_kb_path.exists()

    personal_kb = read_json(personal_kb_path)

    assert "SPOTIFY" in personal_kb["exact_matches"]
    assert raw_detail not in personal_kb["exact_matches"]
    assert personal_kb["exact_matches"]["SPOTIFY"]["Economic Type"] == "gasto"


def test_predict_hits_personal_canonical_exact_match_after_learning(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    learned_categories = {
        "Economic Type": "gasto",
        "SubType Economic": "recurrente",
        "Tipo de transacción": "gasto",
        "Categoría de presupuesto": "entretenimiento",
        "budget_role": "presupuestable",
    }

    clf.learn(
        "DB COMPRA E-COMMERCE INTL MCD CTE-FRA-SPOTIFY P3-5925-15858680",
        learned_categories,
        force_personal=True,
    )

    categories, confidence, method = clf.predict(
        build_row("DB COMPRA E-COMMERCE INTL MCD CTE-IRL-SPOTIFY P4-8888-99999999")
    )

    assert categories == learned_categories
    assert confidence == 1.0
    assert method == "exact:personal:canonical"


def test_learn_without_force_personal_goes_to_global_when_global_keyword_present(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    categories = {
        "Economic Type": "gasto",
        "SubType Economic": "operativo",
        "Tipo de transacción": "gasto",
        "Categoría de presupuesto": "vivienda",
        "budget_role": "presupuestable",
    }

    clf.learn(
        "DB POS COMPRA MCD CTE-XTRA MARKE",
        categories,
        force_personal=False,
    )

    global_kb_path = kb_dir / "knowledge_base_global.json"
    assert global_kb_path.exists()

    global_kb = read_json(global_kb_path)

    assert "SUPERMERCADO XTRA" in global_kb["exact_matches"]
    assert global_kb["exact_matches"]["SUPERMERCADO XTRA"]["Categoría de presupuesto"] == "vivienda"


def test_predict_hits_global_canonical_exact_match_after_learning(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    learned_categories = {
        "Economic Type": "gasto",
        "SubType Economic": "operativo",
        "Tipo de transacción": "gasto",
        "Categoría de presupuesto": "vivienda",
        "budget_role": "presupuestable",
    }

    clf.learn(
        "DB POS COMPRA MCD CTE-XTRA MARKE",
        learned_categories,
        force_personal=False,
    )

    categories, confidence, method = clf.predict(
        build_row("DB POS COMPRA SUPER XTRA TRANSISTMICA")
    )

    assert categories == learned_categories
    assert confidence == 1.0
    assert method == "exact:global:canonical"


def test_learn_preserves_google_gri_as_distinct_from_grindr(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    google_gri_categories = {
        "Economic Type": "gasto",
        "SubType Economic": "recurrente",
        "Tipo de transacción": "gasto",
        "Categoría de presupuesto": "entretenimiento",
        "budget_role": "presupuestable",
    }

    grindr_categories = {
        "Economic Type": "gasto",
        "SubType Economic": "recurrente",
        "Tipo de transacción": "gasto",
        "Categoría de presupuesto": "otros",
        "budget_role": "presupuestable",
    }

    clf.learn(
        "DB COMPRA E-COMMERCE INTL MCD CTE-USA-GOOGLE GRI",
        google_gri_categories,
        force_personal=False,
    )
    clf.learn(
        "GRINDR",
        grindr_categories,
        force_personal=False,
    )

    global_kb = read_json(kb_dir / "knowledge_base_global.json")

    assert "GOOGLE GRI" in global_kb["exact_matches"]
    assert "GRINDR" in global_kb["exact_matches"]
    assert global_kb["exact_matches"]["GOOGLE GRI"] != global_kb["exact_matches"]["GRINDR"]


def test_predict_builtin_salary_pattern(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    categories, confidence, method = clf.predict(
        build_row(
            detalle="PAGO DE PLANILLA EMPRESA XYZ",
            tipo="CREDIT",
            deposito=1000.0,
            retiro=0.0,
        )
    )

    assert categories is not None
    assert categories["Economic Type"] == "salario"
    assert categories["Tipo de transacción"] == "ingreso"
    assert confidence == 0.95
    assert method == "builtin:salario"


def test_predict_builtin_itbms_pattern(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    categories, confidence, method = clf.predict(
        build_row("PAGO ITBMS SERVICIO DIGITAL")
    )

    assert categories is not None
    assert categories["Economic Type"] == "impuesto"
    assert categories["budget_role"] == "gasto_financiero"
    assert confidence == 0.95
    assert method == "builtin:itbms"


def test_ambiguous_canonical_key_does_not_generate_pattern(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    categories = {
        "Economic Type": "gasto",
        "SubType Economic": "operativo",
        "Tipo de transacción": "gasto",
        "Categoría de presupuesto": "otros",
        "budget_role": "presupuestable",
    }

    # Esto debería canonizar a METRO, que está en la blacklist de ambiguos
    clf.learn("DB POS COMPRA METRO", categories, force_personal=False)

    global_kb = read_json(kb_dir / "knowledge_base_global.json")

    pattern_names = set(global_kb["patterns"].keys())
    assert not any("METRO" in pattern_name for pattern_name in pattern_names)


def test_pattern_is_created_for_non_ambiguous_canonical_key(kb_dir: Path) -> None:
    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    categories = {
        "Economic Type": "gasto",
        "SubType Economic": "recurrente",
        "Tipo de transacción": "gasto",
        "Categoría de presupuesto": "entretenimiento",
        "budget_role": "presupuestable",
    }

    clf.learn(
        "DB COMPRA E-COMMERCE INTL MCD CTE-FRA-SPOTIFY P3-5925-15858680",
        categories,
        force_personal=False,
    )

    global_kb = read_json(kb_dir / "knowledge_base_global.json")

    assert any("SPOTIFY" in pattern_name for pattern_name in global_kb["patterns"].keys())


def test_reload_classifier_keeps_learned_information(kb_dir: Path) -> None:
    categories = {
        "Economic Type": "gasto",
        "SubType Economic": "recurrente",
        "Tipo de transacción": "gasto",
        "Categoría de presupuesto": "entretenimiento",
        "budget_role": "presupuestable",
    }

    clf = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")
    clf.learn(
        "DB COMPRA E-COMMERCE INTL MCD CTE-FRA-SPOTIFY P3-5925-15858680",
        categories,
        force_personal=True,
    )

    reloaded = FinancialClassifier(user_id="user-1", user_name="Alexis Pineda")

    predicted, confidence, method = reloaded.predict(
        build_row("DB COMPRA E-COMMERCE INTL MCD CTE-IRL-SPOTIFY")
    )

    assert predicted == categories
    assert confidence == 1.0
    assert method == "exact:personal:canonical"