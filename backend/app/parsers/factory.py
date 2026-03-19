from pathlib import Path

from app.parsers.bac import BacParser
from app.parsers.base import BaseStatementParser
from app.parsers.banistmo import BanistmoParser
from app.parsers.banco_general import BancoGeneralParser
from app.parsers.shared_utils import infer_bank_name


class ParserFactory:
    @staticmethod
    def get_parser(file_path: str) -> BaseStatementParser:
        extension = Path(file_path).suffix.lower()
        if extension not in BaseStatementParser.allowed_extensions:
            raise ValueError("Extensión de archivo no soportada")

        parsers: list[BaseStatementParser] = [
            BancoGeneralParser(),
            BanistmoParser(),
            BacParser(),
        ]
        for parser in parsers:
            if parser.detect_format(file_path):
                return parser

        inferred_bank = infer_bank_name(file_path)
        if inferred_bank == "Banco General":
            return BancoGeneralParser()
        if inferred_bank == "Banistmo":
            return BanistmoParser()
        if inferred_bank == "BAC Credomatic":
            return BacParser()
        return BaseStatementParser()