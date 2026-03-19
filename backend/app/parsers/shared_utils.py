from pathlib import Path


def infer_bank_name(filename: str) -> str:
    lowered = Path(filename).name.lower()
    if "banistmo" in lowered:
        return "Banistmo"
    if "bac" in lowered:
        return "BAC Credomatic"
    if "general" in lowered or "bg" in lowered:
        return "Banco General"
    return "Banco no identificado"