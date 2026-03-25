from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.analysis_transaction import AnalysisTransactionResponse


class LearnRequest(BaseModel):
    """Cuerpo de POST /transactions/learn — corrige/enseña una categorización al KB personal."""

    detail: str = Field(
        ...,
        min_length=1,
        description="Texto exacto del campo 'Detalle' como aparece en el estado de cuenta.",
        examples=["SUPER XTRA TRANSISTMICA"],
    )
    economic_type: str = Field(
        ...,
        description=(
            "Tipo económico general — 6 valores: "
            "ingreso, gasto, cargo_financiero, transferencia_propia, transferencia_tercero, reembolso."
        ),
        examples=["gasto"],
    )
    economic_type_detail: str | None = Field(
        default=None,
        description=(
            "Tipo económico extendido — preserva granularidad: "
            "salario, otros_ingresos, gasto_variable, gasto_recurrente, "
            "comision, impuesto, cargo_bancario, transferencia_propia, transferencia_tercero, reembolso."
        ),
        examples=["salario"],
    )
    subtype_economic: str | None = Field(
        default=None,
        description=(
            "Subtipo económico. Se auto-detecta por frecuencia durante el análisis. "
            "Valores: recurrente, extraordinario, financiero, interno, variable, desconocido."
        ),
        examples=["recurrente"],
    )
    budget_category: str = Field(
        ...,
        description="Categoría de presupuesto (alimentacion, transporte, servicios, etc.).",
        examples=["alimentacion"],
    )
    budget_role: Literal[
        "solo_balance",
        "presupuestable",
        "no_presupuestable",
        "gasto_operativo",
        "gasto_financiero",
        "ahorro_inversion",
        "revisar",
    ] = Field(
        ...,
        description=(
            "Rol en el presupuesto: "
            "'solo_balance' = transferencia propia (excluida de totales); "
            "'presupuestable' = ingreso/gasto planificado; "
            "'no_presupuestable' = gasto real pero fuera del presupuesto (ej. extraordinario); "
            "'gasto_operativo' = gasto operativo recurrente; "
            "'gasto_financiero' = comisiones/impuestos; "
            "'ahorro_inversion' = ahorro o inversión; "
            "'revisar' = pendiente de clasificar."
        ),
    )
    weight: float = Field(
        default=2.0,
        gt=0,
        le=10.0,
        description="Peso del ejemplo de aprendizaje. Usa 2.0 para correcciones explícitas del usuario.",
    )
    force_personal: bool = Field(
        default=False,
        description=(
            "Si True, guarda en el KB personal aunque el detalle contenga keywords globales "
            "(útil para comercios que el usuario quiere categorizar diferente a la categoría global)."
        ),
    )


class LearnResponse(BaseModel):
    """Respuesta de POST /transactions/learn."""

    message: str
    detail_learned: str
    kb_target: str = Field(description="'personal' o 'global' — KB donde se guardó el ejemplo.")
    personal_exact_matches: int = Field(description="Total de exact_matches en el KB personal tras el aprendizaje.")
    personal_patterns: int = Field(description="Total de patrones en el KB personal tras el aprendizaje.")


# ──────────────────────────────────────────────────────────────
#  Reclassify
# ──────────────────────────────────────────────────────────────

_BUDGET_ROLE = Literal[
    "solo_balance",
    "presupuestable",
    "no_presupuestable",
    "gasto_operativo",
    "gasto_financiero",
    "ahorro_inversion",
    "revisar",
]


class ReclassifyRequest(BaseModel):
    """
    Cuerpo de POST /transactions/{transaction_id}/reclassify.

    Corrige la categorización de una transacción ya guardada en la DB.
    Opcionalmente, también enseña al KB para que futuras transacciones
    similares se clasifiquen correctamente de forma automática.
    """

    economic_type: str = Field(
        ...,
        description=(
            "Tipo económico general — 6 valores: "
            "ingreso, gasto, cargo_financiero, transferencia_propia, transferencia_tercero, reembolso."
        ),
        examples=["gasto"],
    )
    economic_type_detail: str | None = Field(
        default=None,
        description=(
            "Tipo económico extendido — preserva granularidad: "
            "salario, otros_ingresos, gasto_variable, gasto_recurrente, "
            "comision, impuesto, cargo_bancario, transferencia_propia, transferencia_tercero, reembolso."
        ),
        examples=["gasto_variable"],
    )
    subtype_economic: str | None = Field(
        default=None,
        description="Subtipo económico (recurrente, extraordinario, financiero, interno, variable).",
        examples=["recurrente"],
    )
    budget_category: str = Field(
        ...,
        description="Categoría de presupuesto (alimentacion, transporte, servicios, restaurantes, etc.).",
        examples=["restaurantes"],
    )
    budget_role: _BUDGET_ROLE = Field(
        ...,
        description=(
            "Rol en el presupuesto: "
            "'solo_balance' = transferencia propia (excluida de totales); "
            "'presupuestable' = ingreso/gasto planificado; "
            "'no_presupuestable' = gasto real pero fuera del presupuesto; "
            "'gasto_operativo' = operativo recurrente; "
            "'gasto_financiero' = comisiones/impuestos; "
            "'ahorro_inversion' = ahorro o inversión; "
            "'revisar' = pendiente de clasificar."
        ),
    )
    also_learn: bool = Field(
        default=True,
        description=(
            "Si True (default), guarda la corrección en el KB para que el sistema aprenda. "
            "Si False, solo actualiza el registro en la DB sin modificar el KB."
        ),
    )
    force_personal: bool = Field(
        default=False,
        description=(
            "Aplica solo si also_learn=True. "
            "Si True, fuerza guardar en el KB personal aunque el detalle contenga keywords globales."
        ),
    )
    weight: float = Field(
        default=2.0,
        gt=0,
        le=10.0,
        description="Peso del ejemplo de aprendizaje. Usa 2.0 para correcciones explícitas del usuario.",
    )


class ReclassifyResponse(BaseModel):
    """Respuesta de POST /transactions/{transaction_id}/reclassify."""

    transaction: AnalysisTransactionResponse = Field(
        description="Transacción actualizada con la nueva clasificación y confidence=1.0."
    )
    learned: bool = Field(
        description="True si se guardó el ejemplo en el KB (also_learn=True y operación exitosa)."
    )
    detail_learned: str | None = Field(
        default=None,
        description="Clave canónica guardada en el KB. None si learned=False.",
    )
    kb_target: str | None = Field(
        default=None,
        description="'personal' o 'global'. None si learned=False.",
    )
    personal_exact_matches: int | None = Field(
        default=None,
        description="Total de exact_matches en el KB personal tras el aprendizaje.",
    )
    personal_patterns: int | None = Field(
        default=None,
        description="Total de patrones en el KB personal tras el aprendizaje.",
    )
