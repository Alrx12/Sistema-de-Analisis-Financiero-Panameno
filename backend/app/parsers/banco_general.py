from app.parsers.base import BaseStatementParser


class BancoGeneralParser(BaseStatementParser):
    bank_name = "Banco General"

    def detect_format(self, file_path: str) -> bool:
        filename = file_path.lower()
        if "general" in filename or "bg" in filename:
            return True

        try:
            raw_df = self.load_dataframe(file_path, header=None)
        except Exception:
            return False

        raw_text = raw_df.fillna("").astype(str).to_string().lower()
        indicators = ["banco general", "yappy bg", "ach xpress", "ahorros i"]
        return any(indicator in raw_text for indicator in indicators)

    def parse(self, file_path: str) -> dict[str, object]:
        df = self.load_dataframe(file_path)
        normalized_columns = {str(column).lower().strip(): column for column in df.columns}
        if {"fecha", "descripcion", "debito", "credito"}.issubset(normalized_columns):
            entries: list[dict[str, object]] = []
            last4 = None
            for _, row in df.iterrows():
                debit = self._to_amount(row[normalized_columns["debito"]]) or 0.0
                credit = self._to_amount(row[normalized_columns["credito"]]) or 0.0
                amount = -abs(debit) if debit else abs(credit) if credit else None
                if amount is None:
                    continue
                description = row[normalized_columns["descripcion"]]
                last4 = last4 or self._find_last4(description)
                entries.append(
                    {
                        "date": row[normalized_columns["fecha"]],
                        "description": description,
                        "amount": amount,
                    }
                )
            return self.build_result_from_entries(entries, last4)

        raw_df = self.load_dataframe(file_path, header=None)
        entries = []
        last4 = None
        for idx, row in raw_df.iterrows():
            if idx < 8 or len(row) < 7:
                continue
            debit = self._to_amount(row.iloc[5]) or 0.0
            credit = self._to_amount(row.iloc[6]) or 0.0
            amount = -abs(debit) if debit else abs(credit) if credit else None
            if amount is None:
                continue
            description = row.iloc[4]
            last4 = last4 or self._find_last4(description)
            entries.append({"date": row.iloc[0], "description": description, "amount": amount})

        return self.build_result_from_entries(entries, last4)