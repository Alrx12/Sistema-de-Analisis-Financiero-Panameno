from __future__ import annotations

import re
from typing import Union
from io import BytesIO

import pandas as pd

from app.parsers.base import BaseStatementParser


class BanistmoMovimientosParser(BaseStatementParser):
    """Parser para reportes de movimientos ACH/transferencias de Banistmo.

    Este formato es diferente al estado de cuenta regular (BanistmoParser).
    Banistmo genera este reporte desde su banca en línea cuando el usuario
    descarga el historial de transferencias ACH / XPRESS.

    Estructura del archivo:
      Filas 0-7: vacías
      Fila 8:  "Datos del cliente" | "Generado el día: DD/M/YYYY"
      Fila 10: Nombre del cliente
      Fila 11: "DESDE: DD/MM/YYYY HASTA: DD/MM/YYYY"
      Fila 13: "Detalle de los movimientos"
      Fila 15: HEADER → [nan, Número de comprobante, Fecha, Cuenta retiro,
                          Destinatario, Banco, Detalle, Tipo, Monto, Estado]
      Fila 16+: transacciones

    Señales de detección exclusivas:
      +0.55  Header contiene "número de comprobante" (exclusivo de este reporte)
      +0.20  Header contiene "cuenta retiro"
      +0.10  Header contiene "destinatario"
      +0.10  Header contiene "estado"
      +0.10  Metadata contiene "detalle de los movimientos"
      −0.50  Header contiene señales de otro banco (retiro+depósito = Banistmo normal,
             referencia+débitos = BAC, canal = Banesco)
    """

    bank_name = "Banistmo"

    # ─────────────────────────────────────────────────────────────────────────
    # detect_score
    # ─────────────────────────────────────────────────────────────────────────

    def detect_score(self, file_path: Union[str, BytesIO]) -> float:
        try:
            raw_df = self.load_dataframe(file_path, header=None)
        except Exception:
            return 0.0

        score = 0.0
        sample = raw_df.head(20).fillna("").astype(str)
        header_found = False

        for _, row in sample.iterrows():
            row_values = [str(v).strip().lower() for v in row.tolist()]
            joined = " | ".join(row_values)

            # Señal primaria: "número de comprobante" en el header
            # Este label es exclusivo del reporte ACH/transferencias de Banistmo
            if "número de comprobante" in joined or "numero de comprobante" in joined:
                score += 0.55
                header_found = True
                if "cuenta retiro" in joined:
                    score += 0.20
                if "destinatario" in joined:
                    score += 0.10
                if "estado" in joined:
                    score += 0.10
                continue

            # Señales en metadata (antes del header)
            if not header_found:
                if "detalle de los movimientos" in joined:
                    score += 0.10

            # Penalizaciones: señales de otros formatos
            # Banistmo estado de cuenta normal: columnas retiro + depósito
            if "retiro" in joined and ("deposito" in joined or "depósito" in joined):
                score -= 0.50
                break
            # BAC: referencia + débitos
            if "referencia" in joined and ("débitos" in joined or "debitos" in joined):
                score -= 0.50
                break
            # Banesco: primera columna = "canal"
            if row_values and row_values[0] == "canal" and "fecha" in row_values:
                score -= 0.50
                break

        return max(0.0, min(score, 1.0))

    # ─────────────────────────────────────────────────────────────────────────
    # extraer_datos
    # ─────────────────────────────────────────────────────────────────────────

    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extrae transacciones del reporte de movimientos ACH de Banistmo.

        Layout de columnas (a partir de la fila header):
          col 0: vacío (ignorar)
          col 1: Número de comprobante
          col 2: Fecha en formato YYYY-MM-DD
          col 3: Cuenta retiro (cuenta origen, formato *XXXX)
          col 4: Destinatario (cuenta destino, formato *XXXX o número)
          col 5: Banco destino (nombre del banco receptor)
          col 6: Detalle (descripción de la transferencia)
          col 7: Tipo (Transferencias a terceros)
          col 8: Monto (positivo — siempre es débito de la cuenta origen)
          col 9: Estado (Realizado / Rechazado)

        Solo se incluyen transacciones con Estado = "Realizado".
        El monto se convierte a negativo (salida de dinero).
        El account_number se extrae de la columna "Cuenta retiro" (*8425 → "8425").
        """
        try:
            header_row_idx = None
            account_number = None

            # ── Paso 1: encontrar el header ────────────────────────────────────
            for idx, row in df.iterrows():
                row_values = [str(v).strip().lower() for v in row.tolist()]
                joined = " | ".join(row_values)

                if "número de comprobante" in joined or "numero de comprobante" in joined:
                    header_row_idx = idx
                    break

            if header_row_idx is None:
                raise ValueError(
                    "No se encontró header compatible para reporte de movimientos Banistmo"
                )

            # ── Paso 2: extraer filas de transacciones ─────────────────────────
            datos = []

            for idx, row in df.iterrows():
                if idx <= header_row_idx:
                    continue

                if len(row) < 9:
                    continue

                # Estado: solo procesar "Realizado"; ignorar "Rechazado" y otros
                estado = str(row.iloc[9]).strip().lower() if len(row) > 9 else ""
                if estado not in {"realizado", "nan", ""}:
                    continue

                fecha = row.iloc[2] if len(row) > 2 else None
                cuenta_retiro = str(row.iloc[3]).strip() if len(row) > 3 else ""
                banco_destino = str(row.iloc[5]).strip() if len(row) > 5 else ""
                detalle = str(row.iloc[6]).strip() if len(row) > 6 else ""
                tipo = str(row.iloc[7]).strip() if len(row) > 7 else ""
                monto_raw = row.iloc[8] if len(row) > 8 else None

                # Extraer last4 de la cuenta origen (*8425 → "8425")
                if account_number is None and cuenta_retiro:
                    digits = re.findall(r"\d{4}", cuenta_retiro)
                    if digits:
                        account_number = digits[-1]

                descripcion_str = detalle
                if not descripcion_str or descripcion_str.lower() in {"nan", "none", ""}:
                    # Fallback: usar tipo + banco destino si detalle está vacío
                    if tipo and tipo.lower() not in {"nan", "none", ""}:
                        descripcion_str = f"{tipo} {banco_destino}".strip()
                    else:
                        continue

                monto_val = self.limpiar_monto(monto_raw)
                if monto_val == 0:
                    continue

                # Todas las filas de este reporte son débitos (salidas)
                monto_val = -abs(monto_val)

                datos.append(
                    {
                        "fecha": fecha,
                        "descripcion": descripcion_str,
                        "monto": monto_val,
                        "account_number": account_number,
                    }
                )

            return pd.DataFrame(datos)

        except Exception as e:
            print(f"Error en extraer_datos BanistmoMovimientos: {e}")
            return pd.DataFrame()

    # ─────────────────────────────────────────────────────────────────────────
    # parse
    # ─────────────────────────────────────────────────────────────────────────

    def parse(self, file_path: Union[str, BytesIO]) -> dict:
        raw_df = self.load_dataframe(file_path, header=None)
        return self.procesar(raw_df, file_path)
