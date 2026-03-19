import pandas as pd

from app.parsers.base import BaseStatementParser


class BanistmoParser(BaseStatementParser):
    bank_name = "Banistmo"

    def detect_score(self, file_path: str) -> float:
        try:
            raw_df = self.load_dataframe(file_path, header=None)
        except Exception:
            return 0.0

        score = 0.0
        sample = raw_df.head(50).fillna("").astype(str)

        if raw_df.shape[1] >= 5:
            score += 0.10

        for _, row in sample.iterrows():
            row_values = [str(v).strip().lower() for v in row.tolist()]
            joined = " | ".join(row_values)

            if "fecha" in joined and "detalle" in joined:
                score += 0.35
            if "retiro" in joined:
                score += 0.20
            if "depósito" in joined or "deposito" in joined:
                score += 0.20
            if "saldo" in joined:
                score += 0.10
            if "datos de la cuenta" in joined:
                score += 0.10

        return min(score, 1.0)

    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            header_row = None
            account_number = None

            for idx, row in df.iterrows():
                row_text = " ".join(str(value).lower() for value in row.tolist())

                if "número:" in row_text or "numero:" in row_text:
                    digits = "".join(ch for ch in row_text if ch.isdigit())
                    if digits:
                        account_number = digits

                if "fecha" in row_text and "detalle" in row_text and ("retiro" in row_text or "depósito" in row_text or "deposito" in row_text):
                    header_row = idx
                    break

            if header_row is None:
                raise ValueError("No se encontro header compatible para Banistmo")

            datos: list[dict[str, object]] = []

            for idx, row in df.iterrows():
                if idx <= header_row or len(row) < 5:
                    continue

                # Formato real/test:
                # 0 vacío, 1 fecha, 2 detalle, 3 retiro, 4 deposito
                fecha = row.iloc[1]
                descripcion = row.iloc[2] if pd.notna(row.iloc[2]) else ""
                retiro = row.iloc[3] if pd.notna(row.iloc[3]) else 0
                deposito = row.iloc[4] if pd.notna(row.iloc[4]) else 0

                descripcion_str = str(descripcion).strip()
                if not descripcion_str:
                    continue

                retiro_val = self.limpiar_monto(retiro)
                deposito_val = self.limpiar_monto(deposito)

                if retiro_val != 0 and deposito_val == 0:
                    monto = -abs(retiro_val)
                elif deposito_val != 0 and retiro_val == 0:
                    monto = abs(deposito_val)
                elif retiro_val != 0 and deposito_val != 0:
                    monto = -abs(retiro_val) if retiro_val >= deposito_val else abs(deposito_val)
                else:
                    continue

                datos.append(
                    {
                        "fecha": fecha,
                        "descripcion": descripcion_str,
                        "monto": monto,
                        "account_number": account_number,
                    }
                )

            return pd.DataFrame(datos)
        except Exception:
            return pd.DataFrame()

    def parse(self, file_path: str) -> dict[str, object]:
        raw_df = self.load_dataframe(file_path, header=None)
        return self.procesar(raw_df, file_path)