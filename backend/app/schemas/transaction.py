from typing import Literal

from pydantic import BaseModel, Field


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
        description="Tipo económico de la transacción (gasto, ingreso, transferencia_propia, etc.).",
        examples=["gasto"],
    )
    subtype_economic: str = Field(
        ...,
        description="Subtipo económico (variable, recurrente, interno, financiero, etc.).",
        examples=["variable"],
    )
    transaction_type: str = Field(
        ...,
        description="Tipo de transacción (gasto, ingreso, transferencia, comision, impuesto, reembolso).",
        examples=["gasto"],
    )
    budget_category: str = Field(
        ...,
        description="Categoría de presupuesto (alimentacion, transporte, servicios, etc.).",
        examples=["alimentacion"],
    )
    budget_role: Literal["solo_balance", "presupuestable", "revisar", "gasto_financiero"] = Field(
        ...,
        description=(
            "Rol en el presupuesto: "
            "'solo_balance' = transferencia propia (excluida de totales); "
            "'presupuestable' = ingreso/gasto real; "
            "'revisar' = pendiente de clasificar; "
            "'gasto_financiero' = comisiones/impuestos."
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
