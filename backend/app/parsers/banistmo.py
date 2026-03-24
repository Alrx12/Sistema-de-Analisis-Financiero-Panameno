import pandas as pd

from app.parsers.base import BaseStatementParser


class BanistmoParser(BaseStatementParser):
    bank_name = "Banistmo"

    def detect_score(self, file_path: str) -> float:
        # ──────────────────────────────────────────────────────────────────────
        # Señales del formato Banistmo:
        #   - 6 columnas (col0=vacío, col1=fecha, col2=detalle, col3=retiro,
        #     col4=depósito, col5=saldo)
        #   - Header: fila con "fecha" + "detalle" + "retiro" + "depósito"
        #     juntos en la MISMA fila (señal muy fuerte)
        #   - Celda "NÚMERO: XXXXXXXXXX" en la sección de metadatos
        #   - "Datos de la cuenta" / "banistmo" en metadatos
        #
        # IMPORTANTE: NO usar "mcd cte", "banco general", "db pos compra" ni
        # "db ach xpress" como penalizaciones — aparecen en los DESCRIPTORES
        # de las propias transacciones de Banistmo.
        # Solo penalizar señales estructurales que son 100% exclusivas de otro banco.
        # ──────────────────────────────────────────────────────────────────────
        try:
            raw_df = self.load_dataframe(file_path, header=None)
        except Exception:
            return 0.0

        score = 0.0
        sample = raw_df.head(100).fillna("").astype(str)

        # Banistmo exporta 6 columnas
        if raw_df.shape[1] == 6:
            score += 0.15
        elif raw_df.shape[1] >= 5:
            score += 0.05

        header_found = False

        for _, row in sample.iterrows():
            row_values = [str(v).strip().lower() for v in row.tolist()]
            joined = " | ".join(row_values)

            # Señal más fuerte: header con los 4 labels exactos en la misma fila
            if (
                "fecha" in joined
                and "detalle" in joined
                and "retiro" in joined
                and ("depósito" in joined or "deposito" in joined)
            ):
                score += 0.50
                header_found = True
                if "saldo" in joined:
                    score += 0.05
                continue  # No procesar el resto de la fila de header

            # Señales en sección de metadatos (SOLO antes del header de datos)
            if not header_found:
                if "datos de la cuenta" in joined:
                    score += 0.10
                if "banistmo" in joined:
                    score += 0.30
                if "número:" in joined or "numero:" in joined:
                    score += 0.25  # Firma del label de cuenta Banistmo

            # Penalizar señales ESTRUCTURALES exclusivas de BAC (no de contenido de tx)
            if "referencia" in joined and "código" in joined and "débitos" in joined:
                score -= 0.50
                break

        if header_found:
            score += 0.10

        return max(0.0, min(score, 1.0))

    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            header_row = None
            account_number = None

            # Buscar header y número de cuenta en todas las filas
            for idx, row in df.iterrows():
                row_text = " ".join(str(value).lower() for value in row.tolist())

                # Buscar número de cuenta — extraer de col 1 solamente
                # (extraer de row_text completo concatena saldos y otros números)
                if "número:" in row_text or "numero:" in row_text:
                    cell = str(row.iloc[1]).strip() if len(row) > 1 else ""
                    digits = "".join(ch for ch in cell if ch.isdigit())
                    if digits and len(digits) >= 4:
                        account_number = digits

                # Buscar header con todas las palabras clave
                if (
                    "fecha" in row_text
                    and "detalle" in row_text
                    and ("retiro" in row_text or "depósito" in row_text or "deposito" in row_text)
                ):
                    header_row = idx
                    break

            if header_row is None:
                raise ValueError("No se encontro header compatible para Banistmo")

            datos = []

            for idx, row in df.iterrows():
                if idx <= header_row:
                    continue

                # Banistmo tiene 6 columnas: 0=vacío/NaN, 1=fecha, 2=detalle, 3=retiro, 4=deposito, 5=saldo
                if len(row) < 5:
                    continue

                # Layout real de archivos Banistmo exportados:
                # Col 0: NaN/vacío
                # Col 1: Fecha (ej: "17 mar. 2026")
                # Col 2: Detalle/Descripción
                # Col 3: Retiro (monto negativo)
                # Col 4: Depósito (monto positivo)
                # Col 5: Saldo (opcional)

                # Intentar leer desde col 1 primero (estructura real)
                fecha = row.iloc[1] if len(row) > 1 else None
                descripcion = row.iloc[2] if len(row) > 2 and pd.notna(row.iloc[2]) else ""
                retiro = row.iloc[3] if len(row) > 3 and pd.notna(row.iloc[3]) else 0
                deposito = row.iloc[4] if len(row) > 4 and pd.notna(row.iloc[4]) else 0

                # Fallback: si col 1 está vacía, intentar desde col 0 (estructura de test)
                if pd.isna(fecha) or str(fecha).strip().lower() in {"", "nan", "none"}:
                    fecha = row.iloc[0] if len(row) > 0 else None
                    descripcion = row.iloc[1] if len(row) > 1 and pd.notna(row.iloc[1]) else ""
                    retiro = row.iloc[2] if len(row) > 2 and pd.notna(row.iloc[2]) else 0
                    deposito = row.iloc[3] if len(row) > 3 and pd.notna(row.iloc[3]) else 0

                descripcion_str = str(descripcion).strip()
                if not descripcion_str or descripcion_str.lower() in ["nan", "none", ""]:
                    continue

                retiro_val = self.limpiar_monto(retiro)
                deposito_val = self.limpiar_monto(deposito)

                if retiro_val != 0 and deposito_val == 0:
                    monto = -abs(retiro_val)
                elif deposito_val != 0 and retiro_val == 0:
                    monto = abs(deposito_val)
                elif retiro_val != 0 and deposito_val != 0:
                    monto = -abs(retiro_val) if abs(retiro_val) >= abs(deposito_val) else abs(deposito_val)
                else:
                    continue

                datos.append({
                    "fecha": fecha,
                    "descripcion": descripcion_str,
                    "monto": monto,
                    "account_number": account_number,
                })

            return pd.DataFrame(datos)
        except Exception as e:
            print(f"Error en extraer_datos Banistmo: {e}")
            return pd.DataFrame()

    def parse(self, file_path: str) -> dict:
        raw_df = self.load_dataframe(file_path, header=None)
        return self.procesar(raw_df, file_path)