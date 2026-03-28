from app.parsers.bac import BacParser
from app.parsers.banco_general import BancoGeneralParser
from app.parsers.banesco import BanescoParser
from app.parsers.banistmo import BanistmoParser
from app.parsers.base import BaseStatementParser


class ParserFactory:
    parsers = [
        BancoGeneralParser(),
        BanistmoParser(),
        BacParser(),
        BanescoParser(),
    ]

    @classmethod
    def get_parser(cls, file_path):
        """Obtiene el parser adecuado para el archivo.
        Acepta tanto rutas de archivo como objetos UploadFile/BytesIO."""
        scored = []
        for parser in cls.parsers:
            try:
                score = parser.detect_score(file_path)
                scored.append((score, parser))
            except Exception as e:
                print(f"Error detectando con {parser.bank_name}: {e}")
                scored.append((0.0, parser))

        scored.sort(key=lambda item: item[0], reverse=True)
        best_score, best_parser = scored[0]

        print(f"Mejor parser: {best_parser.bank_name} con score {best_score}")

        # Umbral más bajo para detectar formatos (0.3 en lugar de 0.7)
        if best_score < 0.3:
            return BaseStatementParser()

        return best_parser