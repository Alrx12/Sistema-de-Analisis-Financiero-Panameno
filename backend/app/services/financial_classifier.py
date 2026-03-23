"""
FinancialClassifier — motor de categorización inteligente de transacciones.

Dos capas de aprendizaje:
  GLOBAL  (knowledge_base_global.json)  — marcas, comercios, términos bancarios universales
  PERSONAL (knowledge_base_user_{id}.json) — contactos, patrones propios del usuario

Orden de predicción:
  0. Detección del nombre del usuario (transferencia propia vs tercero)
  1. Exact match personal
  2. Patrón regex personal
  3. Exact match global
  4. Patrón regex global
  5. Patrones builtin (YAPPY, PLANILLA, ITBMS, etc.)
  6. Fallback por tipo de movimiento (débito / crédito)
"""
from __future__ import annotations

import json
import logging
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Rutas derivadas de settings ───────────────────────────────────────────────

def _global_kb_path() -> str:
    p = Path(settings.knowledge_bases_dir)
    p.mkdir(parents=True, exist_ok=True)
    return str(p / "knowledge_base_global.json")


def _user_kb_path(user_id: str) -> str:
    p = Path(settings.knowledge_bases_dir)
    p.mkdir(parents=True, exist_ok=True)
    return str(p / f"knowledge_base_user_{user_id}.json")


# ── Classifier ────────────────────────────────────────────────────────────────

class FinancialClassifier:
    """
    Clasifica transacciones financieras con aprendizaje persistente por usuario.

    Args:
        user_id   : UUID del usuario (requerido en producción).
        user_name : Nombre completo del usuario para detectar transferencias propias.
    """

    def __init__(self, user_id: str, user_name: str | None = None):
        self.user_id = user_id
        self.global_kb_path = _global_kb_path()
        self.user_kb_path = _user_kb_path(user_id)

        self.user_name = user_name.strip().upper() if user_name else None
        self.user_name_tokens = (
            [t for t in self.user_name.split() if len(t) >= 3]
            if self.user_name else []
        )

        self.global_rules: dict = self._empty_rules()
        self.personal_rules: dict = self._empty_rules()

        self._load_kb(self.global_kb_path, self.global_rules, "global")
        self._load_kb(self.user_kb_path, self.personal_rules, "personal")

    # ── Helpers de inicialización ─────────────────────────────────────────────

    @staticmethod
    def _empty_rules() -> dict:
        return {
            "exact_matches": {},
            "patterns": {},
            "word_weights": defaultdict(lambda: defaultdict(float)),
            "corrections_count": 0,
        }

    def _load_kb(self, path: str, rules: dict, label: str) -> None:
        if not Path(path).exists():
            logger.debug("KB %s no encontrado, arrancando vacío: %s", label, path)
            return
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        rules["exact_matches"] = data.get("exact_matches", {})
        rules["patterns"] = data.get("patterns", {})
        rules["corrections_count"] = data.get("corrections_count", 0)
        for word, cats in data.get("word_weights", {}).items():
            for cat, weight in cats.items():
                rules["word_weights"][word][cat] = weight
        logger.info(
            "KB %s cargado — %d correcciones, %d patrones (%s)",
            label,
            rules["corrections_count"],
            len(rules["patterns"]),
            path,
        )

    def _save_kb(self, path: str, rules: dict, label: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        data = {
            "last_updated": datetime.now().isoformat(),
            "exact_matches": rules["exact_matches"],
            "patterns": rules["patterns"],
            "word_weights": {k: dict(v) for k, v in rules["word_weights"].items()},
            "corrections_count": rules["corrections_count"],
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        logger.info("KB %s guardado — %d correcciones (%s)", label, rules["corrections_count"], path)

    # ── Categorías canónicas ──────────────────────────────────────────────────

    OWN_TRANSFER = {
        "Economic Type": "transferencia_propia",
        "SubType Economic": "interno",
        "Tipo de transacción": "transferencia",
        "Categoría de presupuesto": "ahorro",
        "budget_role": "solo_balance",
    }
    THIRD_TRANSFER = {
        "Economic Type": "transferencia_tercero",
        "SubType Economic": "operativo",
        "Tipo de transacción": "transferencia",
        "Categoría de presupuesto": "otros",
        "budget_role": "presupuestable",
    }

    # ── Patrones builtin ──────────────────────────────────────────────────────

    BUILTIN_PATTERNS: list[tuple] = [
        (
            r"PLANILLA|SALARIO|NOMINA|PAYROLL",
            {"Economic Type": "salario", "SubType Economic": "recurrente",
             "Tipo de transacción": "ingreso", "Categoría de presupuesto": "otros",
             "budget_role": "presupuestable"},
            0.95, "builtin:salario",
        ),
        (
            r"CR DEVOLUCION|REV DB POS|REVERSO|AJUSTE CTE",
            {"Economic Type": "reembolso", "SubType Economic": "variable",
             "Tipo de transacción": "reembolso", "Categoría de presupuesto": "otros",
             "budget_role": "solo_balance"},
            0.93, "builtin:devolucion",
        ),
        (
            r"INTERES.*CUENTA|INTERES.*AHORROS",
            {"Economic Type": "otros_ingresos", "SubType Economic": "financiero",
             "Tipo de transacción": "ingreso", "Categoría de presupuesto": "otros",
             "budget_role": "presupuestable"},
            0.92, "builtin:interes_ahorro",
        ),
        (
            r"CREDITO TRANSF\. DE (CC|AH) A (CC|AH)",
            {"Economic Type": "transferencia_propia", "SubType Economic": "interno",
             "Tipo de transacción": "transferencia", "Categoría de presupuesto": "ahorro",
             "budget_role": "solo_balance"},
            0.93, "builtin:transf_propia_cc",
        ),
        (
            r"^YAPPY BG DE ",
            {"Economic Type": "transferencia_tercero", "SubType Economic": "variable",
             "Tipo de transacción": "ingreso", "Categoría de presupuesto": "otros",
             "budget_role": "presupuestable"},
            0.90, "builtin:yappy_ingreso",
        ),
        (
            r"^PAGO YAPPY BG A |^YAPPY BG A ",
            {"Economic Type": "gasto", "SubType Economic": "variable",
             "Tipo de transacción": "gasto", "Categoría de presupuesto": "consumo_desconocido",
             "budget_role": "revisar"},
            0.82, "builtin:yappy_gasto",
        ),
        (
            r"COMISION|CARGO ANUAL|CARGO MENSUAL",
            {"Economic Type": "comision", "SubType Economic": "recurrente",
             "Tipo de transacción": "comision", "Categoría de presupuesto": "servicios",
             "budget_role": "gasto_financiero"},
            0.90, "builtin:comision",
        ),
        (
            r"\bITBMS\b",
            {"Economic Type": "impuesto", "SubType Economic": "recurrente",
             "Tipo de transacción": "impuesto", "Categoría de presupuesto": "servicios",
             "budget_role": "gasto_financiero"},
            0.95, "builtin:itbms",
        ),
    ]

    # ── Detección de nombre ───────────────────────────────────────────────────

    def _contains_user_name(self, detail_upper: str, is_transfer: bool = False) -> bool:
        if not self.user_name_tokens:
            return False
        if self.user_name and self.user_name in detail_upper:
            return True
        hits = sum(1 for t in self.user_name_tokens if t in detail_upper)
        # En ACH/XPRESS el banco trunca apellidos → 1 token basta
        if is_transfer and hits >= 1:
            return True
        return hits >= min(2, len(self.user_name_tokens))

    def _is_transfer_type(self, row: dict) -> bool:
        detail = str(row.get("Detalle", "")).upper()
        tipo = str(row.get("Tipos de Movimientos", "")).upper()
        return any(
            kw in detail or kw in tipo
            for kw in ["ACH", "XPRESS", "TRANSFERENCIA", "TRANSFER", "TRF", "TRANSF"]
        )

    def _is_ach_xpress(self, row: dict) -> bool:
        detail = str(row.get("Detalle", "")).upper()
        tipo = str(row.get("Tipos de Movimientos", "")).upper()
        return any(kw in detail or kw in tipo for kw in ["ACH", "XPRESS"])

    # ── Motor de predicción ───────────────────────────────────────────────────

    def predict(self, row: dict) -> tuple[dict | None, float, str]:
        """
        Predice la categoría de una transacción.

        Args:
            row: dict con claves 'Detalle', 'Tipos de Movimientos', 'Depósito', 'Retiro'

        Returns:
            (categories_dict, confidence_float, method_str)
        """
        detail = str(row.get("Detalle", "")).strip().upper()
        tipo = str(row.get("Tipos de Movimientos", "")).upper()
        is_transfer = self._is_transfer_type(row)
        is_credit = "CREDIT" in tipo or "CRED" in tipo or row.get("Depósito", 0) > 0

        # 0. Nombre del usuario ────────────────────────────────────────────────
        if self.user_name and self._contains_user_name(detail, is_transfer):
            return self.OWN_TRANSFER, 1.0, "own_transfer:name_match"
        if self._is_ach_xpress(row) and self.user_name:
            return self.THIRD_TRANSFER, 0.85, "third_party_transfer:name_absent"

        # 1. Exact match personal ──────────────────────────────────────────────
        if detail in self.personal_rules["exact_matches"]:
            return self.personal_rules["exact_matches"][detail], 1.0, "exact:personal"

        # 2. Patrón regex personal ─────────────────────────────────────────────
        for name, pat in self.personal_rules["patterns"].items():
            if re.search(pat["regex"], detail):
                return pat["categories"], 0.92, f"pattern:personal:{name}"

        # 3. Exact match global ────────────────────────────────────────────────
        if detail in self.global_rules["exact_matches"]:
            return self.global_rules["exact_matches"][detail], 1.0, "exact:global"

        # 4. Patrón regex global ───────────────────────────────────────────────
        for name, pat in self.global_rules["patterns"].items():
            if re.search(pat["regex"], detail):
                return pat["categories"], 0.90, f"pattern:global:{name}"

        # 5. Patrones builtin ──────────────────────────────────────────────────
        for pattern, categories, conf, method_name in self.BUILTIN_PATTERNS:
            if re.search(pattern, detail):
                return categories, conf, method_name

        # 6. Fallback por tipo ─────────────────────────────────────────────────
        if "DEBIT" in tipo or row.get("Retiro", 0) > 0:
            return {
                "Economic Type": "gasto", "SubType Economic": "desconocido",
                "Tipo de transacción": "gasto",
                "Categoría de presupuesto": "consumo_desconocido",
                "budget_role": "revisar",
            }, 0.3, "fallback_debito"

        if is_credit:
            return {
                "Economic Type": "otros_ingresos", "SubType Economic": "desconocido",
                "Tipo de transacción": "ingreso",
                "Categoría de presupuesto": "otros",
                "budget_role": "revisar",
            }, 0.3, "fallback_credito"

        return None, 0.0, "unknown"

    # ── Aprendizaje ───────────────────────────────────────────────────────────

    GLOBAL_KEYWORDS: frozenset[str] = frozenset({
        "UBER", "NETFLIX", "SPOTIFY", "GOOGLE", "APPLE", "AMAZON", "DISNEY", "MICROSOFT",
        "STARBUCKS", "MCDONALDS", "DOMINOS", "CINNABON", "KFC", "SUBWAY",
        "SUPER", "XTRA", "METRO", "NOVEY", "FARMACIA", "CLINICA", "HOSPITAL",
        "FITLAB", "SMARTFIT", "GYMPASS",
        "TEXACO", "DELTA", "SHELL", "ESSO",
        "TIGO", "CABLE", "ENSA", "NATURGY", "IDAAN",
        "PLANILLA", "SALARIO", "COMISION", "ITBMS", "SEGURO", "PRESTAMO",
        "EPIKCREDITO", "PREMIERGENERAL", "COMPASS",
        "RAENCO", "RECARGA", "TRANSPORTE", "PEDIDOSYA", "PEDIDOS",
        "PANATICKETS", "ALBROOK", "MULTIPLAZA", "PACIFIC", "CENTER",
    })

    _AMBIGUOUS_WORDS: frozenset[str] = frozenset({
        "TRANSFERENCIA", "PAGO", "DE", "LA", "EL", "POR", "BG", "A", "AL",
        "BANCA", "BANCO", "MOVIL", "TRANSF", "INTL", "LOCAL", "DEBITO", "CREDITO",
        "CUENTAS", "ENTRE", "XPRESS", "GENERAL", "YAPPY", "PAGOYAPPY",
        "COMPRA", "COMMERCE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE", "ENERO",
        "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO",
        "SEPTIEMBRE", "TARJETA", "PARA", "MORA", "DEBITADO", "TRAN",
    })

    def learn(self, detail: str, categories: dict, weight: float = 1.0,
              force_personal: bool = False) -> None:
        """
        Aprende un nuevo ejemplo y persiste ambos KBs.

        Args:
            detail         : Texto del campo 'Detalle' (se normaliza a mayúsculas).
            categories     : Dict con las claves canónicas de categorización.
            weight         : Peso del ejemplo (default 1.0; usar 2.0 para correcciones explícitas).
            force_personal : Si True, guarda siempre en KB personal sin importar las keywords.
        """
        detail = detail.strip().upper()
        words = re.findall(r"\b[A-Z]{3,}\b", detail)
        if self.user_name_tokens:
            words = [w for w in words if w not in self.user_name_tokens]

        has_global_word = any(w in self.GLOBAL_KEYWORDS for w in words)
        target = self.global_rules if (has_global_word and not force_personal) else self.personal_rules
        target_label = "global" if target is self.global_rules else "personal"

        target["exact_matches"][detail] = categories

        for word in words:
            for campo, valor in categories.items():
                target["word_weights"][word][f"{campo}={valor}"] += weight

        self._create_pattern(detail, categories, target, target_label)
        target["corrections_count"] += 1

        self._save_kb(self.global_kb_path, self.global_rules, "global")
        self._save_kb(self.user_kb_path, self.personal_rules, "personal")

    def _create_pattern(self, detail: str, categories: dict, rules: dict, label: str) -> None:
        words = [
            w for w in re.findall(r"\b[A-Z]{4,}\b", detail)
            if w not in self._AMBIGUOUS_WORDS
        ]
        if self.user_name_tokens:
            words = [w for w in words if w not in self.user_name_tokens]

        for word in words[:3]:
            pat_name = f"{label}_{categories.get('Economic Type', 'x')}_{word}"
            if pat_name not in rules["patterns"]:
                rules["patterns"][pat_name] = {
                    "regex": r"\b" + re.escape(word) + r"\b",
                    "categories": categories,
                    "source": "learned",
                }

    def save_all(self) -> None:
        """Persiste ambos KBs sin requerir un nuevo ejemplo."""
        self._save_kb(self.global_kb_path, self.global_rules, "global")
        self._save_kb(self.user_kb_path, self.personal_rules, "personal")
