from __future__ import annotations

import argparse
import copy
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


CANONICAL_MERCHANT_RULES: list[tuple[re.Pattern[str], str]] = [
    # Reglas explícitas de negocio tuyas
    (re.compile(r"\bGOOGLE\s+GRI\b", re.IGNORECASE), "GRINDR"),
    (re.compile(r"\bXTRA\s+MARKE\b", re.IGNORECASE), "SUPERMERCADO XTRA"),

    # Comercios frecuentes
    (re.compile(r"\bSPOTIFY\b", re.IGNORECASE), "SPOTIFY"),
    (re.compile(r"\bNETFLIX\b", re.IGNORECASE), "NETFLIX"),
    (re.compile(r"\bDISNEY\s*PLU\b", re.IGNORECASE), "DISNEY PLUS"),
    (re.compile(r"\bAPPLE\s+COM\b", re.IGNORECASE), "APPLE"),
    (re.compile(r"\bMICROSOFT\b", re.IGNORECASE), "MICROSOFT"),
    (re.compile(r"\bGOOGLE\s+CRU\b", re.IGNORECASE), "GOOGLE"),
    (re.compile(r"\bGOOGLE\s+MOB\b", re.IGNORECASE), "GOOGLE"),
    (re.compile(r"\bGOOGLE\s+ONE\b", re.IGNORECASE), "GOOGLE"),
    (re.compile(r"\bGOOGLE\s+[A-Z]{2}\b", re.IGNORECASE), "GOOGLE"),
    (re.compile(r"\bUBER\s+R\b", re.IGNORECASE), "UBER"),
    (re.compile(r"\bTIGO\b", re.IGNORECASE), "TIGO"),
    (re.compile(r"\bPEDIDOSYA\b", re.IGNORECASE), "PEDIDOSYA"),
    (re.compile(r"\bKFC\b", re.IGNORECASE), "KFC"),
    (re.compile(r"\bSTARBUCKS\b", re.IGNORECASE), "STARBUCKS"),
    (re.compile(r"\bDOMINOS?\b", re.IGNORECASE), "DOMINOS"),
    (re.compile(r"\bSUPER\s+99\b", re.IGNORECASE), "SUPERMERCADO 99"),
    (re.compile(r"\bSUPER\s+XTRA\b", re.IGNORECASE), "SUPERMERCADO XTRA"),
    (re.compile(r"\bXTRA\b", re.IGNORECASE), "SUPERMERCADO XTRA"),
]

# Tokens bancarios/operativos que no agregan valor semántico al merchant
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
    re.compile(r"\bTRANSISTMICA\b", re.IGNORECASE),  # ojo: quítalo si para ti sí es relevante
]

# Sufijos variables transaccionales
VARIABLE_SUFFIX_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\s*-\s*\d{3,}\s*-\s*\d{3,}\b"),   # -5925-15858680
    re.compile(r"\s+\d{6,}\b"),                   # números largos al final
    re.compile(r"\(\d{4,}\)"),                    # (1087824)
    re.compile(r"\b\d{8,}\b"),                    # tokens numéricos largos
    re.compile(r"\bP\d+\b", re.IGNORECASE),       # P3 / P4
    re.compile(r"\b[0-9]{2}\s+[0-9]{10,}\b"),     # 08 0916000525
]

COUNTRY_TAG_PATTERN = re.compile(
    r"\b(?:USA|FRA|IRL|CRI|COL|PAN|PTY)\b", re.IGNORECASE
)

MULTISPACE_PATTERN = re.compile(r"\s+")
NON_ALNUM_KEEP_SPACE_PATTERN = re.compile(r"[^A-Z0-9 ]+")


def strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_text(text: str) -> str:
    text = strip_accents(text or "")
    text = text.upper().strip()
    text = MULTISPACE_PATTERN.sub(" ", text)
    return text


def normalize_categories(categories: dict[str, Any]) -> dict[str, Any]:
    c = copy.deepcopy(categories)

    mapping = {
        "Economic Type": normalize_text(str(c.get("Economic Type", ""))).lower(),
        "SubType Economic": normalize_text(str(c.get("SubType Economic", ""))).lower(),
        "Tipo de transacción": normalize_text(str(c.get("Tipo de transacción", ""))).lower(),
        "Categoría de presupuesto": normalize_text(str(c.get("Categoría de presupuesto", ""))).lower(),
        "budget_role": normalize_text(str(c.get("budget_role", ""))).lower(),
    }

    # Canonización simple de categorías/tipos que vi inconsistentes
    synonyms = {
        "comision": "comision",
        "impuesto": "impuesto",
        "gasto": "gasto",
        "ingreso": "ingreso",
        "salario": "salario",
        "otros": "otros",
        "alimentacion": "alimentacion",
        "gasolina": "transporte",
    }

    for key, value in mapping.items():
        mapping[key] = synonyms.get(value, value)

    return mapping


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


def detect_canonical_merchant(detail: str) -> str:
    for pattern, merchant in CANONICAL_MERCHANT_RULES:
        if pattern.search(detail):
            return merchant
    return ""


def canonicalize_detail(raw_detail: str) -> str:
    """
    Devuelve una clave canónica orientada a merchant.
    No intenta preservar todo el descriptor bancario, sino quedarnos
    con la parte reusable.
    """
    detail = normalize_text(raw_detail)
    detail = strip_variable_suffixes(detail)

    # Primero intentamos reglas explícitas de merchant
    merchant = detect_canonical_merchant(detail)
    if merchant:
        return merchant

    # Si no detecta merchant explícito, limpiamos ruido y conservamos algo razonable
    cleaned = remove_noise_tokens(detail)

    # Si queda demasiado largo, recórtalo a los primeros tokens informativos
    tokens = cleaned.split()
    if len(tokens) > 5:
        cleaned = " ".join(tokens[:5])

    return cleaned or detail


def merge_categories(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    """
    Estrategia simple: si difieren, prevalece el existente.
    Si quieres algo más sofisticado, mete voto por frecuencia.
    """
    if not existing:
        return incoming
    return existing


def build_pattern_name(categories: dict[str, Any], canonical_detail: str) -> str:
    econ = categories.get("Economic Type", "unknown").lower()
    merchant = canonical_detail.lower().replace(" ", "_")
    return f"{econ}_{merchant}"


def build_regex_for_canonical(canonical_detail: str) -> str:
    """
    Regex conservador. Para merchants multi-palabra,
    permite espacios flexibles.
    """
    tokens = [re.escape(tok) for tok in canonical_detail.split() if tok]
    if not tokens:
        return r"$^"
    return r"\b" + r"\s+".join(tokens) + r"\b"


def compact_kb(kb: dict[str, Any], create_patterns: bool = True) -> dict[str, Any]:
    exact_matches = kb.get("exact_matches", {})
    patterns = kb.get("patterns", {})

    canonical_exact_matches: dict[str, dict[str, Any]] = {}
    grouped_raw_keys: dict[str, list[str]] = defaultdict(list)

    for raw_key, raw_categories in exact_matches.items():
        canonical_key = canonicalize_detail(raw_key)
        categories = normalize_categories(raw_categories)

        grouped_raw_keys[canonical_key].append(raw_key)

        existing = canonical_exact_matches.get(canonical_key)
        canonical_exact_matches[canonical_key] = merge_categories(existing or {}, categories)

    new_patterns = copy.deepcopy(patterns)

    if create_patterns:
        for canonical_key, categories in canonical_exact_matches.items():
            # Solo genera patterns útiles para merchants razonables
            if len(canonical_key) < 4:
                continue
            pattern_name = build_pattern_name(categories, canonical_key)
            if pattern_name not in new_patterns:
                new_patterns[pattern_name] = {
                    "regex": build_regex_for_canonical(canonical_key),
                    "categories": categories,
                }

    compacted = {
        "last_updated": datetime.utcnow().isoformat(),
        "exact_matches": dict(sorted(canonical_exact_matches.items())),
        "patterns": dict(sorted(new_patterns.items())),
        "_meta": {
            "raw_exact_matches_before": len(exact_matches),
            "raw_exact_matches_after": len(canonical_exact_matches),
            "group_examples": {
                key: values[:10]
                for key, values in sorted(
                    grouped_raw_keys.items(),
                    key=lambda item: (-len(item[1]), item[0])
                )[:50]
            },
        },
    }
    return compacted


def main() -> None:
    parser = argparse.ArgumentParser(description="Compacta y canonicaliza knowledge_base_global.json")
    parser.add_argument(
        "--input",
        required=True,
        help="Ruta al knowledge_base_global.json original",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Ruta al archivo compactado de salida",
    )
    parser.add_argument(
        "--backup",
        default="",
        help="Ruta opcional para guardar backup del original",
    )
    parser.add_argument(
        "--no-patterns",
        action="store_true",
        help="No generar patterns nuevos a partir de exact_matches canonizados",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    with input_path.open("r", encoding="utf-8") as f:
        kb = json.load(f)

    if args.backup:
        backup_path = Path(args.backup)
        backup_path.write_text(json.dumps(kb, ensure_ascii=False, indent=2), encoding="utf-8")

    compacted = compact_kb(kb, create_patterns=not args.no_patterns)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(compacted, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    before = len(kb.get("exact_matches", {}))
    after = len(compacted.get("exact_matches", {}))

    print(f"[OK] exact_matches antes: {before}")
    print(f"[OK] exact_matches después: {after}")
    print(f"[OK] salida: {output_path}")


if __name__ == "__main__":
    main()