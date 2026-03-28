from __future__ import annotations

import re
from pathlib import Path
from typing import Union
from io import BytesIO

import pandas as pd

from app.parsers.base import BaseStatementParser


class BanescoParser(BaseStatementParser):
    """Parser para estados de cuenta de Banesco Panamá.

    Particularidad crítica:
    Banesco exporta sus estados de cuenta como archivos OOXML (formato xlsx)
    pero con extensión .xls. La clase base usa xlrd para .xls, que no puede
    leer OOXML. Este parser sobreescribe load_dataframe para intentar openpyxl
    primero cuando la extensión es .xls.

    Estructura del archivo:
      Fila 0: vacía
      Fila 1: "Estimado(a)" + fecha del reporte
      Fila 2: nombre del cliente
      Fila 3: "A continuación encontrarás ... terminada en ***XXXX ..."
      Fila 4-5: vacías
      Fila 6: "MOVIMIENTOS DE CUENTA"
      Fila 7: "Número de Cuenta: ***XXXX"
      Fila 8: "BÚSQUEDA POR | Todos"
      Fila 9: HEADER → [CANAL, FECHA, DESCRIPCIÓN, MONTO, SALDO, ...]
      Fila 10+: filas de transacciones
        col 0: Canal (vacío / "Genérico" / "Web")
        col 1: Fecha (DD/MM/YYYY)
        col 2: Descripción
        col 3: Monto (firmado: negativo=débito, positivo=crédito)
        col 4: Saldo

    Señales de detección únicas (structurales, nunca por contenido de tx):
      - Primera columna del header = "CANAL"  ← exclusivo de Banesco
      - Header contiene FECHA + DESCRIPCIÓN + MONTO + SALDO
      - Metadata contiene "BÚSQUEDA POR" y "MOVIMIENTOS DE CUENTA"
    """

    bank_name = "Banesco"

    # ─────────────────────────────────────────────────────────────────────────
    # load_dataframe — manejo especial para .xls OOXML de Banesco
    # ─────────────────────────────────────────────────────────────────────────

    def load_dataframe(
        self, file_path: Union[str, BytesIO], header: int | None = 0
    ) -> pd.DataFrame:
        """Carga el DataFrame, manejando .xls que en realidad es OOXML.

        Banesco exporta OOXML con extensión .xls. xlrd no puede leerlos.
        Intentamos openpyxl primero para archivos .xls; si falla (binario real),
        delegamos al padre que usará xlrd.
        """
        # Detectar extensión
        ext = self._get_extension(file_path)

        if ext == ".xls":
            try:
                # Banesco .xls es OOXML → usar openpyxl
                if hasattr(file_path, "file"):
                    # FastAPI UploadFile
                    file_obj = file_path.file
                    if hasattr(file_obj, "seek"):
                        file_obj.seek(0)
                    return pd.read_excel(file_obj, header=header, dtype=str, engine="openpyxl")
                elif hasattr(file_path, "read"):
                    if hasattr(file_path, "seek"):
                        file_path.seek(0)
                    return pd.read_excel(file_path, header=header, dtype=str, engine="openpyxl")
                else:
                    return pd.read_excel(
                        str(file_path), header=header, dtype=str, engine="openpyxl"
                    )
            except Exception:
                pass  # Caer al comportamiento estándar del padre (xlrd)

        return super().load_dataframe(file_path, header=header)

    @staticmethod
    def _get_extension(file_path) -> str:
        """Extrae la extensión del archivo de cualquier tipo de input."""
        if hasattr(file_path, "filename") and file_path.filename:
            return Path(str(file_path.filename)).suffix.lower()
        if hasattr(file_path, "name") and file_path.name:
            return Path(str(file_path.name)).suffix.lower()
        if isinstance(file_path, (str, Path)):
            return Path(str(file_path)).suffix.lower()
        return ".xls"

    # ─────────────────────────────────────────────────────────────────────────
    # detect_score
    # ─────────────────────────────────────────────────────────────────────────

    def detect_score(self, file_path: Union[str, BytesIO]) -> float:
        """Puntúa la probabilidad de que el archivo sea de Banesco.

        Señales estructurales (nunca usa contenido de transacciones):
          +0.55  Primera columna del header es "CANAL" (exclusivo de Banesco)
          +0.15  Header también contiene "MONTO" (columna de monto firmado)
          +0.05  Header también contiene "SALDO"
          +0.15  Metadata contiene "BÚSQUEDA POR" (texto exclusivo Banesco)
          +0.10  Metadata contiene "MOVIMIENTOS DE CUENTA"

        Penalizaciones por señales estructurales de otros bancos:
          −0.50  Header tiene "RETIRO" y "DEPOSITO/DEPÓSITO" (Banistmo)
          −0.50  Header tiene "REFERENCIA" y "DÉBITOS/DEBITOS" (BAC)
        """
        try:
            raw_df = self.load_dataframe(file_path, header=None)
        except Exception:
            return 0.0

        score = 0.0
        # Revisar solo las primeras 15 filas (metadata + header)
        sample = raw_df.head(15).fillna("").astype(str)
        header_found = False

        for _, row in sample.iterrows():
            row_values = [str(v).strip().lower() for v in row.tolist()]
            joined = " | ".join(row_values)
            first_val = row_values[0] if row_values else ""

            # ── Señal primaria: primera columna del header es "canal" ──────────
            # "Canal" como PRIMERA columna identifica inequívocamente a Banesco.
            # BAC también tiene "Canal" pero en posición 5 (nunca primero).
            if first_val == "canal" and "fecha" in row_values:
                score += 0.55
                header_found = True
                if "monto" in row_values:
                    score += 0.15
                if "saldo" in row_values:
                    score += 0.05
                continue

            # ── Señales en metadata (solo antes del header) ────────────────────
            if not header_found:
                if "búsqueda por" in joined or "busqueda por" in joined:
                    score += 0.15
                if "movimientos de cuenta" in joined:
                    score += 0.10

            # ── Penalizaciones: señales estructurales de otros bancos ──────────
            # IMPORTANTE: no penalizar por contenido de descripciones de tx
            if "retiro" in joined and ("deposito" in joined or "depósito" in joined):
                # Estructura Banistmo: columnas separadas Retiro / Depósito
                score -= 0.50
                break
            if "referencia" in joined and ("débitos" in joined or "debitos" in joined):
                # Estructura BAC: Referencia + Débitos en el mismo header
                score -= 0.50
                break

        return max(0.0, min(score, 1.0))

    # ─────────────────────────────────────────────────────────────────────────
    # extraer_datos
    # ─────────────────────────────────────────────────────────────────────────

    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extrae transacciones del DataFrame de Banesco.

        Layout de columnas (a partir de la fila de header):
          col 0: Canal (ignorar — siempre vacío, 'Genérico' o 'Web')
          col 1: Fecha en formato DD/MM/YYYY
          col 2: Descripción de la transacción
          col 3: Monto firmado (negativo = débito, positivo = crédito)
          col 4: Saldo (ignorar)
        """
        try:
            header_row_idx = None
            account_number = None

            # ── Paso 1: encontrar el header y extraer last4 de los metadatos ──
            for idx, row in df.iterrows():
                row_values = [str(v).strip().lower() for v in row.tolist()]
                first_val = row_values[0] if row_values else ""
                row_text = " ".join(str(v) for v in row.tolist())

                # Extraer los últimos 4 dígitos de la cuenta desde la metadata.
                # Banesco usa el formato "***XXXX" (3 asteriscos + 4 dígitos).
                # Solo buscamos en filas de metadata (antes del header).
                if header_row_idx is None:
                    # Buscar patrón ***XXXX en filas de encabezado
                    match = re.search(r"\*{2,}\s*(\d{4})", row_text)
                    if match:
                        account_number = match.group(1)

                # Header: primera columna = "canal", segunda = "fecha"
                if first_val == "canal" and "fecha" in row_values:
                    header_row_idx = idx
                    break

            if header_row_idx is None:
                raise ValueError("No se encontró header compatible para Banesco")

            # ── Paso 2: extraer filas de transacciones ─────────────────────────
            datos = []

            for idx, row in df.iterrows():
                if idx <= header_row_idx:
                    continue

                if len(row) < 4:
                    continue

                # col 1 = fecha, col 2 = descripción, col 3 = monto
                fecha = row.iloc[1] if len(row) > 1 else None
                descripcion = row.iloc[2] if len(row) > 2 and pd.notna(row.iloc[2]) else ""
                monto_raw = row.iloc[3] if len(row) > 3 and pd.notna(row.iloc[3]) else None

                descripcion_str = str(descripcion).strip()
                if not descripcion_str or descripcion_str.lower() in {"nan", "none", ""}:
                    continue

                # Monto ya viene firmado: negativo → débito, positivo → crédito
                monto_val = self.limpiar_monto(monto_raw)
                if monto_val == 0:
                    continue

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
            print(f"Error en extraer_datos Banesco: {e}")
            return pd.DataFrame()

    # ─────────────────────────────────────────────────────────────────────────
    # parse
    # ─────────────────────────────────────────────────────────────────────────

    def parse(self, file_path: Union[str, BytesIO]) -> dict:
        raw_df = self.load_dataframe(file_path, header=None)
        return self.procesar(raw_df, file_path)
