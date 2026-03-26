"""
FinancialClassifier — motor de categorización inteligente de transacciones.

Dos capas de aprendizaje:
  GLOBAL  (knowledge_base_global.json)      — marcas, comercios, términos universales
  PERSONAL (knowledge_base_user_{id}.json)  — patrones propios del usuario

Orden de predicción:
  0. Detección del nombre del usuario (transferencia propia vs tercero)
  1. Exact match personal (canonical_detail)
  1b. Exact match personal legacy/raw (compatibilidad)
  2. Patrón regex personal
  3. Exact match global (canonical_detail)
  3b. Exact match global legacy/raw (compatibilidad)
  4. Patrón regex global
  5. Patrones builtin
  6. Fallback por tipo
"""

from __future__ import annotations

import json
import logging
import re
from collections import defaultdict
from datetime import datetime, timezone as _tz
UTC = _tz.utc
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.detail_normalizer import (
    canonicalize_detail,
    is_ambiguous_key,
    normalize_categories,
    normalize_text,
)

logger = logging.getLogger(__name__)


def _global_kb_path() -> str:
    p = Path(settings.knowledge_bases_dir)
    p.mkdir(parents=True, exist_ok=True)
    return str(p / "knowledge_base_global.json")


def _user_kb_path(user_id: str) -> str:
    p = Path(settings.knowledge_bases_dir)
    p.mkdir(parents=True, exist_ok=True)
    return str(p / f"knowledge_base_user_{user_id}.json")


class FinancialClassifier:
    OWN_TRANSFER = {
        "Economic Type": "transferencia_propia",
        "Economic Type Detail": "transferencia_propia",
        "SubType Economic": "interno",
        "Categoría de presupuesto": "ahorro",
        "budget_role": "solo_balance",
    }

    THIRD_TRANSFER = {
        "Economic Type": "transferencia_tercero",
        "Economic Type Detail": "transferencia_tercero",
        "SubType Economic": "variable",
        "Categoría de presupuesto": "otros",
        "budget_role": "presupuestable",
    }

    BUILTIN_PATTERNS: list[tuple[str, dict[str, str], float, str]] = [
        (
            r"PLANILLA|SALARIO|NOMINA|PAYROLL",
            {
                "Economic Type": "ingreso",
                "Economic Type Detail": "salario",
                "SubType Economic": "recurrente",
                "Categoría de presupuesto": "otros",
                "budget_role": "presupuestable",
            },
            0.95,
            "builtin:salario",
        ),
        (
            r"CR DEVOLUCION|REV DB POS|REVERSO|AJUSTE CTE",
            {
                "Economic Type": "reembolso",
                "Economic Type Detail": "reembolso",
                "SubType Economic": "variable",
                "Categoría de presupuesto": "otros",
                "budget_role": "solo_balance",
            },
            0.93,
            "builtin:devolucion",
        ),
        (
            r"INTERES.*CUENTA|INTERES.*AHORROS",
            {
                "Economic Type": "ingreso",
                "Economic Type Detail": "otros_ingresos",
                "SubType Economic": "financiero",
                "Categoría de presupuesto": "otros",
                "budget_role": "presupuestable",
            },
            0.92,
            "builtin:interes_ahorro",
        ),
        (
            r"CREDITO TRANSF\. DE (CC|AH) A (CC|AH)",
            {
                "Economic Type": "transferencia_propia",
                "Economic Type Detail": "transferencia_propia",
                "SubType Economic": "interno",
                "Categoría de presupuesto": "ahorro",
                "budget_role": "solo_balance",
            },
            0.93,
            "builtin:transf_propia_cc",
        ),
        (
            r"ENTRE CUENTAS",
            {
                "Economic Type": "transferencia_propia",
                "Economic Type Detail": "transferencia_propia",
                "SubType Economic": "interno",
                "Categoría de presupuesto": "ahorro",
                "budget_role": "solo_balance",
            },
            0.93,
            "builtin:entre_cuentas",
        ),
        (
            r"^YAPPY BG DE ",
            {
                "Economic Type": "transferencia_tercero",
                "Economic Type Detail": "transferencia_tercero",
                "SubType Economic": "variable",
                "Categoría de presupuesto": "otros",
                "budget_role": "presupuestable",
            },
            0.90,
            "builtin:yappy_ingreso",
        ),
        (
            r"^PAGO YAPPY BG A |^YAPPY BG A ",
            {
                "Economic Type": "transferencia_tercero",
                "Economic Type Detail": "transferencia_tercero",
                "SubType Economic": "variable",
                "Categoría de presupuesto": "otros",
                "budget_role": "revisar",
            },
            0.82,
            "builtin:yappy_gasto",
        ),
        (
            r"COMISION|CARGO ANUAL|CARGO MENSUAL",
            {
                "Economic Type": "cargo_financiero",
                "Economic Type Detail": "comision",
                "SubType Economic": "recurrente",
                "Categoría de presupuesto": "servicios",
                "budget_role": "gasto_financiero",
            },
            0.90,
            "builtin:comision",
        ),
        (
            r"\bITBMS\b",
            {
                "Economic Type": "cargo_financiero",
                "Economic Type Detail": "impuesto",
                "SubType Economic": "recurrente",
                "Categoría de presupuesto": "servicios",
                "budget_role": "gasto_financiero",
            },
            0.95,
            "builtin:itbms",
        ),
        # Pago de deuda de tarjeta de crédito → cargo financiero (sí cuenta en totales)
        # Cubre dos formatos:
        #   Banistmo: "PAGO DE TARJETA DE CREDITO", "PAGO DEBITADO PARA TDC"
        #   BAC:      "PT: PAGO 5200-57**-****-3193"  (PAGO + número enmascarado)
        (
            r"PAGO DE TARJETA DE CREDITO|PAGO DEBITADO PARA TDC"
            r"|\bPAGO\b\s+\d{4}[-\s]*[\d*]{2,4}[*]{1,4}[-\s]*[*]{4}[-\s]*\d{4,5}",
            {
                "Economic Type": "cargo_financiero",
                "Economic Type Detail": "cargo_bancario",
                "SubType Economic": "recurrente",
                "Categoría de presupuesto": "servicios",
                "budget_role": "gasto_financiero",
            },
            0.95,
            "builtin:pago_tdc",
        ),
        # Banistmo: débito por transferencia entre cuenta corriente y tarjeta de crédito
        (
            r"DEBITO\s+TRANSF\b.*\bCC\b",
            {
                "Economic Type": "transferencia_propia",
                "Economic Type Detail": "transferencia_propia",
                "SubType Economic": "interno",
                "Categoría de presupuesto": "otros",
                "budget_role": "solo_balance",
            },
            0.95,
            "builtin:debito_transf_cc",
        ),
        # Retiro en cajero ATM → gasto operativo en efectivo
        (
            r"\bATM\b.*\bRET\b|\bRETIRO\b.*\bATM\b",
            {
                "Economic Type": "gasto",
                "Economic Type Detail": "gasto_variable",
                "SubType Economic": "operativo",
                "Categoría de presupuesto": "otros",
                "budget_role": "gasto_operativo",
            },
            0.85,
            "builtin:atm_retiro",
        ),
        # BAC: seguro de protección contra robo de tarjeta → cargo financiero
        (
            r"PROTECCION\s+ROBO|PROTECCION.*TARJETA",
            {
                "Economic Type": "cargo_financiero",
                "Economic Type Detail": "cargo_bancario",
                "SubType Economic": "recurrente",
                "Categoría de presupuesto": "servicios",
                "budget_role": "gasto_financiero",
            },
            0.90,
            "builtin:seguro_proteccion",
        ),
        # BAC: cargo de tarjeta (anual/mensual/titular) → cargo financiero
        (
            r"VALOR DE TARJETA|TARJETA TITULAR",
            {
                "Economic Type": "cargo_financiero",
                "Economic Type Detail": "cargo_bancario",
                "SubType Economic": "recurrente",
                "Categoría de presupuesto": "servicios",
                "budget_role": "gasto_financiero",
            },
            0.90,
            "builtin:cargo_tarjeta",
        ),
        # COMPASS: comisión BAC por dispositivo (cobro mensual recurrente) → cargo financiero
        # Formatos BAC: "CP: COMPASS BAC", "CP: COMPASS PACIFIC CENTER", "CP: COMPASS MULTIPLAZA"
        (
            r"\bCOMPASS\b",
            {
                "Economic Type": "cargo_financiero",
                "Economic Type Detail": "cargo_bancario",
                "SubType Economic": "recurrente",
                "Categoría de presupuesto": "servicios",
                "budget_role": "gasto_financiero",
            },
            0.90,
            "builtin:compass",
        ),
    ]

    GLOBAL_KEYWORDS: frozenset[str] = frozenset(
        {
            "UBER",
            "NETFLIX",
            "SPOTIFY",
            "GOOGLE",
            "GOOGLE GRI",
            "GRINDR",
            "APPLE",
            "AMAZON",
            "DISNEY",
            "MICROSOFT",
            "STARBUCKS",
            "MCDONALDS",
            "DOMINOS",
            "CINNABON",
            "KFC",
            "SUBWAY",
            "SUPER",
            "XTRA",
            "SUPERMERCADO",
            "METRO",
            "NOVEY",
            "FARMACIA",
            "CLINICA",
            "HOSPITAL",
            "FITLAB",
            "SMARTFIT",
            "GYMPASS",
            "TEXACO",
            "DELTA",
            "SHELL",
            "ESSO",
            "TIGO",
            "CABLE",
            "ENSA",
            "NATURGY",
            "IDAAN",
            "PLANILLA",
            "SALARIO",
            "COMISION",
            "ITBMS",
            "SEGURO",
            "PRESTAMO",
            "EPIKCREDITO",
            "PREMIERGENERAL",
            "COMPASS",
            "RAENCO",
            "RECARGA",
            "TRANSPORTE",
            "PEDIDOSYA",
            "PEDIDOS",
            "PANATICKETS",
            "ALBROOK",
            "MULTIPLAZA",
            "PACIFIC",
            "CENTER",
        }
    )

    _AMBIGUOUS_WORDS: frozenset[str] = frozenset(
        {
            "TRANSFERENCIA",
            "PAGO",
            "DE",
            "LA",
            "EL",
            "POR",
            "BG",
            "A",
            "AL",
            "BANCA",
            "BANCO",
            "MOVIL",
            "TRANSF",
            "INTL",
            "LOCAL",
            "DEBITO",
            "CREDITO",
            "CUENTAS",
            "ENTRE",
            "XPRESS",
            "GENERAL",
            "YAPPY",
            "PAGOYAPPY",
            "COMPRA",
            "COMMERCE",
            "OCTUBRE",
            "NOVIEMBRE",
            "DICIEMBRE",
            "ENERO",
            "FEBRERO",
            "MARZO",
            "ABRIL",
            "MAYO",
            "JUNIO",
            "JULIO",
            "AGOSTO",
            "SEPTIEMBRE",
            "TARJETA",
            "PARA",
            "MORA",
            "DEBITADO",
            "TRAN",
        }
    )

    def __init__(self, user_id: str, user_name: str | None = None):
        self.user_id = user_id
        self.global_kb_path = _global_kb_path()
        self.user_kb_path = _user_kb_path(user_id)

        self.user_name = normalize_text(user_name) if user_name else None
        self.user_name_tokens = (
            [t for t in self.user_name.split() if len(t) >= 3]
            if self.user_name
            else []
        )

        self.global_rules: dict[str, Any] = self._empty_rules()
        self.personal_rules: dict[str, Any] = self._empty_rules()

        self._load_kb(self.global_kb_path, self.global_rules, "global")
        self._load_kb(self.user_kb_path, self.personal_rules, "personal")

    @staticmethod
    def _empty_rules() -> dict[str, Any]:
        return {
            "exact_matches": {},
            "patterns": {},
            "word_weights": defaultdict(lambda: defaultdict(float)),
            "corrections_count": 0,
        }

    def _load_kb(self, path: str, rules: dict[str, Any], label: str) -> None:
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

    def _save_kb(self, path: str, rules: dict[str, Any], label: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)

        data = {
            "last_updated": datetime.now(UTC).isoformat(),
            "exact_matches": rules["exact_matches"],
            "patterns": rules["patterns"],
            "word_weights": {k: dict(v) for k, v in rules["word_weights"].items()},
            "corrections_count": rules["corrections_count"],
        }

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        logger.info(
            "KB %s guardado — %d correcciones (%s)",
            label,
            rules["corrections_count"],
            path,
        )

    def _contains_user_name(self, detail_upper: str, is_transfer: bool = False) -> bool:
        if not self.user_name_tokens:
            return False

        if self.user_name and self.user_name in detail_upper:
            return True

        hits = sum(1 for t in self.user_name_tokens if t in detail_upper)

        if is_transfer and hits >= 1:
            return True

        return hits >= min(2, len(self.user_name_tokens))

    def _is_transfer_type(self, row: dict[str, Any]) -> bool:
        detail = normalize_text(str(row.get("Detalle", "")))
        tipo = normalize_text(str(row.get("Tipos de Movimientos", "")))

        return any(
            kw in detail or kw in tipo
            for kw in ["ACH", "XPRESS", "TRANSFERENCIA", "TRANSFER", "TRF", "TRANSF"]
        )

    def _is_ach_xpress(self, row: dict[str, Any]) -> bool:
        detail = normalize_text(str(row.get("Detalle", "")))
        tipo = normalize_text(str(row.get("Tipos de Movimientos", "")))

        return any(kw in detail or kw in tipo for kw in ["ACH", "XPRESS"])

    def predict(self, row: dict[str, Any]) -> tuple[dict[str, Any] | None, float, str]:
        raw_detail = str(row.get("Detalle", ""))
        detail = normalize_text(raw_detail)
        canonical_detail = canonicalize_detail(raw_detail)
        tipo = normalize_text(str(row.get("Tipos de Movimientos", "")))

        is_transfer = self._is_transfer_type(row)
        is_credit = "CREDIT" in tipo or "CRED" in tipo or row.get("Depósito", 0) > 0

        # 0. Nombre del usuario
        if self.user_name and self._contains_user_name(detail, is_transfer):
            return self.OWN_TRANSFER, 1.0, "own_transfer:name_match"

        if self._is_ach_xpress(row) and self.user_name:
            return self.THIRD_TRANSFER, 0.85, "third_party_transfer:name_absent"

        # 1. Exact match personal por canonical_detail
        if canonical_detail in self.personal_rules["exact_matches"]:
            return (
                self.personal_rules["exact_matches"][canonical_detail],
                1.0,
                "exact:personal:canonical",
            )

        # 1b. Compatibilidad legacy
        if detail in self.personal_rules["exact_matches"]:
            return (
                self.personal_rules["exact_matches"][detail],
                0.98,
                "exact:personal:raw_compat",
            )

        # 2. Pattern personal
        for name, pat in self.personal_rules["patterns"].items():
            regex = pat.get("regex", "")
            if regex and re.search(regex, detail):
                return pat["categories"], 0.92, f"pattern:personal:{name}"

        # 3. Exact match global por canonical_detail
        if canonical_detail in self.global_rules["exact_matches"]:
            return (
                self.global_rules["exact_matches"][canonical_detail],
                1.0,
                "exact:global:canonical",
            )

        # 3b. Compatibilidad legacy
        if detail in self.global_rules["exact_matches"]:
            return (
                self.global_rules["exact_matches"][detail],
                0.98,
                "exact:global:raw_compat",
            )

        # 4. Pattern global
        for name, pat in self.global_rules["patterns"].items():
            regex = pat.get("regex", "")
            if regex and re.search(regex, detail):
                return pat["categories"], 0.90, f"pattern:global:{name}"

        # 5. Builtins
        for pattern, categories, conf, method_name in self.BUILTIN_PATTERNS:
            if re.search(pattern, detail):
                return normalize_categories(categories), conf, method_name

        # 6. Fallback
        if "DEBIT" in tipo or row.get("Retiro", 0) > 0:
            return (
                {
                    "Economic Type": "gasto",
                    "Economic Type Detail": "gasto_variable",
                    "SubType Economic": "desconocido",
                    "Categoría de presupuesto": "consumo_desconocido",
                    "budget_role": "revisar",
                },
                0.3,
                "fallback_debito",
            )

        if is_credit:
            return (
                {
                    "Economic Type": "ingreso",
                    "Economic Type Detail": "otros_ingresos",
                    "SubType Economic": "desconocido",
                    "Categoría de presupuesto": "otros",
                    "budget_role": "revisar",
                },
                0.3,
                "fallback_credito",
            )

        return None, 0.0, "unknown"

    def learn(
        self,
        detail: str,
        categories: dict[str, Any],
        weight: float = 1.0,
        force_personal: bool = False,
    ) -> str:
        """Aprende el ejemplo y retorna la clave canónica que se guardó en el KB."""
        raw_detail = detail or ""
        normalized_detail = normalize_text(raw_detail)
        canonical_detail = canonicalize_detail(raw_detail)
        categories = normalize_categories(categories)

        words = re.findall(r"\b[A-Z]{3,}\b", normalized_detail)
        if self.user_name_tokens:
            words = [w for w in words if w not in self.user_name_tokens]

        # Regla de routing:
        #   Global  → cualquier comercio, servicio o transacción regular.
        #             Default para todo lo que no sea transferencia.
        #   Personal → tres casos:
        #     1. budget_role="solo_balance": transferencia entre cuentas propias
        #        del mismo usuario (ENTRE CUENTAS, ACH XPRESS a sí mismo).
        #     2. Economic Type="transferencia_tercero": pago a una persona
        #        específica (YAPPY A CARLOS, ACH XPRESS A MARIA). No tiene
        #        sentido compartir en global porque el nombre es personal.
        #     3. force_personal=True: override explícito del usuario.
        economic_type       = (categories.get("Economic Type") or "").lower().strip()
        is_own_transfer     = categories.get("budget_role") == "solo_balance"
        # transferencia_tercero ahora es valor canónico del campo general Economic Type
        is_third_party_xfer = economic_type == "transferencia_tercero"
        target = (
            self.personal_rules
            if (force_personal or is_own_transfer or is_third_party_xfer)
            else self.global_rules
        )
        target_label = "global" if target is self.global_rules else "personal"

        # Guardar SOLO la clave canónica
        target["exact_matches"][canonical_detail] = categories

        for word in words:
            for campo, valor in categories.items():
                target["word_weights"][word][f"{campo}={valor}"] += weight

        self._create_pattern(canonical_detail, categories, target, target_label)
        target["corrections_count"] += 1

        self._save_kb(self.global_kb_path, self.global_rules, "global")
        self._save_kb(self.user_kb_path, self.personal_rules, "personal")

        return canonical_detail

    def _create_pattern(
        self,
        detail: str,
        categories: dict[str, Any],
        rules: dict[str, Any],
        label: str,
    ) -> None:
        canonical = canonicalize_detail(detail)

        if is_ambiguous_key(canonical):
            return

        tokens = [tok for tok in canonical.split() if tok and tok not in self._AMBIGUOUS_WORDS]

        if self.user_name_tokens:
            tokens = [tok for tok in tokens if tok not in self.user_name_tokens]

        if not tokens:
            return

        regex = r"\b" + r"\s+".join(re.escape(tok) for tok in tokens) + r"\b"
        pat_name = f"{label}_{categories.get('Economic Type', 'x')}_{'_'.join(tokens)}"

        existing = rules["patterns"].get(pat_name)
        if existing and existing.get("regex") == regex and existing.get("categories") == categories:
            return

        # Evitar duplicados semánticos con otro nombre
        for existing_name, existing_pattern in rules["patterns"].items():
            if (
                existing_pattern.get("regex") == regex
                and existing_pattern.get("categories") == categories
            ):
                logger.debug(
                    "Pattern duplicado evitado: %s equivale a %s",
                    pat_name,
                    existing_name,
                )
                return

        rules["patterns"][pat_name] = {
            "regex": regex,
            "categories": categories,
            "source": "learned",
        }

    def save_all(self) -> None:
        self._save_kb(self.global_kb_path, self.global_rules, "global")
        self._save_kb(self.user_kb_path, self.personal_rules, "personal")

    # ── KB management ─────────────────────────────────────────────────────────

    def list_personal_kb(self) -> dict[str, Any]:
        """
        Retorna el contenido del KB personal para inspección via API.
        Incluye todas las entradas exact_matches, patrones y metadatos.
        """
        return {
            "exact_matches": dict(self.personal_rules["exact_matches"]),
            "patterns": dict(self.personal_rules["patterns"]),
            "corrections_count": self.personal_rules["corrections_count"],
        }

    def list_global_kb_summary(self) -> dict[str, Any]:
        """Retorna solo el resumen del KB global (read-only para el usuario)."""
        return {
            "exact_matches_count": len(self.global_rules["exact_matches"]),
            "patterns_count": len(self.global_rules["patterns"]),
            "corrections_count": self.global_rules["corrections_count"],
        }

    def list_global_kb(self) -> dict[str, Any]:
        """Retorna el contenido completo del KB global para inspección."""
        return {
            "exact_matches": dict(self.global_rules["exact_matches"]),
            "patterns": dict(self.global_rules["patterns"]),
            "corrections_count": self.global_rules["corrections_count"],
        }

    def delete_personal_entry(self, key: str) -> int:
        """
        Elimina una entrada del KB personal por clave canónica.
        Borra de exact_matches y los patrones cuyo nombre fue generado para esa clave.

        Retorna el número de patrones eliminados (0 si la entrada no existía en
        exact_matches, aunque elimina patrones huérfanos si los hubiera).
        Lanza KeyError si la clave no existe en exact_matches.
        """
        if key not in self.personal_rules["exact_matches"]:
            raise KeyError(key)

        del self.personal_rules["exact_matches"][key]

        # Borrar patrones asociados: los generados por _create_pattern usan
        # el nombre "personal_{economic_type}_{token1_token2...}" donde los
        # tokens provienen de la clave canónica (espacios → _).
        key_suffix = "_".join(key.split())
        patterns_to_remove = [
            pname for pname in self.personal_rules["patterns"]
            if pname.endswith(f"_{key_suffix}") or f"_{key_suffix}_" in pname
        ]
        for pname in patterns_to_remove:
            del self.personal_rules["patterns"][pname]

        self._save_kb(self.user_kb_path, self.personal_rules, "personal")
        return len(patterns_to_remove)