from __future__ import annotations

import argparse
import copy
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, UTC
from pathlib import Path
from typing import Any


# =========================================================
# CONFIG
# =========================================================

# Si una clave canonizada cae aquí, NO se usa como exact_match canónico
# y tampoco se autogenera pattern.
AMBIGUOUS_CANONICAL_KEYS = {
    "SUPER",
    "METRO",
    "CLINICA",
    "FARMACIA",
    "RESTAURANTE",
    "PAGO",
    "COMPRA",
    "LOCAL",
    "ONLINE",
    "ECOMMERCE",
    "COMERCIO",
    "MARKET",
    "STORE",
    "SHOP",
    "SERVICIO",
}

# Alias específicos primero. No cambies el orden a lo loco.
# Si pones GOOGLE genérico antes, rompes GOOGLE GRI.
SPECIFIC_MERCHANT_RULES: list[tuple[re.Pattern[str], str]] = [
    # Casos de negocio explícitos
    (re.compile(r"\bGOOGLE\s+GRI\b", re.IGNORECASE), "GOOGLE GRI"),
    (re.compile(r"\bXTRA\s+MARKE\b", re.IGNORECASE), "SUPERMERCADO XTRA"),
    (re.compile(r"\bSUPER\s+XTRA\b", re.IGNORECASE), "SUPERMERCADO XTRA"),
    (re.compile(r"\bMCD\s+CTE[- ]XTRA\s+MARKE\b", re.IGNORECASE), "SUPERMERCADO XTRA"),

    # Variantes específicas comunes
    (re.compile(r"\bDISNEY\s*PLU\b", re.IGNORECASE), "DISNEY PLUS"),
    (re.compile(r"\bGOOGLE\s+ONE\b", re.IGNORECASE), "GOOGLE ONE"),
    (re.compile(r"\bGOOGLE\s+CRU\b", re.IGNORECASE), "GOOGLE"),
    (re.compile(r"\bGOOGLE\s+MOB\b", re.IGNORECASE), "GOOGLE"),
    (re.compile(r"\bAPPLE\s+COM\b", re.IGNORECASE), "APPLE"),
    (re.compile(r"\bUBER\s+R\b", re.IGNORECASE), "UBER"),
]

# Alias genéricos después
GENERIC_MERCHANT_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bSPOTIFY\b", re.IGNORECASE), "SPOTIFY"),
    (re.compile(r"\bNETFLIX\b", re.IGNORECASE), "NETFLIX"),
    (re.compile(r"\bDISNEY\b", re.IGNORECASE), "DISNEY PLUS"),
    (re.compile(r"\bAPPLE\b", re.IGNORECASE), "APPLE"),
    (re.compile(r"\bMICROSOFT\b", re.IGNORECASE), "MICROSOFT"),
    (re.compile(r"\bGOOGLE\b", re.IGNORECASE), "GOOGLE"),
    (re.compile(r"\bUBER\b", re.IGNORECASE), "UBER"),
    (re.compile(r"\bTIGO\b", re.IGNORECASE), "TIGO"),
    (re.compile(r"\bPEDIDOSYA\b", re.IGNORECASE), "PEDIDOSYA"),
    (re.compile(r"\bKFC\b", re.IGNORECASE), "KFC"),
    (re.compile(r"\bSTARBUCKS\b", re.IGNORECASE), "STARBUCKS"),
    (re.compile(r"\bDOMINOS?\b", re.IGNORECASE), "DOMINOS"),
    (re.compile(r"\bSUPER\s+99\b", re.IGNORECASE), "SUPERMERCADO 99"),
    (re.compile(r"\bXTRA\b", re.IGNORECASE), "SUPERMERCADO XTRA"),
    (re.compile(r"\bGRINDR\b", re.IGNORECASE), "GRINDR"),
]

NOISE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bDB\b", re.IGNORECASE),
    re.compile(r"\bCR\b", re.IGNORECASE),
    re.compile(r"\bREV\b", re.IGNORECASE),
    re.compile(r"\bPOS\b", re.IGNORECASE),
    re.compile(r"\bCOMPRA\b", re.IGNORECASE),
    re.compile(r"\bLOCAL\b", re.IGNORECASE),
    re.compile(r"\bINTL\b", re.IGNORECASE),
    re.compile(r"\bE[- ]?COMMERCE\b", re.IGNORECASE),
    re.compile(r"\bMCD\b", re.IGNORECASE),
    re.compile(r"\bCTE\b", re.IGNORECASE),
    re.compile(r"\bDLC\b", re.IGNORECASE),
    re.compile(r"\bAPP\b", re.IGNORECASE),
    re.compile(r"\bAJUSTE\b", re.IGNORECASE),
]

VARIABLE_SUFFIX_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\s*-\s*\d{3,}\s*-\s*\d{3,}\b"),
    re.compile(r"\s+\d{6,}\b"),
    re.compile(r"\(\d{4,}\)"),
    re.compile(r"\b\d{8,}\b"),
    re.compile(r"\bP\d+\b", re.IGNORECASE),
    re.compile(r"\b[0-9]{2}\s+[0-9]{10,}\b"),
]

COUNTRY_TAG_PATTERN = re.compile(
    r"\b(?:USA|FRA|IRL|CRI|COL|PAN|PTY)\b", re.IGNORECASE
)

MULTISPACE_PATTERN = re.compile(r"\s+")
NON_ALNUM_KEEP_SPACE_PATTERN = re.compile(r"[^A-Z0-9 ]+")

# Canonización estricta de categorías
STRICT_VALUE_MAPS = {
    "Economic Type": {
        "gasto": "gasto",
        "ingreso": "ingreso",
        "transferencia": "transferencia",
        "ahorro": "ahorro",
        "comision": "gasto",
        "impuesto": "gasto",
    },
    "SubType Economic": {
        "operativo": "operativo",
        "recurrente": "recurrente",
        "extraordinario": "extraordinario",
        "variable": "variable",
        "fijo": "fijo",
        "salario": "salario",
        "comision": "comision",
        "impuesto": "impuesto",
        "otros": "otros",
    },
    "Tipo de transacción": {
        "gasto": "gasto",
        "ingreso": "ingreso",
        "transferencia": "transferencia",
        "ahorro": "ahorro",
    },
    "Categoría de presupuesto": {
        "vivienda": "vivienda",
        "alimentacion": "alimentacion",
        "alimentación": "alimentacion",
        "entretenimiento": "entretenimiento",
        "transporte": "transporte",
        "gasolina": "gasolina",
        "salud": "salud",
        "supermercado": "supermercado",
        "restaurantes": "restaurantes",
        "servicios": "servicios",
        "otros": "otros",
        "comision": "comision",
        "impuesto": "impuesto",
        "ahorro": "ahorro",
        "educacion": "educacion",
        "educación": "educacion",
        "suscripciones": "suscripciones",
        "tecnologia": "tecnologia",
        "tecnología": "tecnologia",
    },
    "budget_role": {
        "presupuestable": "presupuestable",
        "solo_balance": "solo_balance",
        "no_presupuestable": "no_presupuestable",
        "ahorro": "ahorro",
    },
}

CATEGORY_FIELDS = [
    "Economic Type",
    "SubType Economic",
    "Tipo de transacción",
    "Categoría de presupuesto",
    "budget_role",
]


# =========================================================
# TEXT HELPERS
# =========================================================

def strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_text(text: str) -> str:
    text = strip_accents(text or "")
    text = text.upper().strip()
    text = MULTISPACE_PATTERN.sub(" ", text)
    return text


def normalize_value(text: Any) -> str:
    return normalize_text(str(text)).lower()


def strip_variable_suffixes(text: str) -> str:
    out = text
    for pattern in VARIABLE_SUFFIX_PATTERNS:
        out = pattern.sub(" ", out)
    out = MULTISPACE_PATTERN.sub(" ", out).strip(" -")
    return out


def remove_noise_tokens(text: str) -> str:
    out = text
    out = COUNTRY_TAG_PATTERN.sub(" ", out)
    for pattern in NOISE_PATTERNS:
        out = pattern.sub(" ", out)
    out = NON_ALNUM_KEEP_SPACE_PATTERN.sub(" ", out)
    out = MULTISPACE_PATTERN.sub(" ", out).strip()
    return out


# =========================================================
# CATEGORY NORMALIZATION
# =========================================================

def normalize_categories(categories: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}

    for field in CATEGORY_FIELDS:
        raw_value = categories.get(field, "")
        value = normalize_value(raw_value)

        allowed = STRICT_VALUE_MAPS.get(field, {})
        result[field] = allowed.get(value, value)

    return result


# =========================================================
# MERCHANT CANONICALIZATION
# =========================================================

def detect_canonical_merchant(detail: str) -> str:
    # 1) específicos
    for pattern, merchant in SPECIFIC_MERCHANT_RULES:
        if pattern.search(detail):
            return merchant

    # 2) genéricos
    for pattern, merchant in GENERIC_MERCHANT_RULES:
        if pattern.search(detail):
            return merchant

    return ""


def canonicalize_detail(raw_detail: str) -> str:
    detail = normalize_text(raw_detail)
    detail = strip_variable_suffixes(detail)

    merchant = detect_canonical_merchant(detail)
    if merchant:
        return merchant

    cleaned = remove_noise_tokens(detail)
    tokens = cleaned.split()

    if len(tokens) > 5:
        cleaned = " ".join(tokens[:5])

    return cleaned or detail


def is_ambiguous_key(canonical_key: str) -> bool:
    key = normalize_text(canonical_key)
    if not key:
        return True
    if key in AMBIGUOUS_CANONICAL_KEYS:
        return True
    if len(key) < 4:
        return True
    if key.isdigit():
        return True
    return False


# =========================================================
# PATTERN DEDUP
# =========================================================

def build_pattern_name(categories: dict[str, Any], canonical_detail: str) -> str:
    econ = categories.get("Economic Type", "unknown").lower()
    merchant = canonical_detail.lower().replace(" ", "_")
    return f"{econ}_{merchant}"


def build_regex_for_canonical(canonical_detail: str) -> str:
    tokens = [re.escape(tok) for tok in canonical_detail.split() if tok]
    if not tokens:
        return r"$^"
    return r"\b" + r"\s+".join(tokens) + r"\b"


def canonical_pattern_signature(regex: str, categories: dict[str, Any]) -> tuple[str, str]:
    normalized_regex = normalize_text(regex)
    normalized_categories = json.dumps(
        normalize_categories(categories),
        sort_keys=True,
        ensure_ascii=False,
    )
    return normalized_regex, normalized_categories


def dedupe_patterns(patterns: dict[str, Any]) -> tuple[dict[str, Any], dict[str, list[str]]]:
    deduped: dict[str, Any] = {}
    collisions: dict[str, list[str]] = defaultdict(list)
    seen: dict[tuple[str, str], str] = {}

    for pattern_name in sorted(patterns.keys()):
        entry = patterns[pattern_name]
        regex = entry.get("regex", "")
        categories = normalize_categories(entry.get("categories", {}))

        signature = canonical_pattern_signature(regex, categories)

        if signature in seen:
            kept_name = seen[signature]
            collisions[kept_name].append(pattern_name)
            continue

        deduped[pattern_name] = {
            "regex": regex,
            "categories": categories,
        }
        seen[signature] = pattern_name

    return deduped, collisions


# =========================================================
# MERGE STRATEGY
# =========================================================

def merge_categories(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    if not existing:
        return incoming

    # Conservador: si ya existe, lo mantenemos.
    # Si luego quieres voto por frecuencia, esto hay que cambiarlo.
    return existing


# =========================================================
# MAIN COMPACTION
# =========================================================

def compact_kb(kb: dict[str, Any], create_patterns: bool = True) -> dict[str, Any]:
    exact_matches = kb.get("exact_matches", {})
    patterns = kb.get("patterns", {})

    canonical_exact_matches: dict[str, dict[str, Any]] = {}
    grouped_raw_keys: dict[str, list[str]] = defaultdict(list)
    skipped_ambiguous_keys: dict[str, list[str]] = defaultdict(list)

    # Exact matches
    for raw_key, raw_categories in exact_matches.items():
        canonical_key = canonicalize_detail(raw_key)
        categories = normalize_categories(raw_categories)

        if is_ambiguous_key(canonical_key):
            skipped_ambiguous_keys[canonical_key].append(raw_key)
            continue

        grouped_raw_keys[canonical_key].append(raw_key)

        existing = canonical_exact_matches.get(canonical_key)
        canonical_exact_matches[canonical_key] = merge_categories(existing or {}, categories)

    # Deduplicar patterns heredados
    normalized_existing_patterns = {}
    for name, entry in patterns.items():
        normalized_existing_patterns[name] = {
            "regex": entry.get("regex", ""),
            "categories": normalize_categories(entry.get("categories", {})),
        }

    deduped_patterns, pattern_collisions = dedupe_patterns(normalized_existing_patterns)

    # Autogenerar patterns a partir de exact matches no ambiguos
    if create_patterns:
        for canonical_key, categories in canonical_exact_matches.items():
            if is_ambiguous_key(canonical_key):
                continue

            pattern_name = build_pattern_name(categories, canonical_key)
            regex = build_regex_for_canonical(canonical_key)

            deduped_patterns.setdefault(
                pattern_name,
                {
                    "regex": regex,
                    "categories": categories,
                },
            )

    # Segunda deduplicación por si setdefault dejó equivalentes duplicados con otro nombre heredado
    final_patterns, second_pattern_collisions = dedupe_patterns(deduped_patterns)

    all_pattern_collisions: dict[str, list[str]] = defaultdict(list)
    for k, v in pattern_collisions.items():
        all_pattern_collisions[k].extend(v)
    for k, v in second_pattern_collisions.items():
        all_pattern_collisions[k].extend(v)

    compacted = {
        "last_updated": datetime.now(UTC).isoformat(),
        "exact_matches": dict(sorted(canonical_exact_matches.items())),
        "patterns": dict(sorted(final_patterns.items())),
        "_meta": {
            "raw_exact_matches_before": len(exact_matches),
            "raw_exact_matches_after": len(canonical_exact_matches),
            "raw_patterns_before": len(patterns),
            "raw_patterns_after": len(final_patterns),
            "group_examples": {
                key: values[:10]
                for key, values in sorted(
                    grouped_raw_keys.items(),
                    key=lambda item: (-len(item[1]), item[0])
                )[:50]
            },
            "skipped_ambiguous_keys": {
                key: values[:10]
                for key, values in sorted(
                    skipped_ambiguous_keys.items(),
                    key=lambda item: (-len(item[1]), item[0])
                )
            },
            "pattern_collisions": {
                key: sorted(set(values))
                for key, values in sorted(all_pattern_collisions.items())
            },
        },
    }
    return compacted


# =========================================================
# CLI
# =========================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compacta y canonicaliza knowledge_base_global.json (v2)"
    )
    parser.add_argument("--input", required=True, help="Ruta al KB original")
    parser.add_argument("--output", required=True, help="Ruta al KB compactado")
    parser.add_argument("--backup", default="", help="Ruta opcional para backup")
    parser.add_argument(
        "--no-patterns",
        action="store_true",
        help="No autogenerar patterns a partir de exact_matches canonizados",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    with input_path.open("r", encoding="utf-8") as f:
        kb = json.load(f)

    if args.backup:
        backup_path = Path(args.backup)
        backup_path.write_text(
            json.dumps(kb, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    compacted = compact_kb(kb, create_patterns=not args.no_patterns)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(compacted, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    before_exact = len(kb.get("exact_matches", {}))
    after_exact = len(compacted.get("exact_matches", {}))
    before_patterns = len(kb.get("patterns", {}))
    after_patterns = len(compacted.get("patterns", {}))

    print(f"[OK] exact_matches antes: {before_exact}")
    print(f"[OK] exact_matches después: {after_exact}")
    print(f"[OK] patterns antes: {before_patterns}")
    print(f"[OK] patterns después: {after_patterns}")
    print(f"[OK] salida: {output_path}")


if __name__ == "__main__":
    main()