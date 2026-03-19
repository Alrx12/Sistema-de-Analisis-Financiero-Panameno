from pathlib import Path

import pandas as pd

from app.parsers.bac import BacParser
from app.parsers.base import BaseStatementParser
from app.parsers.banistmo import BanistmoParser
from app.parsers.banco_general import BancoGeneralParser


def test_banco_general_parser_detects_debit_and_credit(tmp_path: Path) -> None:
    file_path = tmp_path / "estado_bg.csv"
    rows = [[None] * 7 for _ in range(8)]
    rows.extend(
        [
            ["2026-03-10 12:54:04", None, "ref1", "trx1", "YAPPY BG 1234", "25.50", None],
            ["2026-03-11 12:54:04", None, "ref2", "trx2", "ACH XPRESS NOMINA", None, "1,500.00"],
        ]
    )
    pd.DataFrame(rows).to_csv(file_path, index=False, header=False)

    result = BancoGeneralParser().parse(str(file_path))
    amounts = [item["amount"] for item in result["transactions"]]

    assert amounts == [-25.5, 1500.0]
    assert result["detected_account_last4"] == "1234"


def test_banistmo_parser_detects_retiro_y_deposito(tmp_path: Path) -> None:
    file_path = tmp_path / "estado_banistmo.csv"
    rows = [
        ["encabezado", None, None, None, None],
        ["Fecha", "Fecha", "Detalle", "Retiro", "Deposito"],
        [None, "10 mar. 2026", "DB POS COMPRA 4321", "-40.00", None],
        [None, "11 mar. 2026", "ACH RECIBIDO", None, "800.00"],
    ]
    pd.DataFrame(rows).to_csv(file_path, index=False, header=False)

    result = BanistmoParser().parse(str(file_path))
    amounts = [item["amount"] for item in result["transactions"]]

    assert amounts == [-40.0, 800.0]
    assert result["detected_account_last4"] == "4321"


def test_bac_parser_detects_debits_and_credits(tmp_path: Path) -> None:
    file_path = tmp_path / "estado_bac.csv"
    rows = [
        ["detalle de movimientos del período", None, None, None, None, None, None, None, None],
        ["Fecha", "Referencia", "Oficina", "Código", "Descripción", "Canal", "Cheque", "Débitos", "Créditos"],
        ["2026-03-10", "ref 9876", None, "CP", "COMPASS", None, None, 75.25, None],
        ["2026-03-11", "ref 9876", None, "AB", "PAGO RECIBIDO", None, None, None, 2000.0],
    ]
    pd.DataFrame(rows).to_csv(file_path, index=False, header=False)

    result = BacParser().parse(str(file_path))
    amounts = [item["amount"] for item in result["transactions"]]

    assert amounts == [-75.25, 2000.0]
    assert result["detected_account_last4"] == "9876"


def test_amount_normalization_supports_real_statement_formats() -> None:
    parser = BaseStatementParser()

    assert parser._to_amount("$1,234.56") == 1234.56
    assert parser._to_amount("1.234,56") == 1234.56
    assert parser._to_amount("(45.00)") == -45.0
    assert parser._to_amount("2,500") == 2500.0


def test_parsear_fecha_supports_legacy_formats() -> None:
    parser = BaseStatementParser()

    assert parser.parsear_fecha("2025-09-01 12:00:00") is not None
    assert parser.parsear_fecha("15/03/2026") is not None
    assert parser.parsear_fecha("17 mar. 2026") is not None
    assert parser.parsear_fecha("17/03/26") is not None