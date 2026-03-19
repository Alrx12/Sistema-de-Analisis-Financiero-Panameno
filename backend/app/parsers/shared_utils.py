from typing import Any


def safe_string(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()