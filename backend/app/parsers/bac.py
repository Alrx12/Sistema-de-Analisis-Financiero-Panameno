from app.parsers.base import BaseStatementParser


class BacParser(BaseStatementParser):
    bank_name = "BAC Credomatic"

    def detect_format(self, file_path: str) -> bool:
        filename = file_path.lower()
        if "bac" in filename or "credomatic" in filename:
            return True

        try:
            raw_df = self.load_dataframe(file_path, header=None)
        except Exception:
            return False

        raw_text = raw_df.fillna("").astype(str).to_string().lower()
        indicators = ["bac credomatic", "detalle de movimientos", "débitos", "créditos"]
        return any(indicator in raw_text for indicator in indicators)

    def parse(self, file_path: str) -> dict[str, object]:
        raw_df = self.load_dataframe(file_path, header=None)
        header_row = None
        column_map: dict[str, int] = {}

        for idx in range(min(20, len(raw_df))):
            row = raw_df.iloc[idx]
            row_text = " ".join(str(value).lower() for value in row.tolist())
            if any(keyword in row_text for keyword in ["débitos", "debitos", "créditos", "creditos", "descripción", "descripcion"]):
                header_row = idx
                for col_idx, value in enumerate(row):
                    value_text = str(value).lower().strip()
                    if "fecha" in value_text:
                        column_map["date"] = col_idx
                    elif "descripción" in value_text or "descripcion" in value_text or "concepto" in value_text:
                        column_map["description"] = col_idx
                    elif "débitos" in value_text or "debitos" in value_text:
                        column_map["debit"] = col_idx
                    elif "créditos" in value_text or "creditos" in value_text:
                        column_map["credit"] = col_idx
                    elif "referencia" in value_text or "codigo" in value_text:
                        column_map["reference"] = col_idx
                break

        if header_row is None:
            header_row = 12
            column_map = {"date": 0, "description": 4, "debit": 7, "credit": 8, "reference": 3}

        entries: list[dict[str, object]] = []
        last4 = None
        for idx in range(header_row + 1, len(raw_df)):
            row = raw_df.iloc[idx]
            debit = self._to_amount(row.iloc[column_map["debit"]]) if column_map.get("debit") is not None else None
            credit = self._to_amount(row.iloc[column_map["credit"]]) if column_map.get("credit") is not None else None
            amount = -abs(debit) if debit else abs(credit) if credit else None
            if amount is None:
                continue
            description = row.iloc[column_map["description"]]
            reference = row.iloc[column_map["reference"]] if column_map.get("reference") is not None else ""
            last4 = last4 or self._find_last4(description) or self._find_last4(reference)
            entries.append(
                {
                    "date": row.iloc[column_map["date"]],
                    "description": description,
                    "amount": amount,
                }
            )

        return self.build_result_from_entries(entries, last4)