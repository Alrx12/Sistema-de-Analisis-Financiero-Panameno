from pathlib import Path

import pandas as pd

from app.parsers.bac import BacParser
from app.parsers.banistmo import BanistmoParser
from app.parsers.banco_general import BancoGeneralParser


def test_banco_general_parser_detects_debit_and_credit(tmp_path: Path) -> None:
    file_path = tmp_path / "estado_bg.csv"
    pd.DataFrame(
        [
            {"fecha": "2026-03-10", "descripcion": "YAPPY BG 1234", "debito": 25.5, "credito": None},
            {"fecha": "2026-03-11", "descripcion": "ACH XPRESS NOMINA", "debito": None, "credito": 1500},
        ]
    ).to_csv(file_path, index=False)

    result = BancoGeneralParser().parse(str(file_path))
    amounts = [item["amount"] for item in result["transactions"]]

    assert amounts == [-25.5, 1500.0]
    assert result["detected_account_last4"] == "1234"


def test_banistmo_parser_detects_retiro_y_deposito(tmp_path: Path) -> None:
    file_path = tmp_path / "estado_banistmo.csv"
    pd.DataFrame(
        [
            {"fecha": "2026-03-10", "detalle": "DB POS COMPRA 4321", "retiro": 40.0, "deposito": None},
            {"fecha": "2026-03-11", "detalle": "ACH RECIBIDO", "retiro": None, "deposito": 800.0},
        ]
    ).to_csv(file_path, index=False)

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