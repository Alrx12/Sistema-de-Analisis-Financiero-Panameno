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
        # Revisar más filas porque el header puede estar lejos
        sample = raw_df.head(60).fillna("").astype(str)

        if raw_df.shape[1] >= 8:
            score += 0.10

        header_found = False

        for _, row in sample.iterrows():
            row_values = [str(v).strip().lower() for v in row.tolist()]
            joined = " | ".join(row_values)

            if "fecha" in joined and "referencia" in joined:
                score += 0.35
                header_found = True
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
            # Palabras clave adicionales BAC
            if "compass" in joined or "proteccion robo" in joined or "ach xpr" in joined:
                score += 0.10

        # Bonus por header
        if header_found:
            score += 0.10

        return min(score, 1.0)

    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            header_row = None
            account_number = None

            for idx, row in df.iterrows():
                row_values = [str(value).strip() for value in row.tolist()]
                row_text = " ".join(value.lower() for value in row_values)

                # Buscar número de producto/cuenta
                if "producto" in row_text:
                    digits = "".join(ch for ch in row_text if ch.isdigit())
                    if digits and len(digits) >= 4:
                        account_number = digits

                # Buscar header
                if "fecha" in row_text and "referencia" in row_text:
                    if any(word in row_text for word in ["débitos", "debitos", "créditos", "creditos"]):
                        header_row = idx
                        break

            if header_row is None:
                raise ValueError("No se encontro header compatible para BAC")

            datos = []

            for idx in range(header_row + 1, len(df)):
                row = df.iloc[idx]
                if len(row) < 8:
                    continue

                fecha = row.iloc[0]
                referencia = row.iloc[1] if pd.notna(row.iloc[1]) else ""
                codigo = row.iloc[3] if len(row) > 3 and pd.notna(row.iloc[3]) else ""
                descripcion = row.iloc[4] if len(row) > 4 and pd.notna(row.iloc[4]) else ""

                # Débitos y créditos pueden estar en diferentes columnas dependiendo del formato
                # Formato 1: col 7 = débitos, col 8 = créditos
                # Formato 2: col 5 = débitos, col 6 = créditos
                debito = 0
                credito = 0

                if len(row) >= 9:
                    debito = row.iloc[7] if pd.notna(row.iloc[7]) else 0
                    credito = row.iloc[8] if pd.notna(row.iloc[8]) else 0
                elif len(row) >= 7:
                    debito = row.iloc[5] if pd.notna(row.iloc[5]) else 0
                    credito = row.iloc[6] if pd.notna(row.iloc[6]) else 0

                descripcion_str = str(descripcion).strip()
                if not descripcion_str or "saldo inicial" in descripcion_str.lower():
                    continue

                debito_val = self.limpiar_monto(debito)
                credito_val = self.limpiar_monto(credito)

                if debito_val != 0 and credito_val == 0:
                    monto = -abs(debito_val)
                elif credito_val != 0 and debito_val == 0:
                    monto = abs(credito_val)
                elif debito_val != 0 and credito_val != 0:
                    monto = -abs(debito_val) if abs(debito_val) >= abs(credito_val) else abs(credito_val)
                else:
                    continue

                # Agregar código a la descripción si existe
                descripcion_final = f"{codigo}: {descripcion_str}" if codigo and str(codigo).lower() != "nan" else descripcion_str

                datos.append({
                    "fecha": fecha,
                    "descripcion": descripcion_final,
                    "monto": monto,
                    "referencia": referencia,
                    "account_number": account_number,
                })

            return pd.DataFrame(datos)
        except Exception as e:
            print(f"Error en extraer_datos BAC: {e}")
            return pd.DataFrame()

    def parse(self, file_path: str) -> dict:
        raw_df = self.load_dataframe(file_path, header=None)
        return self.procesar(raw_df, file_path)