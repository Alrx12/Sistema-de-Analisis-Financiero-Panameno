import pandas as pd

from app.parsers.base import BaseStatementParser


class BancoGeneralParser(BaseStatementParser):
    bank_name = "Banco General"

    def detect_score(self, file_path: str) -> float:
        try:
            raw_df = self.load_dataframe(file_path, header=None)
        except Exception:
            return 0.0

        score = 0.0
        sample = raw_df.head(30).fillna("").astype(str)

        if raw_df.shape[1] >= 7:
            score += 0.20

        valid_structured_rows = 0

        for _, row in sample.iterrows():
            row_values = [str(v).strip().lower() for v in row.tolist()]
            if len(row_values) < 7:
                continue

            joined = " | ".join(row_values)

            if "fecha" in joined:
                score += 0.10
            if "debito" in joined or "débito" in joined:
                score += 0.15
            if "credito" in joined or "crédito" in joined:
                score += 0.15
            if "descripcion" in joined or "descripción" in joined or "transacción" in joined:
                score += 0.10

            # Formato real/test:
            # 0 fecha, 2 referencia, 3 trx, 4 descripcion, 5 debito, 6 credito
            col0 = row_values[0]
            col4 = row_values[4]
            col5 = row_values[5]
            col6 = row_values[6]

            has_date_like = bool(col0 and any(ch.isdigit() for ch in col0))
            has_desc_like = bool(col4)
            has_amount_side = bool(col5 or col6)

            if has_date_like and has_desc_like and has_amount_side:
                valid_structured_rows += 1

        if valid_structured_rows >= 2:
            score += 0.45
        elif valid_structured_rows == 1:
            score += 0.20

        return min(score, 1.0)

    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            datos: list[dict[str, object]] = []

            for idx, row in df.iterrows():
                if idx < 8 or len(row) < 7:
                    continue

                fecha = row.iloc[0]
                referencia = row.iloc[2] if pd.notna(row.iloc[2]) else ""
                transaccion = row.iloc[3] if pd.notna(row.iloc[3]) else ""
                descripcion = row.iloc[4] if pd.notna(row.iloc[4]) else ""
                debito = row.iloc[5] if pd.notna(row.iloc[5]) else 0
                credito = row.iloc[6] if pd.notna(row.iloc[6]) else 0

                descripcion_str = str(descripcion).strip()
                if not descripcion_str:
                    continue

                debito_val = self.limpiar_monto(debito)
                credito_val = self.limpiar_monto(credito)

                if debito_val > 0 and credito_val == 0:
                    monto = -abs(debito_val)
                elif credito_val > 0 and debito_val == 0:
                    monto = abs(credito_val)
                elif debito_val > 0 and credito_val > 0:
                    monto = -abs(debito_val) if debito_val >= credito_val else abs(credito_val)
                else:
                    continue

                datos.append(
                    {
                        "fecha": fecha,
                        "descripcion": descripcion_str,
                        "monto": monto,
                        "referencia": referencia,
                        "transaccion": transaccion,
                    }
                )

            return pd.DataFrame(datos)
        except Exception:
            return pd.DataFrame()

    def parse(self, file_path: str) -> dict[str, object]:
        raw_df = self.load_dataframe(file_path, header=None)
        return self.procesar(raw_df, file_path)