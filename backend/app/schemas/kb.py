from typing import Any
from pydantic import BaseModel, Field


class KBEntry(BaseModel):
    """Una entrada del KB (exact_match o pattern)."""

    key: str = Field(description="Clave canónica (ej: TRESCUATES, SPOTIFY)")
    economic_type: str | None = None
    economic_type_detail: str | None = None
    subtype_economic: str | None = None
    budget_category: str | None = None
    budget_role: str | None = None
    entry_type: str = Field(default="exact", description="'exact' para exact_match, 'pattern' para regex")


class KBListResponse(BaseModel):
    """Contenido del KB personal del usuario."""

    entries: list[KBEntry] = Field(description="Todas las entradas del KB personal (exact + patterns)")
    patterns_count: int = Field(description="Número de patrones regex en el KB personal")
    corrections_count: int = Field(description="Total de correcciones registradas en el KB personal")
    global_exact_matches_count: int = Field(description="Entradas en el KB global (solo lectura)")
    global_patterns_count: int = Field(description="Patrones en el KB global (solo lectura)")


class KBDeleteResponse(BaseModel):
    """Resultado de borrar una entrada del KB personal."""

    key: str = Field(description="Clave canónica eliminada")
    patterns_removed: int = Field(description="Número de patrones regex asociados también eliminados")


class KBGlobalListResponse(BaseModel):
    """Contenido completo del KB global (read-only)."""

    entries: list[KBEntry] = Field(description="Todas las entradas exact_match del KB global")
    patterns_count: int = Field(description="Número de patrones regex en el KB global")
    corrections_count: int = Field(description="Total de correcciones en el KB global")


class KBPreviewResponse(BaseModel):
    """Resultado de previsualizar la clave canónica que produciría un descriptor raw."""

    original: str = Field(description="El descriptor raw ingresado")
    canonical_key: str = Field(description="La clave canónica que se guardaría en el KB")
    is_ambiguous: bool = Field(
        description="Si True, la clave es demasiado genérica para ser útil en el KB (ej: PAGO, TRANSFERENCIA)"
    )
