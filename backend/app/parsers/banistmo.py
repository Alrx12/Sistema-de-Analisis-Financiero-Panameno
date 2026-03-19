from app.parsers.base import BaseStatementParser


class BanistmoParser(BaseStatementParser):
    bank_name = "Banistmo"

    def detect_format(self, file_path: str) -> bool:
        filename = file_path.lower()
        if "banistmo" in filename:
            return True

        try:
            raw_df = self.load_dataframe(file_path, header=None)
        except Exception:
            return False

        raw_text = raw_df.fillna("").astype(str).to_string().lower()
        indicators = ["banistmo", "db pos compra", "db ach", "db compra e-commerce"]
        return any(indicator in raw_text for indicator in indicators)

    def parse(self, file_path: str) -> dict[str, object]:
        df = self.load_dataframe(file_path)
        normalized_columns = {str(column).lower().strip(): column for column in df.columns}
        if {"fecha", "detalle", "retiro", "deposito"}.issubset(normalized_columns):
            entries: list[dict[str, object]] = []
            last4 = None
            for _, row in df.iterrows():
                retiro = self._to_amount(row[normalized_columns["retiro"]])
                deposito = self._to_amount(row[normalized_columns["deposito"]])
                amount = -abs(retiro) if retiro else abs(deposito) if deposito else None
                if amount is None:
                    continue
                description = row[normalized_columns["detalle"]]
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
        header_row = None
        for idx, row in raw_df.iterrows():
            row_text = " ".join(str(value).lower() for value in row.tolist())
            if "fecha" in row_text and "detalle" in row_text:
                header_row = idx
                break
        if header_row is None:
            header_row = 26

        entries = []
        last4 = None
        for idx in range(header_row + 1, len(raw_df)):
            row = raw_df.iloc[idx]
            if len(row) < 5:
                continue
            retiro = self._to_amount(row.iloc[3])
            deposito = self._to_amount(row.iloc[4])
            amount = -abs(retiro) if retiro else abs(deposito) if deposito else None
            if amount is None:
                continue
            description = row.iloc[2]
            last4 = last4 or self._find_last4(description)
            entries.append({"date": row.iloc[1], "description": description, "amount": amount})

        return self.build_result_from_entries(entries, last4)