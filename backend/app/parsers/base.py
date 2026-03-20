from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Any, Union
from io import BytesIO

import pandas as pd


class BaseStatementParser:
    allowed_extensions = {".csv", ".xls", ".xlsx"}
    bank_name = "Generico"

    default_patterns: dict[str, list[str]] = {
        "suscripciones": ["netflix", "spotify", "disney", "hbo", "amazon prime", "youtube premium"],
        "transferencias": ["transferencia", "transf.", "trf", "cuentas propias", "cuenta propia"],
        "financiero": ["comision", "interes", "seguro", "prestamo", "cartera", "itbms"],
        "supermercado": ["super", "riba smith", "xtra", "99", "market"],
        "transporte": ["uber", "taxi", "transporte", "gasolina"],
    }

    def __init__(self) -> None:
        self.nombre_banco = self.bank_name
        self.patrones_categoria = self.default_patterns.copy()

    def load_dataframe(self, file_path: Union[str, BytesIO], header: int | None = 0) -> pd.DataFrame:
        """Carga un DataFrame desde una ruta de archivo o un objeto file-like (BytesIO).
        
        Soporta:
        - Rutas de archivo (str/Path)
        - BytesIO con atributo .name o .filename
        - FastAPI UploadFile (tiene .file y .filename)
        """
        
        # CASO 1: Es un UploadFile de FastAPI (tiene .file y .filename)
        if hasattr(file_path, 'file') and hasattr(file_path, 'filename'):
            extension = Path(str(file_path.filename)).suffix.lower()
            file_obj = file_path.file
            # Resetear el puntero del archivo
            if hasattr(file_obj, 'seek'):
                file_obj.seek(0)
            
            if extension not in self.allowed_extensions:
                raise ValueError(f"Extension de archivo no soportada: {extension}")
            
            if extension == ".csv":
                return pd.read_csv(file_obj, header=header, dtype=str)
            if extension == ".xlsx":
                return pd.read_excel(file_obj, header=header, dtype=str, engine='openpyxl')
            else:  # .xls
                return pd.read_excel(file_obj, header=header, dtype=str, engine='xlrd')
        
        # CASO 2: Es un objeto BytesIO o file-like simple
        if hasattr(file_path, 'read'):
            # Determinar extensión desde el nombre si está disponible
            if hasattr(file_path, 'name') and file_path.name:
                extension = Path(file_path.name).suffix.lower()
            elif hasattr(file_path, 'filename') and file_path.filename:
                extension = Path(str(file_path.filename)).suffix.lower()
            else:
                # Por defecto, intentar como Excel
                extension = ".xlsx"
            
            if extension not in self.allowed_extensions:
                raise ValueError(f"Extension de archivo no soportada: {extension}")
            
            if extension == ".csv":
                return pd.read_csv(file_path, header=header, dtype=str)
            
            # Para Excel, usar el engine apropiado
            if extension == ".xlsx":
                return pd.read_excel(file_path, header=header, dtype=str, engine='openpyxl')
            else:  # .xls
                return pd.read_excel(file_path, header=header, dtype=str, engine='xlrd')
        
        # CASO 3: Es una ruta de archivo (str o Path)
        extension = Path(str(file_path)).suffix.lower()
        if extension not in self.allowed_extensions:
            raise ValueError(f"Extension de archivo no soportada: {extension}")
        
        if extension == ".csv":
            return pd.read_csv(file_path, header=header, dtype=str)
        
        if extension == ".xlsx":
            return pd.read_excel(file_path, header=header, dtype=str, engine='openpyxl')
        else:  # .xls
            return pd.read_excel(file_path, header=header, dtype=str, engine='xlrd')

    def detect_score(self, file_path: Union[str, BytesIO]) -> float:
        """Detecta si el archivo corresponde a este banco. 
        Acepta tanto rutas como objetos file-like."""
        return 0.0

    def detect_format(self, file_path: Union[str, BytesIO]) -> bool:
        return self.detect_score(file_path) >= 0.7

    def parse(self, file_path: Union[str, BytesIO]) -> dict[str, Any]:
        """Parsea el archivo. Acepta tanto rutas como objetos file-like."""
        df = self.load_dataframe(file_path, header=None)
        if df.empty:
            raise ValueError("El archivo no contiene transacciones")
        
        # Obtener nombre del archivo para metadata
        if hasattr(file_path, 'filename'):
            filename = file_path.filename
        elif hasattr(file_path, 'name'):
            filename = Path(file_path.name).name
        else:
            filename = str(file_path)
        
        return self.procesar(df, filename)

    def extraer_datos(self, df: pd.DataFrame) -> pd.DataFrame:
        normalized_columns = {str(column).lower().strip(): column for column in df.columns}
        date_column = self._find_column(normalized_columns, ["date", "fecha"])
        description_column = self._find_column(normalized_columns, ["description", "descripcion", "detalle"])
        amount_column = self._find_column(normalized_columns, ["amount", "monto", "valor", "importe"])
        
        if not (date_column and description_column and amount_column):
            raise ValueError("No se pudieron identificar columnas suficientes para procesar el archivo")
        
        rows: list[dict[str, Any]] = []
        for _, row in df.iterrows():
            rows.append(
                {
                    "fecha": row.get(date_column),
                    "descripcion": row.get(description_column),
                    "monto": row.get(amount_column),
                }
            )
        return pd.DataFrame(rows)

    def limpiar_monto(self, valor: Any) -> float:
        if valor is None or pd.isna(valor):
            return 0.0
        
        if isinstance(valor, (int, float)):
            return float(valor)
        
        monto_str = str(valor).strip()
        if not monto_str or monto_str.lower() in {"nan", "none", "-", "--"}:
            return 0.0
        
        monto_str = monto_str.replace("$", "").replace(" ", "")
        monto_str = monto_str.replace("CR", "").replace("DB", "").replace("cr", "").replace("db", "")
        
        if "(" in monto_str and ")" in monto_str:
            monto_str = "-" + monto_str.replace("(", "").replace(")", "")
        
        # Caso "$-12.49"
        monto_str = monto_str.replace("$-", "-").replace("-$", "-")
        
        if "," in monto_str and "." in monto_str:
            last_comma = monto_str.rfind(",")
            last_point = monto_str.rfind(".")
            if last_point > last_comma:
                monto_str = monto_str.replace(",", "")
            else:
                monto_str = monto_str.replace(".", "").replace(",", ".")
        elif "," in monto_str:
            if len(monto_str.split(",")[-1]) == 2:
                monto_str = monto_str.replace(",", ".")
            else:
                monto_str = monto_str.replace(",", "")
        
        try:
            return float(monto_str)
        except Exception:
            return 0.0

    def _to_amount(self, valor: Any) -> float:
        return self.limpiar_monto(valor)

    def parsear_fecha(self, fecha_str: Any) -> datetime | None:
        if fecha_str is None or pd.isna(fecha_str):
            return None
        
        if isinstance(fecha_str, datetime):
            return fecha_str
        
        fecha_texto = str(fecha_str).strip()
        if not fecha_texto or fecha_texto.lower() in {"nan", "none"}:
            return None
        
        formatos = [
            "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y",
            "%d-%m-%Y",
            "%Y-%m-%d",
            "%d/%m/%y",
            "%d-%b-%Y",
            "%d %b. %Y",
            "%d %b %Y",
            "%d-%b-%y",
        ]
        
        for fmt in formatos:
            try:
                return datetime.strptime(fecha_texto, fmt)
            except Exception:
                continue
        
        try:
            fecha = pd.to_datetime(fecha_texto, errors="coerce", dayfirst=True)
            if pd.notna(fecha):
                return fecha.to_pydatetime()
        except Exception:
            pass
        
        return None

    def _detectar_metodo_pago(self, descripcion: str) -> str:
        desc_lower = descripcion.lower()
        if "yappy" in desc_lower:
            return "YAPPY"
        if "ach xpress" in desc_lower or "ach xpr" in desc_lower:
            return "ACH XPRESS"
        if "pos compra" in desc_lower or "db pos compra" in desc_lower:
            return "POS"
        if "e-commerce" in desc_lower or "intl mcd cte-usa" in desc_lower:
            return "E-COMMERCE"
        if "transferencia" in desc_lower or "banca movil" in desc_lower:
            return "TRANSFERENCIA"
        return "OTRO"

    def categorizar(self, descripcion: str, monto: float) -> tuple[str, str]:
        desc_lower = descripcion.lower()
        
        if monto > 0 and any(
            word in desc_lower
            for word in ["pago de planilla", "salario", "nomina", "nómina", "deposito", "depósito", "abono", "credito", "crédito", "ach xpr"]
        ):
            return "ingresos", "ingreso"
        
        if any(word in desc_lower for word in ["comision", "comisión", "interes", "interés", "seguro", "prestamo", "préstamo", "cartera", "itbms"]):
            return "financiero", "comision"
        
        for categoria, palabras in self.patrones_categoria.items():
            if any(palabra in desc_lower for palabra in palabras):
                tipo = "egreso" if monto < 0 else "ingreso"
                return categoria, tipo
        
        tipo = "egreso" if monto < 0 else "ingreso"
        return "otros", tipo

    def procesar(self, df: pd.DataFrame, nombre_archivo: str = "") -> dict[str, Any]:
        df_limpio = self.extraer_datos(df)
        if df_limpio is None or df_limpio.empty:
            raise ValueError("No se pudieron extraer transacciones validas del archivo")
        
        transacciones: list[dict[str, Any]] = []
        account_signatures: set[str] = set()
        
        for _, row in df_limpio.iterrows():
            fecha = self.parsear_fecha(row.get("fecha"))
            if fecha is None:
                continue
            
            descripcion = str(row.get("descripcion", "")).strip()
            if not descripcion:
                continue
            
            monto = self.limpiar_monto(row.get("monto"))
            if monto == 0:
                continue
            
            categoria, tipo = self.categorizar(descripcion, monto)
            metodo_pago = self._detectar_metodo_pago(descripcion)
            
            last4 = (
                self._find_last4(row.get("account_number"))
                or self._find_last4(row.get("cuenta"))
                or self._find_last4(row.get("referencia"))
                or self._find_last4(descripcion)
            )
            if last4:
                account_signatures.add(last4)
            
            transacciones.append(
                {
                    "transaction_date": fecha,
                    "description": descripcion,
                    "normalized_description": " ".join(descripcion.lower().split()),
                    "amount": monto,
                    "transaction_type": tipo,
                    "category": categoria,
                    "payment_method": metodo_pago,
                    "source_file": nombre_archivo,
                    "raw_data": row.to_dict(),
                }
            )
        
        if not transacciones:
            raise ValueError("No se pudieron extraer transacciones validas del archivo")
        
        detected_last4 = sorted(account_signatures)[0] if len(account_signatures) == 1 else None
        return {
            "transactions": transacciones,
            "account_signatures": sorted(account_signatures),
            "detected_account_last4": detected_last4,
        }

    @staticmethod
    def _find_column(normalized_columns: dict[str, str], candidates: list[str]) -> str | None:
        for candidate in candidates:
            if candidate in normalized_columns:
                return normalized_columns[candidate]
        return None

    @staticmethod
    def _find_last4(text: Any) -> str | None:
        digits = re.findall(r"\d{4}", str(text or ""))
        return digits[-1] if digits else None