import pandas as pd

from app.parsers.base import BaseStatementParser


class BacParser(BaseStatementParser):
    bank_name = "BAC Credomatic"

    def detect_score(self, file_path: str) -> float:
        try:
            raw_df = self.load_dataframe(file_path, header=None)
        except Exception:
            return 0.0

        score = 0.0
        sample = raw_df.head(40).fillna("").astype(str)

        if raw_df.shape[1] >= 9:
            score += 0.10

        for _, row in sample.iterrows():
            row_values = [str(v).strip().lower() for v in row.tolist()]
            joined = " | ".join(row_values)

            if "fecha" in joined and "referencia" in joined:
                score += 0.35
            if "código" in joined or "codigo" in joined:
                score += 0.15
            if "débitos" in joined or "debitos" in joined or "débito" in joined or "debito" in joined:
                score += 0.15
            if "créditos" in joined or "creditos" in joined or "crédito" in joined or "credito" in joined:
                score += 0.15
            if "saldo inicial" in joined or "saldo disponible" in joined:
                score += 0.10
            if "detalle de movimientos del período" in joined or "detalle de movimientos del periodo" in joined:
                score += 0.10

        return min(score, 1.0)

    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            header_row = None
            account_number = None

            for idx, row in df.iterrows():
                row_values = [str(value).strip() for value in row.tolist()]
                row_text = " ".join(value.lower() for value in row_values)

                if "producto" in row_text:
                    digits = "".join(ch for ch in row_text if ch.isdigit())
                    if digits:
                        account_number = digits

                if "fecha" in row_text and "referencia" in row_text and ("débitos" in row_text or "debitos" in row_text):
                    header_row = idx
                    break

            if header_row is None:
                raise ValueError("No se encontro header compatible para BAC")

            datos: list[dict[str, object]] = []

            for idx in range(header_row + 1, len(df)):
                row = df.iloc[idx]
                if len(row) < 9:
                    continue

                # Formato real/test:
                # 0 fecha, 1 referencia, 2 oficina, 3 código, 4 descripción, 5 canal, 6 cheque, 7 débitos, 8 créditos
                fecha = row.iloc[0]
                referencia = row.iloc[1] if pd.notna(row.iloc[1]) else ""
                codigo = row.iloc[3] if pd.notna(row.iloc[3]) else ""
                descripcion = row.iloc[4] if pd.notna(row.iloc[4]) else ""
                debito = row.iloc[7] if pd.notna(row.iloc[7]) else 0
                credito = row.iloc[8] if pd.notna(row.iloc[8]) else 0

                descripcion_str = str(descripcion).strip()
                if not descripcion_str or "saldo inicial" in descripcion_str.lower():
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

                descripcion_final = f"{codigo}: {descripcion_str}" if codigo and str(codigo).lower() != "nan" else descripcion_str

                datos.append(
                    {
                        "fecha": fecha,
                        "descripcion": descripcion_final,
                        "monto": monto,
                        "referencia": referencia,
                        "account_number": account_number,
                    }
                )

            return pd.DataFrame(datos)
        except Exception:
            return pd.DataFrame()

    def parse(self, file_path: str) -> dict[str, object]:
        raw_df = self.load_dataframe(file_path, header=None)
        return self.procesar(raw_df, file_path)