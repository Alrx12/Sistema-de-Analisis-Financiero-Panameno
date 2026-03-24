from app.services.detail_normalizer import (
    canonicalize_detail,
    is_ambiguous_key,
    normalize_categories,
    normalize_text,
)


def test_normalize_text_removes_accents_and_uppercases() -> None:
    assert normalize_text("alimentación  débito") == "ALIMENTACION DEBITO"


def test_normalize_categories_normalizes_known_fields() -> None:
    categories = {
        "Economic Type": "Gasto",
        "SubType Economic": "Operativo",
        "Tipo de transacción": "GASTO",
        "Categoría de presupuesto": "Alimentación",
        "budget_role": "Presupuestable",
    }

    normalized = normalize_categories(categories)

    assert normalized == {
        "Economic Type": "gasto",
        "SubType Economic": "operativo",
        "Tipo de transacción": "gasto",
        "Categoría de presupuesto": "alimentacion",
        "budget_role": "presupuestable",
    }


def test_canonicalize_detail_spotify_long_descriptor() -> None:
    raw = "DB COMPRA E-COMMERCE INTL MCD CTE-FRA-SPOTIFY P3-5925-15858680"
    assert canonicalize_detail(raw) == "SPOTIFY"


def test_canonicalize_detail_google_gri_stays_distinct() -> None:
    raw = "DB COMPRA E-COMMERCE INTL MCD CTE-USA-GOOGLE GRI"
    assert canonicalize_detail(raw) == "GOOGLE GRI"


def test_canonicalize_detail_grindr_stays_distinct() -> None:
    raw = "GRINDR"
    assert canonicalize_detail(raw) == "GRINDR"


def test_canonicalize_detail_xtra_marke_maps_to_supermercado_xtra() -> None:
    raw = "DB POS COMPRA MCD CTE-XTRA MARKE"
    assert canonicalize_detail(raw) == "SUPERMERCADO XTRA"


def test_canonicalize_detail_super_xtra_maps_to_supermercado_xtra() -> None:
    raw = "DB POS COMPRA SUPER XTRA TRANSISTMICA"
    assert canonicalize_detail(raw) == "SUPERMERCADO XTRA"


def test_canonicalize_detail_netflix() -> None:
    raw = "DB COMPRA E-COMMERCE INTL MCD CTE-USA-NETFLIX.COM 84959321"
    assert canonicalize_detail(raw) == "NETFLIX"


def test_canonicalize_detail_google_one() -> None:
    raw = "DB COMPRA E-COMMERCE INTL MCD CTE-USA-GOOGLE ONE P3-5925-15858680"
    assert canonicalize_detail(raw) == "GOOGLE ONE"


def test_canonicalize_detail_falls_back_to_cleaned_descriptor_when_no_rule_matches() -> None:
    raw = "DB POS COMPRA LOCAL CTE-LIBRERIA EL ESTUDIANTE 12345678"
    result = canonicalize_detail(raw)

    assert result == "LIBRERIA EL ESTUDIANTE"


def test_is_ambiguous_key_detects_ambiguous_values() -> None:
    assert is_ambiguous_key("SUPER") is True
    assert is_ambiguous_key("METRO") is True
    assert is_ambiguous_key("FARMACIA") is True


def test_is_ambiguous_key_accepts_specific_merchants() -> None:
    assert is_ambiguous_key("SPOTIFY") is False
    assert is_ambiguous_key("SUPERMERCADO XTRA") is False
    assert is_ambiguous_key("GOOGLE GRI") is False
    assert is_ambiguous_key("GRINDR") is False