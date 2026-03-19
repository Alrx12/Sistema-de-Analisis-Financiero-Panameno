from app.parsers.bac import BacParser
from app.parsers.banco_general import BancoGeneralParser
from app.parsers.banistmo import BanistmoParser
from app.parsers.base import BaseStatementParser


class ParserFactory:
    parsers = [
        BancoGeneralParser(),
        BanistmoParser(),
        BacParser(),
    ]

    @classmethod
    def get_parser(cls, file_path: str):
        scored = []
        for parser in cls.parsers:
            score = parser.detect_score(file_path)
            scored.append((score, parser))

        scored.sort(key=lambda item: item[0], reverse=True)
        best_score, best_parser = scored[0]

        # Fallback para tests CSV simples y formatos genéricos
        if best_score < 0.3:
            return BaseStatementParser()

        return best_parser