from __future__ import annotations

import re
import unicodedata
from typing import Any, Callable


# ============================================================================
# Canonical keys que NO deben promoverse automáticamente a pattern ni usarse
# como claves canónicas confiables si quedan demasiado genéricas.
# ============================================================================
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


# ============================================================================
# Campos estándar de categorías usados por el clasificador y el KB
# ============================================================================
CATEGORY_FIELDS = [
    "Economic Type",
    "Economic Type Detail",
    "SubType Economic",
    "Categoría de presupuesto",
    "budget_role",
]


# ============================================================================
# Canonicalización estricta de valores de categorías
# Ajusta aquí cuando tu taxonomía evolucione.
# ============================================================================
STRICT_VALUE_MAPS = {
    # Tipo general — 6 valores canónicos
    "Economic Type": {
        "ingreso": "ingreso",
        "gasto": "gasto",
        "cargo_financiero": "cargo_financiero",
        "transferencia_propia": "transferencia_propia",
        "transferencia_tercero": "transferencia_tercero",
        "reembolso": "reembolso",
    },
    # Tipo extendido — preserva granularidad del tipo de operación
    "Economic Type Detail": {
        # Ingresos
        "salario": "salario",
        "otros_ingresos": "otros_ingresos",
        # Gastos
        "gasto_variable": "gasto_variable",
        "gasto_recurrente": "gasto_recurrente",
        # Cargos financieros
        "comision": "comision",
        "impuesto": "impuesto",
        "cargo_bancario": "cargo_bancario",
        # Transferencias
        "transferencia_propia": "transferencia_propia",
        "transferencia_tercero": "transferencia_tercero",
        # Reembolsos
        "reembolso": "reembolso",
    },
    "SubType Economic": {
        "operativo": "operativo",
        "recurrente": "recurrente",
        "extraordinario": "extraordinario",
        "variable": "variable",
        "fijo": "fijo",
        "interno": "interno",
        "financiero": "financiero",
        "desconocido": "desconocido",
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
        "comisión": "comision",
        "impuesto": "impuesto",
        "ahorro": "ahorro",
        "educacion": "educacion",
        "educación": "educacion",
        "suscripciones": "suscripciones",
        "tecnologia": "tecnologia",
        "tecnología": "tecnologia",
        "consumo_desconocido": "consumo_desconocido",
    },
    "budget_role": {
        "presupuestable": "presupuestable",
        "no_presupuestable": "no_presupuestable",
        "solo_balance": "solo_balance",
        "gasto_operativo": "gasto_operativo",
        "gasto_financiero": "gasto_financiero",
        "ahorro_inversion": "ahorro_inversion",
        "revisar": "revisar",
    },
}


# Tipo para el campo de reemplazo: string fijo o callable que recibe el Match
_MerchantReplacement = str | Callable[[re.Match[str]], str]


# ============================================================================
# Reglas específicas primero
# Mantienen precedencia sobre alias genéricos.
# Reglas con callable permiten reemplazos dinámicos (ej: preservar sufijo GOOGLE XXX).
# ============================================================================
SPECIFIC_MERCHANT_RULES: list[tuple[re.Pattern[str], _MerchantReplacement]] = [
    # Casos explícitos de negocio
    (re.compile(r"\bGOOGLE\s+GRI\b", re.IGNORECASE), "GOOGLE GRI"),
    (re.compile(r"\bGRINDR\b", re.IGNORECASE), "GRINDR"),

    # XTRA / supermercado
    (re.compile(r"\bXTRA\s+MARKE\b", re.IGNORECASE), "SUPERMERCADO XTRA"),
    (re.compile(r"\bSUPER\s+XTRA\b", re.IGNORECASE), "SUPERMERCADO XTRA"),
    (re.compile(r"\bMCD\s+CTE[- ]XTRA\s+MARKE\b", re.IGNORECASE), "SUPERMERCADO XTRA"),

    # Variantes frecuentes más específicas
    (re.compile(r"\bDISNEY\s*PLU\b", re.IGNORECASE), "DISNEY PLUS"),
    (re.compile(r"\bGOOGLE\s+ONE\b", re.IGNORECASE), "GOOGLE ONE"),
    (re.compile(r"\bGOOGLE\s+CRU\b", re.IGNORECASE), "CRUNCHYROLL"),   # Banistmo: GOOGLE CRU = Crunchyroll

    # Suscripciones de Google Play Store: Banistmo trunca el nombre del app como "GOOGLE XXX"
    # donde XXX son 2–6 letras del app (MOB, YTU, DRI, etc.).
    # Esta regla preserva cada sufijo como clave distinta en lugar de colapsarlos todos en "GOOGLE".
    # IMPORTANTE: las reglas GOOGLE ONE, GOOGLE CRU, GOOGLE GRI (arriba) tienen precedencia —
    # solo llegan aquí los sufijos no reconocidos explícitamente.
    (
        re.compile(r"\bGOOGLE\s+([A-Z]{2,6})\b", re.IGNORECASE),
        lambda m: "GOOGLE " + m.group(1).upper(),
    ),

    (re.compile(r"\bAPPLE\s+COM\b", re.IGNORECASE), "APPLE"),
    (re.compile(r"\bUBER\s+R\b", re.IGNORECASE), "UBER"),
]


# ============================================================================
# Reglas genéricas después
# ============================================================================
GENERIC_MERCHANT_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bSPOTIFY\b", re.IGNORECASE), "SPOTIFY"),
    (re.compile(r"\bNETFLIX\b", re.IGNORECASE), "NETFLIX"),
    (re.compile(r"\bCRUNCHYROLL\b", re.IGNORECASE), "CRUNCHYROLL"),
    (re.compile(r"\bAMAZON\s+PRIME\b", re.IGNORECASE), "AMAZON PRIME"),
    (re.compile(r"\bAMAZON\b", re.IGNORECASE), "AMAZON"),
    (re.compile(r"\bDISNEY\b", re.IGNORECASE), "DISNEY PLUS"),
    (re.compile(r"\bAPPLE\b", re.IGNORECASE), "APPLE"),
    (re.compile(r"\bMICROSOFT\b", re.IGNORECASE), "MICROSOFT"),
    (re.compile(r"\bGOOGLE\b", re.IGNORECASE), "GOOGLE"),
    (re.compile(r"\bUBER\b", re.IGNORECASE), "UBER"),
    (re.compile(r"\bTIGO\b", re.IGNORECASE), "TIGO"),
    (re.compile(r"\bPEDIDOS(?:\s*YA)?\b", re.IGNORECASE), "PEDIDOSYA"),
    (re.compile(r"\bKFC\b", re.IGNORECASE), "KFC"),
    (re.compile(r"\bSTARBUCKS\b", re.IGNORECASE), "STARBUCKS"),
    (re.compile(r"\bSUBWAY\b", re.IGNORECASE), "SUBWAY"),
    (re.compile(r"\bDOMINOS?\b", re.IGNORECASE), "DOMINOS"),
    (re.compile(r"\bSUPER\s+99\b", re.IGNORECASE), "SUPERMERCADO 99"),
    (re.compile(r"\bXTRA\b", re.IGNORECASE), "SUPERMERCADO XTRA"),
    (re.compile(r"\bTIM\s+HORTON\b", re.IGNORECASE), "TIM HORTONS"),
    (re.compile(r"\bNORTON\b", re.IGNORECASE), "NORTON"),
    (re.compile(r"\bPAYPAL\b", re.IGNORECASE), "PAYPAL"),
    (re.compile(r"\bSUPERMERCADO\s+REY\b|\bREY\s+\d+\s+DE\b|\bREY\b(?=\s+\d)", re.IGNORECASE), "SUPERMERCADO REY"),
    (re.compile(r"\bTEMU\b", re.IGNORECASE), "TEMU"),
    (re.compile(r"\bCOMPASS\b", re.IGNORECASE), "COMPASS"),
]


# ============================================================================
# Tokens/segmentos de ruido bancario
# ============================================================================
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
    # BAC: códigos de tipo de transacción — token standalone antes del detalle del merchant
    # CP = Compra/Cargo Payment, PT = Pago Tarjeta, CM = Cargo Mensual
    re.compile(r"\bCP\b"),
    re.compile(r"\bPT\b"),
    re.compile(r"\bCM\b"),
]


# ============================================================================
# Sufijos variables, IDs y ruido transaccional
# ============================================================================
VARIABLE_SUFFIX_PATTERNS: list[re.Pattern[str]] = [
    # Número de tarjeta enmascarado (BG): -4187-94XX-XXXX-6798
    # Formato: -4d - (2d+2X) - (4X) - 4d  con o sin espacios alrededor de guiones
    re.compile(r"\s*-\s*\d{4}\s*-\s*[0-9A-Z]{4}\s*-\s*[0-9A-Z]{4}\s*-\s*\d{4}\b", re.IGNORECASE),
    # Número de tarjeta enmascarado (BAC): 4143-27**-****-63219
    # Formato: 4d - (2d+2*) - 4* - 4-5d  (asteriscos, a diferencia de XX en BG)
    re.compile(r"\s*\b\d{4}\s*-\s*[\d*]{4}\s*-\s*[*]{4}\s*-\s*\d{4,5}\b"),
    # ID de referencia alfanumérico al final: 7006M4Z73, AB12CD3
    # Token de 6+ chars con mezcla de letras y dígitos (no palabras puras)
    re.compile(r"\s+(?=[A-Z0-9]*[0-9][A-Z0-9]*[A-Z][A-Z0-9]*|[A-Z0-9]*[A-Z][A-Z0-9]*[0-9][A-Z0-9]*)[A-Z0-9]{6,}\b"),
    re.compile(r"\s*-\s*\d{3,}\s*-\s*\d{3,}\b"),   # -5925-15858680
    re.compile(r"\s+\d{6,}\b"),                   # número largo final
    re.compile(r"\(\d{4,}\)"),                    # (1087824)
    re.compile(r"\b\d{8,}\b"),                    # token numérico largo
    re.compile(r"\bP\d+\b", re.IGNORECASE),       # P3 / P4
    re.compile(r"\b[0-9]{2}\s+[0-9]{10,}\b"),     # 08 0916000525
]

COUNTRY_TAG_PATTERN = re.compile(
    r"\b(?:USA|FRA|IRL|CRI|COL|PAN|PTY)\b",
    re.IGNORECASE,
)

MULTISPACE_PATTERN = re.compile(r"\s+")
NON_ALNUM_KEEP_SPACE_PATTERN = re.compile(r"[^A-Z0-9 ]+")

# Pre-check: PAGO + número de tarjeta enmascarado (BAC: 5200-57**-****-3193)
# Debe evaluarse ANTES de strip_variable_suffixes porque ese paso elimina el número,
# dejando solo "PAGO" — clave demasiado ambigua para ser útil.
# Formato detectado: 4d - (2d+2*) - 4* - 4-5d  (al menos un asterisco en el número)
_TDC_PAYMENT_DETECT = re.compile(
    r"\bPAGO\b\s+\d{4}[-\s]*[\d*]{2,4}[*]{1,4}[-\s]*[*]{4}[-\s]*\d{4,5}\b",
    re.IGNORECASE,
)


# ============================================================================
# Utilidades de texto
# ============================================================================
def strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_text(text: str) -> str:
    text = strip_accents(text or "")
    text = text.upper().strip()
    text = MULTISPACE_PATTERN.sub(" ", text)
    return text


def normalize_value(value: Any) -> str:
    return normalize_text(str(value)).lower()


# ============================================================================
# Normalización de categorías
# ============================================================================
def normalize_categories(categories: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}

    for field in CATEGORY_FIELDS:
        raw_value = categories.get(field, "")
        normalized = normalize_value(raw_value)
        allowed = STRICT_VALUE_MAPS.get(field, {})
        result[field] = allowed.get(normalized, normalized)

    return result


# ============================================================================
# Limpieza de descriptores bancarios
# ============================================================================
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


# ============================================================================
# Detección de merchant canónico
# ============================================================================
def detect_canonical_merchant(detail: str) -> str:
    for pattern, merchant in SPECIFIC_MERCHANT_RULES:
        m = pattern.search(detail)
        if m:
            return merchant(m) if callable(merchant) else merchant

    for pattern, merchant in GENERIC_MERCHANT_RULES:
        m = pattern.search(detail)
        if m:
            return merchant(m) if callable(merchant) else merchant

    return ""


def canonicalize_detail(raw_detail: str) -> str:
    """
    Convierte el detalle crudo bancario a una clave canónica reusable.

    Ejemplos esperados:
    - DB COMPRA E-COMMERCE INTL MCD CTE-FRA-SPOTIFY P3-5925-15858680 -> SPOTIFY
    - DB COMPRA E-COMMERCE INTL MCD CTE-USA-GOOGLE GRI -> GOOGLE GRI
    - GRINDR -> GRINDR
    - DB POS COMPRA MCD CTE-XTRA MARKE -> SUPERMERCADO XTRA
    - PT: PAGO 5200-57**-****-3193 -> PAGO TDC
    """
    detail = normalize_text(raw_detail)

    # Pre-check: PAGO + número de tarjeta enmascarado → "PAGO TDC"
    # Debe ir ANTES de strip_variable_suffixes porque ese paso elimina el número,
    # dejando solo "PAGO" — clave ambigua que queda en AMBIGUOUS_CANONICAL_KEYS.
    if _TDC_PAYMENT_DETECT.search(detail):
        return "PAGO TDC"

    detail = strip_variable_suffixes(detail)

    merchant = detect_canonical_merchant(detail)
    if merchant:
        return merchant

    cleaned = remove_noise_tokens(detail)
    tokens = cleaned.split()

    if len(tokens) > 5:
        cleaned = " ".join(tokens[:5])

    return cleaned or detail


# ============================================================================
# Validación de claves canónicas
# ============================================================================
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