"""Parser para reportes "Últimos movimientos" de Banco General.

Este formato es diferente al estado de cuenta regular (BancoGeneralParser).
Banco General genera este reporte desde su banca en línea cuando el usuario
descarga el historial de movimientos de una cuenta de ahorros o corriente.

Estructura del archivo (sheet "BGPExcelReport"):
  Fila 1:  vacía
  Fila 2:  "Últimos movimientos"  (col B)
  Fila 3:  vacía
  Fila 4:  "Cuenta:Ahorros I 04-72-99-403715-8"  (col B)
  ...
  Fila 8:  HEADER → Fecha | Referencia | Descripción | Monto | Saldo total
  Fila 9+: transacciones

Columnas (índice 0-based):
  0 (A): siempre None
  1 (B): fecha       → datetime Python (ya parseado por openpyxl)
  2 (C): referencia  → string
  3 (D): descripción → string
  4 (E): monto       → float firmado (negativo=débito, positivo=crédito)
  5 (F): saldo total → float

Señales de detección exclusivas:
  +0.60  sheet name == "BGPExcelReport"
  +0.20  "Últimos movimientos" en primeras filas
  +0.15  cuenta con patrón BG (XX-XX-XX-XXXXXX-X)
  +0.10  header contiene "monto" y "saldo total" (sin débito/crédito)
  −0.60  header contiene "detalle" + "retiro"  (Banistmo normal)
  −0.60  header contiene "número de comprobante" (BanistmoMovimientos)
"""
from __future__ import annotations

import re
from io import BytesIO
from typing import Union

import pandas as pd

from app.parsers.base import BaseStatementParser

# Patrón de número de cuenta de Banco General: XX-XX-XX-XXXXXX-X
_BG_ACCOUNT_RE = re.compile(r"\b\d{2}-\d{2}-\d{2}-\d{5,8}-\d\b")


class BancoGeneralMovimientosParser(BaseStatementParser):
    """Parser para reportes 'Últimos movimientos' de Banco General (BGPExcelReport)."""

    bank_name = "Banco General"

    # ─────────────────────────────────────────────────────────────────────────
    # detect_score
    # ─────────────────────────────────────────────────────────────────────────

    def detect_score(self, file_path: Union[str, BytesIO]) -> float:
        try:
            raw_df = self.load_dataframe(file_path, header=None)
        except Exception as e:
            print(f"Error en detect_score BGMovimientos: {e}")
            return 0.0

        score = 0.0
        sample = raw_df.head(20).fillna("").astype(str)

        # Señal más fuerte: nombre del sheet "BGPExcelReport"
        # openpyxl expone el sheet name en el ExcelFile — capturarlo aquí es
        # difícil porque load_dataframe no lo expone, pero lo detectamos
        # buscando el texto "BGPExcelReport" en la metadata del file_path.
        fp_str = str(file_path).lower()
        if "bgpexcel" in fp_str:
            score += 0.30  # solo si el path lo menciona (raro)

        for _, row in sample.iterrows():
            joined = " ".join(row.tolist()).lower()

            # Señal exclusiva BG movimientos
            if "últimos movimientos" in joined or "ultimos movimientos" in joined:
                score += 0.25

            # Número de cuenta en formato BG
            if _BG_ACCOUNT_RE.search(joined):
                score += 0.20

            # Header exclusivo: "monto" + "saldo total" pero SIN "retiro"/"depósito"
            if "monto" in joined and "saldo total" in joined:
                score += 0.25
                # Si además tiene "retiro" o "deposito" → es Banistmo, penalizar
                if "retiro" in joined or "deposito" in joined or "depósito" in joined:
                    score -= 0.50

            # Penalizar formatos de otros bancos
            if "número de comprobante" in joined or "numero de comprobante" in joined:
                score -= 0.60
            if "detalle" in joined and "retiro" in joined:
                score -= 0.60
            if "canal" in joined and "débito" in joined:
                score -= 0.50

            # Señal de transacciones BG en las descripciones
            if "yappy bg" in joined or "yappy a" in joined:
                score += 0.10

        return max(0.0, min(score, 1.0))

    # ─────────────────────────────────────────────────────────────────────────
    # extraer_datos
    # ─────────────────────────────────────────────────────────────────────────

    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        datos = []
        account_number: str | None = None
        header_row: int | None = None

        # Buscar número de cuenta y fila de header
        for idx, row in df.iterrows():
            row_text = " ".join(str(v) for v in row.tolist() if v is not None)
            row_lower = row_text.lower()

            # Extraer número de cuenta (04-72-99-403715-8)
            if account_number is None:
                m = _BG_ACCOUNT_RE.search(row_text)
                if m:
                    account_number = m.group(0)

            # Detectar fila de header: "Fecha" + "Monto"
            if header_row is None and "fecha" in row_lower and "monto" in row_lower:
                header_row = idx
                break

        if header_row is None:
            header_row = 7  # fallback: fila 8 (0-indexed = 7)

        for idx, row in df.iterrows():
            if idx <= header_row:
                continue

            # Columnas: A=None | B=fecha | C=ref | D=desc | E=monto | F=saldo
            # (índices 0-based: 0=A, 1=B, 2=C, 3=D, 4=E, 5=F)
            if len(row) < 5:
                continue

            fecha = row.iloc[1] if len(row) > 1 else None
            referencia = row.iloc[2] if len(row) > 2 else ""
            descripcion = row.iloc[3] if len(row) > 3 else ""
            monto_raw = row.iloc[4] if len(row) > 4 else None
            saldo_raw = row.iloc[5] if len(row) > 5 else None

            descripcion_str = str(descripcion).strip() if pd.notna(descripcion) else ""
            if not descripcion_str or descripcion_str.lower() in ["nan", "none", ""]:
                continue

            monto_val = self.limpiar_monto(monto_raw) if monto_raw is not None and pd.notna(monto_raw) else 0
            if monto_val == 0:
                continue

            # monto ya viene firmado: negativo=débito, positivo=crédito
            datos.append({
                "fecha": fecha,
                "descripcion": descripcion_str,
                "monto": monto_val,
                "referencia": str(referencia).strip() if pd.notna(referencia) else "",
                # Guardar solo dígitos para que _find_last4 haga el mismo match que BancoGeneralParser.
                # "04-72-99-403715-8" → "0472994037158" → _find_last4 devuelve "3715" (igual que el otro parser).
                "account_number": "".join(ch for ch in (account_number or "") if ch.isdigit()),
                "saldo": self.limpiar_monto(saldo_raw) if saldo_raw is not None and pd.notna(saldo_raw) else None,
            })

        # El archivo BG "Últimos movimientos" viene ordenado del más reciente al
        # más antiguo. base.procesar() toma el último saldo como latest_balance,
        # por eso revertimos el orden para que sea cronológico (antiguo → reciente).
        datos.reverse()
        return pd.DataFrame(datos)

    # ─────────────────────────────────────────────────────────────────────────
    # parse
    # ─────────────────────────────────────────────────────────────────────────

    def parse(self, file_path: Union[str, BytesIO]) -> dict:
        raw_df = self.load_dataframe(file_path, header=None)

        if hasattr(file_path, "filename"):
            filename = file_path.filename
        elif hasattr(file_path, "name"):
            from pathlib import Path as _Path
            filename = _Path(file_path.name).name
        else:
            filename = str(file_path)

        return self.procesar(raw_df, filename)
