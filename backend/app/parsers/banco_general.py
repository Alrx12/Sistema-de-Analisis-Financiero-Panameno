import pandas as pd
from io import BytesIO
from typing import Union

from app.parsers.base import BaseStatementParser


class BancoGeneralParser(BaseStatementParser):
    bank_name = "Banco General"

    def detect_score(self, file_path: Union[str, BytesIO]) -> float:
        try:
            raw_df = self.load_dataframe(file_path, header=None)
        except Exception as e:
            print(f"Error en detect_score BG: {e}")
            return 0.0

        score = 0.0
        sample = raw_df.head(50).fillna("").astype(str)

        if raw_df.shape[1] >= 7:
            score += 0.20

        valid_structured_rows = 0
        header_found = False

        for _, row in sample.iterrows():
            row_values = [str(v).strip().lower() for v in row.tolist()]
            if len(row_values) < 7:
                continue

            joined = " | ".join(row_values)

            if "fecha" in joined:
                score += 0.10
                if any(word in joined for word in ["debito", "débito", "credito", "crédito"]):
                    header_found = True
            if any(word in joined for word in ["descripcion", "descripción", "transacción"]):
                score += 0.10
            if "yappy bg" in joined or "banco general" in joined:
                score += 0.15

            col0 = row_values[0] if len(row_values) > 0 else ""
            col4 = row_values[4] if len(row_values) > 4 else ""
            col5 = row_values[5] if len(row_values) > 5 else ""
            col6 = row_values[6] if len(row_values) > 6 else ""

            has_date_like = bool(col0 and any(ch.isdigit() for ch in col0) and ('-' in col0 or '/' in col0 or ':' in col0))
            has_desc_like = bool(col4 and len(col4) > 3)
            has_amount = bool((col5 and any(c.isdigit() for c in col5)) or 
                             (col6 and any(c.isdigit() for c in col6)))

            if has_date_like and has_desc_like and has_amount:
                valid_structured_rows += 1

        if valid_structured_rows >= 2:
            score += 0.45
        elif valid_structured_rows == 1:
            score += 0.20

        if header_found:
            score += 0.10

        return min(score, 1.0)

    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            datos = []
            account_number = None
            header_row = None

            for idx, row in df.iterrows():
                row_text = " ".join(str(value) for value in row.tolist())
                row_lower = row_text.lower()

                if "cuenta:" in row_lower or "ahorros" in row_lower:
                    digits = "".join(ch for ch in row_text if ch.isdigit())
                    if digits and len(digits) >= 4:
                        account_number = digits

                if header_row is None and "fecha" in row_lower:
                    if any(word in row_lower for word in ["debito", "débito", "credito", "crédito", "descripcion", "descripción"]):
                        header_row = idx
                        break

            if header_row is None:
                header_row = 7

            for idx, row in df.iterrows():
                if idx <= header_row:
                    continue

                if len(row) < 7:
                    continue

                fecha = row.iloc[0]
                referencia = row.iloc[2] if pd.notna(row.iloc[2]) else ""
                transaccion = row.iloc[3] if pd.notna(row.iloc[3]) else ""
                descripcion = row.iloc[4] if pd.notna(row.iloc[4]) else ""
                debito = row.iloc[5] if pd.notna(row.iloc[5]) else 0
                credito = row.iloc[6] if pd.notna(row.iloc[6]) else 0

                descripcion_str = str(descripcion).strip()
                debito_val = self.limpiar_monto(debito)
                credito_val = self.limpiar_monto(credito)

                if (
                    (not descripcion_str or (debito_val == 0 and credito_val == 0))
                    and len(row) >= 6
                ):
                    referencia = row.iloc[1] if pd.notna(row.iloc[1]) else ""
                    transaccion = row.iloc[2] if pd.notna(row.iloc[2]) else ""
                    descripcion = row.iloc[3] if pd.notna(row.iloc[3]) else ""
                    debito = row.iloc[4] if pd.notna(row.iloc[4]) else 0
                    credito = row.iloc[5] if pd.notna(row.iloc[5]) else 0

                    descripcion_str = str(descripcion).strip()
                    debito_val = self.limpiar_monto(debito)
                    credito_val = self.limpiar_monto(credito)

                if not descripcion_str or descripcion_str.lower() in ["nan", "none", ""]:
                    continue

                if debito_val != 0 and credito_val == 0:
                    monto = -abs(debito_val)
                elif credito_val != 0 and debito_val == 0:
                    monto = abs(credito_val)
                elif debito_val != 0 and credito_val != 0:
                    monto = -abs(debito_val) if abs(debito_val) >= abs(credito_val) else abs(credito_val)
                else:
                    continue

                datos.append({
                    "fecha": fecha,
                    "descripcion": descripcion_str,
                    "monto": monto,
                    "referencia": referencia,
                    "transaccion": transaccion,
                    "account_number": account_number,
                })

            return pd.DataFrame(datos)
        except Exception as e:
            print(f"Error en extraer_datos Banco General: {e}")
            import traceback
            traceback.print_exc()
            return pd.DataFrame()

    def parse(self, file_path: Union[str, BytesIO]) -> dict:
        raw_df = self.load_dataframe(file_path, header=None)

        # Obtener nombre del archivo
        if hasattr(file_path, 'filename'):
            filename = file_path.filename
        elif hasattr(file_path, 'name'):
            from pathlib import Path
            filename = Path(file_path.name).name
        else:
            filename = str(file_path)

        return self.procesar(raw_df, filename)