from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pandas as pd


class BaseStatementParser:
    allowed_extensions = {".csv", ".xls", ".xlsx"}
    bank_name = "Genérico"

    def load_dataframe(self, file_path: str, header: int | None = 0) -> pd.DataFrame:
        extension = Path(file_path).suffix.lower()
        if extension not in self.allowed_extensions:
            raise ValueError("Extensión de archivo no soportada")
        if extension == ".csv":
            return pd.read_csv(file_path, header=header)
        return pd.read_excel(file_path, header=header)

    def parse(self, file_path: str) -> dict[str, Any]:
        df = self.load_dataframe(file_path)
        if df.empty:
            raise ValueError("El archivo no contiene transacciones")

        normalized_columns = {column.lower().strip(): column for column in df.columns}
        date_column = self._find_column(normalized_columns, ["date", "fecha"])
        description_column = self._find_column(normalized_columns, ["description", "descripcion", "detalle"])
        amount_column = self._find_column(normalized_columns, ["amount", "monto", "valor", "importe"])

        if not (date_column and description_column and amount_column):
            columns = list(df.columns[:3])
            if len(columns) < 3:
                raise ValueError("No se pudieron identificar columnas suficientes para procesar el archivo")
            date_column, description_column, amount_column = columns

        account_column = self._find_column(
            normalized_columns,
            ["account_last4", "last4", "account", "cuenta", "account_number", "numero_cuenta"],
        )
        account_signatures = self._collect_account_signatures(df, account_column)

        parsed: list[dict[str, Any]] = []
        for _, row in df.iterrows():
            amount = pd.to_numeric(row[amount_column], errors="coerce")
            if pd.isna(amount):
                continue
            transaction_date = pd.to_datetime(row[date_column], errors="coerce")
            if pd.isna(transaction_date):
                continue

            description = str(row[description_column]).strip()
            if not description:
                continue

            amount_value = float(amount)
            parsed.append(
                {
                    "transaction_date": transaction_date.to_pydatetime(),
                    "description": description,
                    "normalized_description": " ".join(description.lower().split()),
                    "amount": amount_value,
                    "transaction_type": "credit" if amount_value >= 0 else "debit",
                    "category": self._categorize(description),
                }
            )

        if not parsed:
            raise ValueError("No se pudieron extraer transacciones válidas del archivo")
        return {
            "transactions": parsed,
            "account_signatures": sorted(account_signatures),
            "detected_account_last4": sorted(account_signatures)[0] if len(account_signatures) == 1 else None,
        }

    def detect_format(self, file_path: str) -> bool:
        filename = Path(file_path).name.lower()
        return filename.endswith((".csv", ".xls", ".xlsx"))

    def build_result_from_entries(
        self,
        entries: list[dict[str, Any]],
        detected_account_last4: str | None = None,
    ) -> dict[str, Any]:
        parsed: list[dict[str, Any]] = []
        for entry in entries:
            amount_value = self._to_amount(entry.get("amount"))
            if amount_value is None or amount_value == 0:
                continue

            transaction_date = pd.to_datetime(entry.get("date"), errors="coerce")
            if pd.isna(transaction_date):
                continue

            description = str(entry.get("description", "")).strip()
            if not description:
                continue

            parsed.append(
                {
                    "transaction_date": transaction_date.to_pydatetime(),
                    "description": description,
                    "normalized_description": " ".join(description.lower().split()),
                    "amount": amount_value,
                    "transaction_type": "credit" if amount_value >= 0 else "debit",
                    "category": self._categorize(description),
                }
            )

        if not parsed:
            raise ValueError("No se pudieron extraer transacciones válidas del archivo")

        signatures = {detected_account_last4} if detected_account_last4 else set()
        return {
            "transactions": parsed,
            "account_signatures": sorted(signature for signature in signatures if signature),
            "detected_account_last4": detected_account_last4,
        }

    @staticmethod
    def _find_column(normalized_columns: dict[str, str], candidates: list[str]) -> str | None:
        for candidate in candidates:
            if candidate in normalized_columns:
                return normalized_columns[candidate]
        return None

    @staticmethod
    def _categorize(description: str) -> str:
        lowered = description.lower()
        if any(keyword in lowered for keyword in ["super", "market", "grocery"]):
            return "supermercado"
        if any(keyword in lowered for keyword in ["uber", "taxi", "transporte"]):
            return "transporte"
        if any(keyword in lowered for keyword in ["salario", "nomina", "pago recibido"]):
            return "ingresos"
        return "otros"

    @staticmethod
    def _collect_account_signatures(df: pd.DataFrame, account_column: str | None) -> set[str]:
        if not account_column:
            return set()

        signatures: set[str] = set()
        for value in df[account_column].dropna().tolist():
            digits = re.findall(r"\d{4}", str(value))
            if digits:
                signatures.add(digits[-1])
        return signatures

    @staticmethod
    def _to_amount(value: Any) -> float | None:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        if isinstance(value, str):
            normalized = value.strip().replace(",", "")
            if not normalized:
                return None
            try:
                return float(normalized)
            except ValueError:
                return None
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return None
        return numeric

    @staticmethod
    def _find_last4(text: Any) -> str | None:
        digits = re.findall(r"\d{4}", str(text or ""))
        return digits[-1] if digits else None