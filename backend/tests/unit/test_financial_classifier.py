"""
Tests unitarios para FinancialClassifier.

Cubre:
  - Pasos 0/0b: detección de nombre del usuario (own_transfer / third_party_transfer)
  - Paso 1: exact match personal
  - Paso 2: patrón regex personal
  - Paso 3: exact match global
  - Paso 4: patrón regex global
  - Paso 5: patrones builtin (ENTRE CUENTAS, PLANILLA, YAPPY, ITBMS, etc.)
  - Paso 6: fallback débito / crédito
  - learn(): escribe en KB personal por defecto
  - learn(): escribe en KB global cuando el detalle tiene keywords globales
  - learn(): force_personal ignora keywords globales
  - learn(): crea exact_match Y patrón en el KB destino
  - Carga de KB desde disco (persistencia round-trip)
"""
from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from app.services.financial_classifier import FinancialClassifier


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def tmp_kb_dir(tmp_path: Path) -> Path:
    """Directorio temporal para KBs — aislado por test."""
    return tmp_path


@pytest.fixture
def clf(tmp_kb_dir: Path) -> FinancialClassifier:
    """Clasificador limpio (KBs vacíos) apuntando a directorio temporal."""
    with patch("app.services.financial_classifier.settings") as mock_settings:
        mock_settings.knowledge_bases_dir = str(tmp_kb_dir)
        return FinancialClassifier(user_id="test-user-001", user_name="ALEXIS PINEDA")


@pytest.fixture
def clf_anonymous(tmp_kb_dir: Path) -> FinancialClassifier:
    """Clasificador sin user_name (no detecta transferencias propias por nombre)."""
    with patch("app.services.financial_classifier.settings") as mock_settings:
        mock_settings.knowledge_bases_dir = str(tmp_kb_dir)
        return FinancialClassifier(user_id="test-user-002", user_name=None)


def _row(detail: str, tipo: str = "", deposito: float = 0, retiro: float = 0) -> dict:
    return {
        "Detalle": detail,
        "Tipos de Movimientos": tipo,
        "Depósito": deposito,
        "Retiro": retiro,
    }


# ── Paso 0: own_transfer — nombre del usuario ─────────────────────────────────

class TestOwnTransfer:
    def test_full_name_in_detail(self, clf: FinancialClassifier) -> None:
        row = _row("BANCA MOVIL TRANSFERENCIA DE ALEXIS PINEDA", tipo="CREDITO", deposito=500)
        cats, conf, method = clf.predict(row)
        assert method == "own_transfer:name_match"
        assert conf == 1.0
        assert cats["budget_role"] == "solo_balance"

    def test_partial_name_two_tokens(self, clf: FinancialClassifier) -> None:
        """Dos tokens del nombre (≥3 chars) deben matchear."""
        row = _row("TRANSFERENCIA DE ALEXIS PINEDA CUENTA CORRIENTE", tipo="CREDITO", deposito=200)
        cats, conf, method = clf.predict(row)
        assert method == "own_transfer:name_match"

    def test_name_not_in_detail_does_not_match(self, clf: FinancialClassifier) -> None:
        row = _row("TRANSFERENCIA DE JUAN PEREZ", tipo="CREDITO", deposito=100)
        cats, conf, method = clf.predict(row)
        assert method != "own_transfer:name_match"

    def test_anonymous_classifier_skips_name_check(self, clf_anonymous: FinancialClassifier) -> None:
        """Sin user_name, nunca se activa own_transfer por nombre."""
        row = _row("TRANSFERENCIA DE ALEXIS PINEDA", tipo="CREDITO", deposito=500)
        _, _, method = clf_anonymous.predict(row)
        assert method != "own_transfer:name_match"


# ── Paso 0b: third_party_transfer — ACH/XPRESS sin nombre del usuario ─────────

class TestThirdPartyTransfer:
    def test_ach_without_user_name(self, clf: FinancialClassifier) -> None:
        row = _row("ACH XPRESS PAGO SERVICIOS PUBLICOS", tipo="CREDITO", deposito=300)
        cats, conf, method = clf.predict(row)
        assert method == "third_party_transfer:name_absent"
        assert conf == pytest.approx(0.85)
        assert cats["budget_role"] == "presupuestable"

    def test_xpress_without_user_name(self, clf: FinancialClassifier) -> None:
        row = _row("XPRESS TRANSFERENCIA EMPRESA ABC", tipo="CREDITO", deposito=1000)
        _, conf, method = clf.predict(row)
        assert method == "third_party_transfer:name_absent"

    def test_ach_with_user_name_is_own_transfer(self, clf: FinancialClassifier) -> None:
        """ACH con nombre del usuario → own_transfer, no third_party."""
        row = _row("ACH XPRESS ALEXIS PINEDA TRANSFERENCIA", tipo="CREDITO", deposito=500)
        cats, _, method = clf.predict(row)
        assert method == "own_transfer:name_match"
        assert cats["budget_role"] == "solo_balance"


# ── Paso 1: exact match personal ─────────────────────────────────────────────

class TestExactMatchPersonal:
    def test_exact_match_returns_personal_categories(self, clf: FinancialClassifier) -> None:
        cats = {
            "Economic Type": "gasto", "SubType Economic": "variable",
            "Tipo de transacción": "gasto", "Categoría de presupuesto": "alimentacion",
            "budget_role": "presupuestable",
        }
        clf.learn("SUPER REY TRANSISTMICA", cats, weight=1.0, force_personal=True)

        row = _row("SUPER REY TRANSISTMICA", tipo="DEBITO", retiro=85)
        result_cats, conf, method = clf.predict(row)
        assert method == "exact:personal"
        assert conf == 1.0
        assert result_cats["budget_role"] == "presupuestable"
        assert result_cats["Categoría de presupuesto"] == "alimentacion"

    def test_exact_match_is_case_normalized(self, clf: FinancialClassifier) -> None:
        """learn() normaliza a uppercase; predict() también normaliza el detalle."""
        cats = {"Economic Type": "gasto", "SubType Economic": "variable",
                "Tipo de transacción": "gasto", "Categoría de presupuesto": "farmacia",
                "budget_role": "presupuestable"}
        clf.learn("farmacia arrocha", cats, force_personal=True)

        row = _row("FARMACIA ARROCHA", tipo="DEBITO", retiro=20)
        _, _, method = clf.predict(row)
        assert method == "exact:personal"


# ── Paso 2: patrón regex personal ─────────────────────────────────────────────

class TestPatternPersonal:
    def test_learned_pattern_matches_variants(self, clf: FinancialClassifier) -> None:
        """learn() crea un patrón con \bWORD\b que coincide con variantes del detalle."""
        cats = {"Economic Type": "gasto", "SubType Economic": "variable",
                "Tipo de transacción": "gasto", "Categoría de presupuesto": "combustible",
                "budget_role": "presupuestable"}
        clf.learn("TEXACO TRANSISTMICA 2026", cats, force_personal=True)

        # La tx real tiene una referencia numérica distinta
        row = _row("TEXACO ALBROOK MALL", tipo="DEBITO", retiro=40)
        _, conf, method = clf.predict(row)
        assert method.startswith("pattern:personal")
        assert conf == pytest.approx(0.92)


# ── Paso 3: exact match global ────────────────────────────────────────────────

class TestExactMatchGlobal:
    def test_global_keyword_goes_to_global_kb(self, clf: FinancialClassifier) -> None:
        """Detalles con keywords globales (NETFLIX, UBER, etc.) → KB global."""
        cats = {"Economic Type": "gasto", "SubType Economic": "recurrente",
                "Tipo de transacción": "gasto", "Categoría de presupuesto": "entretenimiento",
                "budget_role": "presupuestable"}
        clf.learn("NETFLIX MONTHLY SUBSCRIPTION", cats)  # NETFLIX es global keyword

        row = _row("NETFLIX MONTHLY SUBSCRIPTION", tipo="DEBITO", retiro=15)
        _, conf, method = clf.predict(row)
        assert method == "exact:global"
        assert conf == 1.0

    def test_global_exact_match_takes_priority_over_personal_pattern(
        self, clf: FinancialClassifier
    ) -> None:
        """El exact match global (paso 3) tiene prioridad sobre patrones personales (paso 2)."""
        personal_cats = {"Economic Type": "otro", "SubType Economic": "otro",
                         "Tipo de transacción": "otro", "Categoría de presupuesto": "otro",
                         "budget_role": "revisar"}
        global_cats = {"Economic Type": "gasto", "SubType Economic": "recurrente",
                       "Tipo de transacción": "gasto", "Categoría de presupuesto": "streaming",
                       "budget_role": "presupuestable"}

        # Patrón personal con keyword "UBER"
        clf.personal_rules["patterns"]["personal_uber"] = {
            "regex": r"\bUBER\b", "categories": personal_cats, "source": "test"
        }
        # Exact match global para el detalle exacto
        clf.global_rules["exact_matches"]["UBER TRIP 123"] = global_cats

        row = _row("UBER TRIP 123", tipo="DEBITO", retiro=8)
        result_cats, _, method = clf.predict(row)
        assert method == "exact:global"
        assert result_cats["Categoría de presupuesto"] == "streaming"


# ── Paso 5: patrones builtin ──────────────────────────────────────────────────

class TestBuiltinPatterns:
    @pytest.mark.parametrize("detail,expected_role,expected_method_prefix", [
        ("PLANILLA EMPRESA ABC", "presupuestable", "builtin:salario"),
        ("SALARIO MENSUAL ENERO", "presupuestable", "builtin:salario"),
        ("NOMINA QUINCENA", "presupuestable", "builtin:salario"),
        ("CR DEVOLUCION COMPRA FALLIDA", "solo_balance", "builtin:devolucion"),
        ("REVERSO CARGO DUPLICADO", "solo_balance", "builtin:devolucion"),
        ("CREDITO TRANSF. DE AH A CC", "solo_balance", "builtin:transf_propia_cc"),
        ("ENTRE CUENTAS BANCA MOVIL", "solo_balance", "builtin:entre_cuentas"),
        ("BANCA MOVIL ENTRE CUENTAS", "solo_balance", "builtin:entre_cuentas"),
        ("YAPPY BG DE MARIA LOPEZ", "presupuestable", "builtin:yappy_ingreso"),
        ("PAGO YAPPY BG A CARLOS", "revisar", "builtin:yappy_gasto"),
        ("YAPPY BG A PEDRO", "revisar", "builtin:yappy_gasto"),
        ("COMISION MANTENIMIENTO CUENTA", "gasto_financiero", "builtin:comision"),
        ("CARGO ANUAL TARJETA", "gasto_financiero", "builtin:comision"),
        ("ITBMS DICIEMBRE 2025", "gasto_financiero", "builtin:itbms"),
    ])
    def test_builtin_pattern(
        self,
        clf: FinancialClassifier,
        detail: str,
        expected_role: str,
        expected_method_prefix: str,
    ) -> None:
        row = _row(detail, tipo="CREDITO", deposito=100)
        cats, conf, method = clf.predict(row)
        assert method == expected_method_prefix, (
            f"Detail='{detail}': esperaba method='{expected_method_prefix}', got='{method}'"
        )
        assert cats["budget_role"] == expected_role, (
            f"Detail='{detail}': esperaba budget_role='{expected_role}', got='{cats['budget_role']}'"
        )
        assert conf >= 0.82

    def test_entre_cuentas_en_transferencia_larga(self, clf: FinancialClassifier) -> None:
        """Caso real: BANCA MOVIL TRANSFERENCIA DE PAUL PLATA ENTRE CUENTAS."""
        row = _row(
            "BANCA MOVIL TRANSFERENCIA DE PAUL JOSEPH PLATA RODRIGUEZ ENTRE CUENTAS",
            tipo="CREDITO", deposito=500,
        )
        cats, _, method = clf.predict(row)
        assert method == "builtin:entre_cuentas"
        assert cats["budget_role"] == "solo_balance"


# ── Paso 6: fallback ──────────────────────────────────────────────────────────

class TestFallback:
    def test_fallback_debito(self, clf_anonymous: FinancialClassifier) -> None:
        row = _row("COMPRA DESCONOCIDA XYZ", tipo="DEBITO", retiro=50)
        cats, conf, method = clf_anonymous.predict(row)
        assert method == "fallback_debito"
        assert conf == pytest.approx(0.3)
        assert cats["budget_role"] == "revisar"

    def test_fallback_credito(self, clf_anonymous: FinancialClassifier) -> None:
        row = _row("ABONO DESCONOCIDO ZZZ", tipo="CREDITO", deposito=100)
        cats, conf, method = clf_anonymous.predict(row)
        assert method == "fallback_credito"
        assert conf == pytest.approx(0.3)
        assert cats["budget_role"] == "revisar"

    def test_unknown_when_no_amount(self, clf_anonymous: FinancialClassifier) -> None:
        row = _row("ALGO SIN MONTO")
        cats, conf, method = clf_anonymous.predict(row)
        assert method == "unknown"
        assert conf == 0.0
        assert cats is None


# ── learn() — persistencia ────────────────────────────────────────────────────

class TestLearn:
    def _cats(self, category: str = "alimentacion", role: str = "presupuestable") -> dict:
        return {
            "Economic Type": "gasto", "SubType Economic": "variable",
            "Tipo de transacción": "gasto",
            "Categoría de presupuesto": category,
            "budget_role": role,
        }

    def test_learn_creates_exact_match_in_personal(self, clf: FinancialClassifier) -> None:
        clf.learn("MERCADO 99 COSTA DEL ESTE", self._cats(), force_personal=True)
        assert "MERCADO 99 COSTA DEL ESTE" in clf.personal_rules["exact_matches"]
        assert "MERCADO 99 COSTA DEL ESTE" not in clf.global_rules["exact_matches"]

    def test_learn_global_keyword_goes_to_global(self, clf: FinancialClassifier) -> None:
        clf.learn("UBER EATS PAGO", self._cats())  # UBER es global keyword
        assert "UBER EATS PAGO" in clf.global_rules["exact_matches"]
        assert "UBER EATS PAGO" not in clf.personal_rules["exact_matches"]

    def test_learn_force_personal_overrides_global_keyword(self, clf: FinancialClassifier) -> None:
        clf.learn("NETFLIX FAMILIAR", self._cats(), force_personal=True)
        assert "NETFLIX FAMILIAR" in clf.personal_rules["exact_matches"]
        assert "NETFLIX FAMILIAR" not in clf.global_rules["exact_matches"]

    def test_learn_creates_pattern(self, clf: FinancialClassifier) -> None:
        """learn() debe crear al menos un patrón de regex en el KB destino."""
        clf.learn("CLINICA SAN FERNANDO CONSULTA", self._cats(category="salud"), force_personal=True)
        personal_patterns = clf.personal_rules["patterns"]
        # Debe haber al menos un patrón con "CLINICA" o "FERNANDO"
        pattern_regexes = [p["regex"] for p in personal_patterns.values()]
        assert any(re.search(r"CLINICA|FERNANDO", rx) for rx in pattern_regexes)

    def test_learn_increments_corrections_count(self, clf: FinancialClassifier) -> None:
        before = clf.personal_rules["corrections_count"]
        clf.learn("TAXI UBER POOL", self._cats(), force_personal=True)
        assert clf.personal_rules["corrections_count"] == before + 1

    def test_learn_persists_to_disk(self, clf: FinancialClassifier, tmp_kb_dir: Path) -> None:
        """Después de learn(), el archivo JSON debe existir y contener el ejemplo."""
        clf.learn("FARMACIA METRO PAITILLA", self._cats(category="salud"), force_personal=True)

        kb_file = tmp_kb_dir / "knowledge_base_user_test-user-001.json"
        assert kb_file.exists()

        with open(kb_file, encoding="utf-8") as f:
            data = json.load(f)

        assert "FARMACIA METRO PAITILLA" in data["exact_matches"]

    def test_learn_round_trip(self, tmp_kb_dir: Path) -> None:
        """Un clasificador nuevo cargando el KB persistido debe predecir correctamente."""
        cats = {"Economic Type": "gasto", "SubType Economic": "recurrente",
                "Tipo de transacción": "gasto", "Categoría de presupuesto": "gimnasio",
                "budget_role": "presupuestable"}

        with patch("app.services.financial_classifier.settings") as mock_settings:
            mock_settings.knowledge_bases_dir = str(tmp_kb_dir)
            clf1 = FinancialClassifier("round-trip-user", "USUARIO TEST")
            clf1.learn("SMARTFIT ALBROOK", cats, force_personal=True)

        # Nuevo clasificador, carga del disco
        with patch("app.services.financial_classifier.settings") as mock_settings:
            mock_settings.knowledge_bases_dir = str(tmp_kb_dir)
            clf2 = FinancialClassifier("round-trip-user", "USUARIO TEST")

        row = _row("SMARTFIT ALBROOK", tipo="DEBITO", retiro=30)
        result_cats, conf, method = clf2.predict(row)
        assert method == "exact:personal"
        assert result_cats["Categoría de presupuesto"] == "gimnasio"

    def test_learn_user_name_tokens_excluded_from_patterns(self, clf: FinancialClassifier) -> None:
        """Los tokens del nombre del usuario no deben usarse como palabras clave de patrones."""
        cats = {"Economic Type": "gasto", "SubType Economic": "variable",
                "Tipo de transacción": "gasto", "Categoría de presupuesto": "otros",
                "budget_role": "presupuestable"}
        clf.learn("BANCA MOVIL TRANSFERENCIA DE ALEXIS PINEDA ENTRE CUENTAS", cats, force_personal=True)

        # "ALEXIS" y "PINEDA" no deben estar en los patrones (son tokens del usuario)
        all_regexes = " ".join(
            p["regex"] for p in clf.personal_rules["patterns"].values()
        )
        assert "ALEXIS" not in all_regexes
        assert "PINEDA" not in all_regexes
