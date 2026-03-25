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
  - learn(): escribe en KB global por defecto (cualquier comercio)
  - learn(): budget_role=solo_balance → KB personal (transferencia propia)
  - learn(): Economic Type=transferencia_tercero → KB personal (pago a persona)
  - learn(): force_personal=True → KB personal (excepción explícita del usuario)
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
            "Economic Type": "gasto", "Economic Type Detail": "gasto_variable",
            "SubType Economic": "variable", "Categoría de presupuesto": "alimentacion",
            "budget_role": "presupuestable",
        }
        clf.learn("SUPER REY TRANSISTMICA", cats, weight=1.0, force_personal=True)

        row = _row("SUPER REY TRANSISTMICA", tipo="DEBITO", retiro=85)
        result_cats, conf, method = clf.predict(row)
        assert method.startswith("exact:personal")  # método puede incluir sufijo ":canonical"
        assert conf == 1.0
        assert result_cats["budget_role"] == "presupuestable"
        assert result_cats["Categoría de presupuesto"] == "alimentacion"

    def test_exact_match_is_case_normalized(self, clf: FinancialClassifier) -> None:
        """learn() normaliza a uppercase; predict() también normaliza el detalle."""
        cats = {"Economic Type": "gasto", "Economic Type Detail": "gasto_variable",
                "SubType Economic": "variable", "Categoría de presupuesto": "farmacia",
                "budget_role": "presupuestable"}
        clf.learn("farmacia arrocha", cats, force_personal=True)

        row = _row("FARMACIA ARROCHA", tipo="DEBITO", retiro=20)
        _, _, method = clf.predict(row)
        assert method.startswith("exact:personal")


# ── Paso 2: patrón regex personal ─────────────────────────────────────────────

class TestPatternPersonal:
    def test_learned_pattern_matches_variants(self, clf: FinancialClassifier) -> None:
        """learn() almacena por clave canónica; detalles distintos que comparten el mismo
        canonical son reconocidos vía exact match personal (paso 1), lo cual valida que
        una sola llamada a learn() cubre variantes del mismo comercio.

        Ejemplo: aprender "DOMINOS TRANSISTMICA OCTUBRE" guarda la clave canónica "DOMINOS".
        Al predecir "DOMINOS BELLA VISTA", el canonical también es "DOMINOS" → exact match.
        """
        cats = {"Economic Type": "gasto", "Economic Type Detail": "gasto_variable",
                "SubType Economic": "variable", "Categoría de presupuesto": "alimentacion",
                "budget_role": "presupuestable"}
        clf.learn("DOMINOS TRANSISTMICA OCTUBRE", cats, force_personal=True)

        # Variante con local diferente — mismo canonical "DOMINOS"
        row = _row("DOMINOS BELLA VISTA", tipo="DEBITO", retiro=21)
        _, conf, method = clf.predict(row)
        # canonical("DOMINOS BELLA VISTA") = "DOMINOS" → exact match personal
        assert method.startswith("exact:personal")
        assert conf == pytest.approx(1.0)


# ── Paso 3: exact match global ────────────────────────────────────────────────

class TestExactMatchGlobal:
    def test_global_keyword_goes_to_global_kb(self, clf: FinancialClassifier) -> None:
        """Detalles con keywords globales (NETFLIX, UBER, etc.) → KB global."""
        cats = {"Economic Type": "gasto", "Economic Type Detail": "gasto_recurrente",
                "SubType Economic": "recurrente", "Categoría de presupuesto": "entretenimiento",
                "budget_role": "presupuestable"}
        clf.learn("NETFLIX MONTHLY SUBSCRIPTION", cats)  # NETFLIX es global keyword

        row = _row("NETFLIX MONTHLY SUBSCRIPTION", tipo="DEBITO", retiro=15)
        _, conf, method = clf.predict(row)
        assert method.startswith("exact:global")  # puede incluir sufijo ":canonical"
        assert conf == 1.0

    def test_personal_pattern_beats_global_exact_match(
        self, clf: FinancialClassifier
    ) -> None:
        """El patrón personal (paso 2) tiene prioridad sobre el exact match global (paso 3).

        El diseño "personal siempre gana" significa que el KB personal es soberano:
        si el usuario entrenó un patrón que coincide, ese resultado se usa aunque
        exista un exact match en el KB global.
        """
        personal_cats = {"Economic Type": "gasto", "Economic Type Detail": "gasto_variable",
                         "SubType Economic": "variable", "Categoría de presupuesto": "otro",
                         "budget_role": "revisar"}
        global_cats = {"Economic Type": "gasto", "Economic Type Detail": "gasto_recurrente",
                       "SubType Economic": "recurrente", "Categoría de presupuesto": "streaming",
                       "budget_role": "presupuestable"}

        # Patrón personal con keyword "UBER"
        clf.personal_rules["patterns"]["personal_uber"] = {
            "regex": r"\bUBER\b", "categories": personal_cats, "source": "test"
        }
        # Exact match global para el detalle exacto
        clf.global_rules["exact_matches"]["UBER TRIP 123"] = global_cats

        row = _row("UBER TRIP 123", tipo="DEBITO", retiro=8)
        result_cats, conf, method = clf.predict(row)
        # Personal pattern (step 2) runs before global exact match (step 3)
        assert method == "pattern:personal:personal_uber"
        assert conf == 0.92
        assert result_cats["Categoría de presupuesto"] == "otro"  # personal beats global


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
            "Economic Type": "gasto",
            "Economic Type Detail": "gasto_variable",
            "SubType Economic": "variable",
            "Categoría de presupuesto": category,
            "budget_role": role,
        }

    def test_learn_creates_exact_match_in_personal(self, clf: FinancialClassifier) -> None:
        clf.learn("MERCADO 99 COSTA DEL ESTE", self._cats(), force_personal=True)
        assert "MERCADO 99 COSTA DEL ESTE" in clf.personal_rules["exact_matches"]
        assert "MERCADO 99 COSTA DEL ESTE" not in clf.global_rules["exact_matches"]

    def test_learn_comercio_sin_keywords_va_a_global_por_defecto(self, clf: FinancialClassifier) -> None:
        """Cualquier comercio va a global por defecto, incluso si no tiene keywords conocidos.

        Esto cubre el caso de comercios locales (TRESCUATES, NATUVIVA, ROCKEFELLER, etc.)
        que antes iban a personal por no estar en GLOBAL_KEYWORDS.
        """
        clf.learn("TRESCUATES", self._cats(category="restaurantes", role="no_presupuestable"))
        # learn() almacena por clave canónica; "TRESCUATES" es un comercio → global
        assert "TRESCUATES" in clf.global_rules["exact_matches"]
        assert "TRESCUATES" not in clf.personal_rules["exact_matches"]

    def test_learn_global_keyword_still_goes_to_global(self, clf: FinancialClassifier) -> None:
        """Marcas conocidas (UBER, NETFLIX) siguen yendo a global — no cambia nada para ellas."""
        clf.learn("UBER EATS PAGO", self._cats())
        # canonical("UBER EATS PAGO") = "UBER"
        assert "UBER" in clf.global_rules["exact_matches"]
        assert "UBER" not in clf.personal_rules["exact_matches"]

    def test_learn_solo_balance_va_a_personal(self, clf: FinancialClassifier) -> None:
        """Transferencias propias (solo_balance) van siempre a KB personal, nunca a global.

        No tiene sentido compartir entre cuentas propias en el KB global porque son
        específicas del usuario (ENTRE CUENTAS, BANCA MOVIL TRANSFERENCIA).
        """
        cats = {
            "Economic Type": "transferencia_propia",
            "Economic Type Detail": "transferencia_propia",
            "SubType Economic": "interno",
            "Categoría de presupuesto": "otros",
            "budget_role": "solo_balance",
        }
        clf.learn("ENTRE CUENTAS AHORRO", cats)  # sin force_personal, debe ir a personal por solo_balance
        # canonical puede ser "ENTRE CUENTAS AHORRO" o similar
        key = list(clf.personal_rules["exact_matches"].keys())
        assert len(key) == 1
        assert key[0] not in clf.global_rules["exact_matches"]

    def test_learn_transferencia_tercero_va_a_personal(self, clf: FinancialClassifier) -> None:
        """Pagos a personas específicas (YAPPY A CARLOS, ACH XPRESS A MARIA) van a personal.

        El Economic Type "transferencia_tercero" es la señal de que el descriptor
        contiene el nombre de una persona, no un comercio. No debe compartirse en global.
        """
        cats = {
            "Economic Type": "transferencia_tercero",
            "Economic Type Detail": "transferencia_tercero",
            "SubType Economic": "variable",
            "Categoría de presupuesto": "otros",
            "budget_role": "no_presupuestable",
        }
        clf.learn("YAPPY BG A CARLOS RODRIGUEZ", cats)  # sin force_personal → personal por tipo
        # canonical("YAPPY BG A CARLOS RODRIGUEZ") → algo como "CARLOS RODRIGUEZ"
        assert len(clf.personal_rules["exact_matches"]) == 1
        assert len(clf.global_rules["exact_matches"]) == 0

    def test_learn_force_personal_overrides_default_global(self, clf: FinancialClassifier) -> None:
        """force_personal=True fuerza a personal aunque sea un comercio (útil para
        categorización diferente a la del KB global).
        """
        clf.learn("NETFLIX FAMILIAR", self._cats(), force_personal=True)
        # canonical("NETFLIX FAMILIAR") = "NETFLIX"
        assert "NETFLIX" in clf.personal_rules["exact_matches"]
        assert "NETFLIX" not in clf.global_rules["exact_matches"]

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
        cats = {"Economic Type": "gasto", "Economic Type Detail": "gasto_recurrente",
                "SubType Economic": "recurrente", "Categoría de presupuesto": "gimnasio",
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
        assert method.startswith("exact:personal")  # puede incluir sufijo ":canonical"
        assert result_cats["Categoría de presupuesto"] == "gimnasio"

    def test_learn_user_name_tokens_excluded_from_patterns(self, clf: FinancialClassifier) -> None:
        """Los tokens del nombre del usuario no deben usarse como palabras clave de patrones."""
        cats = {"Economic Type": "gasto", "Economic Type Detail": "gasto_variable",
                "SubType Economic": "variable", "Categoría de presupuesto": "otros",
                "budget_role": "presupuestable"}
        clf.learn("BANCA MOVIL TRANSFERENCIA DE ALEXIS PINEDA ENTRE CUENTAS", cats, force_personal=True)

        # "ALEXIS" y "PINEDA" no deben estar en los patrones (son tokens del usuario)
        all_regexes = " ".join(
            p["regex"] for p in clf.personal_rules["patterns"].values()
        )
        assert "ALEXIS" not in all_regexes
        assert "PINEDA" not in all_regexes
