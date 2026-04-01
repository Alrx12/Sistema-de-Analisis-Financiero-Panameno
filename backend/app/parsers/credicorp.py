"""Parser para estados de cuenta de Credicorp Bank (Panamá).

Formato: reporte "Detalle de movimientos" exportado desde banca en línea.
Extensión: .xls (formato binario estándar, legible con xlrd).

Estructura del archivo:
  Fila 1:  "Detalle de movimientos"
  Fila 3:  "Credicorp Bank"
  Fila 6:  Fecha Desde (col 8) / Fecha Hasta (col 20)
  Fila 8:  Número de cuenta (col 8) / Fecha Reporte (col 21)
  Fila 11: HEADER → Fecha(1), Hora(3), Transacción(6), Concepto(11),
                    Referencia(16), Retiros(18), Depósitos(23), Saldo(25)
  Fila 12+: transacciones

Señales de detección exclusivas:
  +0.60  "credicorp bank" en cualquier celda (identificador único)
  +0.15  "detalle de movimientos" en cualquier celda
  +0.25  header con "transacción" + "concepto" + "retiros" + "depósitos"
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Union
from io import BytesIO

import pandas as pd

from app.parsers.base import BaseStatementParser


class CredicorpParser(BaseStatementParser):
    bank_name = "Credicorp Bank"

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

            # Señal primaria: nombre del banco — identificador único
            if "credicorp bank" in joined:
                score += 0.60

            # Señal secundaria: título del reporte
            if "detalle de movimientos" in joined:
                score += 0.15

            # Señal del header de columnas
            if (
                ("transacción" in joined or "transaccion" in joined)
                and "concepto" in joined
                and "retiros" in joined
                and ("depósitos" in joined or "depositos" in joined)
            ):
                score += 0.25
                header_found = True

            # Penalizar señales de otros bancos
            # Banistmo: "número:" exclusivo de ese formato
            if "número:" in joined or "numero:" in joined:
                score -= 0.40
                break
            # BAC: referencia + débitos en el header
            if "referencia" in joined and ("débitos" in joined or "debitos" in joined):
                score -= 0.40
                break
            # Banesco: primera columna = "canal"
            if row_values and row_values[0] == "canal":
                score -= 0.40
                break

        return max(0.0, min(score, 1.0))

    # ─────────────────────────────────────────────────────────────────────────
    # extraer_datos
    # ─────────────────────────────────────────────────────────────────────────

    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extrae transacciones del estado de cuenta de Credicorp Bank.

        Layout de columnas (a partir de la fila header):
          col 1:  Fecha (dd/mm/yyyy)
          col 3:  Hora
          col 6:  Transacción (descripción principal)
          col 11: Concepto (descripción secundaria)
          col 16: Referencia
          col 18: Retiros (monto débito — positivo en el archivo)
          col 23: Depósitos (monto crédito — positivo en el archivo)
          col 25: Saldo

        El número de cuenta está en la fila "Cuenta:" → col 8.
        El período está en la fila "Fecha Desde:" → col 8 y col 20.
        """
        try:
            header_row_idx = None
            account_number = None

            # ── Paso 1: encontrar metadata y header ────────────────────────────
            for idx, row in df.iterrows():
                row_values = [str(v).strip() for v in row.tolist()]
                row_lower = [v.lower() for v in row_values]
                joined = " | ".join(row_lower)

                # Número de cuenta: fila con "cuenta:"
                if account_number is None and "cuenta:" in joined:
                    # Col 8 contiene el número de cuenta
                    acct_raw = row_values[8] if len(row_values) > 8 else ""
                    digits = "".join(ch for ch in acct_raw if ch.isdigit())
                    if digits and len(digits) >= 4:
                        account_number = digits[-4:]

                # Header de datos: fila con "transacción" y "concepto"
                if (
                    ("transacción" in joined or "transaccion" in joined)
                    and "concepto" in joined
                    and ("retiros" in joined)
                ):
                    header_row_idx = idx
                    break

            if header_row_idx is None:
                raise ValueError("No se encontró header compatible para Credicorp Bank")

            # ── Paso 2: extraer filas de transacciones ─────────────────────────
            datos = []

            for idx, row in df.iterrows():
                if idx <= header_row_idx:
                    continue

                row_values = [str(v).strip() for v in row.tolist()]

                # Necesitamos al menos 26 columnas (para Saldo en col 25)
                if len(row_values) < 20:
                    continue

                fecha_raw = row_values[1] if len(row_values) > 1 else ""
                transaccion = row_values[6] if len(row_values) > 6 else ""
                concepto = row_values[11] if len(row_values) > 11 else ""
                retiro_raw = row_values[18] if len(row_values) > 18 else ""
                deposito_raw = row_values[23] if len(row_values) > 23 else ""

                # Filtrar filas vacías o de paginación
                if not fecha_raw or fecha_raw.lower() in {"nan", "none", ""}:
                    continue
                # La última fila puede contener "Pag. X de Y"
                if "pag." in fecha_raw.lower() or "pag " in fecha_raw.lower():
                    continue
                # Verificar que sea una fecha válida (dd/mm/yyyy)
                if not re.match(r"\d{1,2}/\d{1,2}/\d{4}", fecha_raw):
                    continue

                # Construir descripción combinando Transacción + Concepto
                transaccion = transaccion if transaccion.lower() not in {"nan", "none", ""} else ""
                concepto = concepto if concepto.lower() not in {"nan", "none", ""} else ""
                descripcion = f"{transaccion} {concepto}".strip() if concepto else transaccion
                if not descripcion:
                    continue

                # Determinar monto: Retiros = débito (negativo), Depósitos = crédito (positivo)
                monto_val = 0.0
                retiro_val = self.limpiar_monto(retiro_raw)
                deposito_val = self.limpiar_monto(deposito_raw)

                if retiro_val != 0:
                    monto_val = -abs(retiro_val)
                elif deposito_val != 0:
                    monto_val = abs(deposito_val)
                else:
                    continue  # Fila sin monto — ignorar

                datos.append(
                    {
                        "fecha": fecha_raw,
                        "descripcion": descripcion,
                        "monto": monto_val,
                        "account_number": account_number,
                    }
                )

            return pd.DataFrame(datos)

        except Exception as e:
            print(f"Error en extraer_datos Credicorp: {e}")
            return pd.DataFrame()

    # ─────────────────────────────────────────────────────────────────────────
    # parse
    # ─────────────────────────────────────────────────────────────────────────

    def parse(self, file_path: Union[str, BytesIO]) -> dict:
        raw_df = self.load_dataframe(file_path, header=None)
        return self.procesar(raw_df, file_path)
