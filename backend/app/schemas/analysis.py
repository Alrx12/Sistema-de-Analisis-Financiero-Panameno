from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class BankAccountSummary(BaseModel):
    """Info de la cuenta bancaria asociada a un snapshot. Campos mínimos para el frontend."""
    account_id: UUID
    bank_name: str
    account_last4: str | None = None
    nickname: str


class RecommendationItem(BaseModel):
    """
    Una recomendación financiera estructurada.

    type:    severidad — "critical" | "warning" | "info" | "success"
    code:    identificador de máquina (el frontend puede mapear a íconos/colores)
    message: texto legible para el usuario
    data:    dict con datos numéricos opcionales para el frontend
    """
    type: str
    code: str = "unknown"   # default para snapshots guardados antes de que se agregara este campo
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class AnalysisResponse(BaseModel):
    """Schema interno usado por AnalysisService.build_analysis()."""
    total_transactions: int
    total_income: float
    total_expenses: float
    balance: float
    categories: dict[str, float]
    recommendations: list[dict[str, Any]]
    period_start: date | None
    period_end: date | None


class AnalysisSnapshotResponse(BaseModel):
    """Schema de la API — representa un AnalysisSnapshot persistido en DB."""
    snapshot_id: UUID
    created_at: datetime
    period_start: date | None = None
    period_end: date | None = None

    # Cuenta bancaria que originó el análisis (None si el snapshot es pre-migración)
    bank_account: BankAccountSummary | None = None

    # Campos aplanados desde summary JSON para facilitar el consumo del frontend
    total_transactions: int
    total_income: float
    total_expenses: float
    balance: float
    categories: dict[str, float]
    recommendations: list[RecommendationItem]

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, *, bank_account=None, **kwargs):  # type: ignore[override]
        """
        Aplana el campo `summary` del AnalysisSnapshot en los campos del schema.
        `bank_account`: instancia BankAccount ORM opcional para enriquecer la respuesta.
        """
        if hasattr(obj, "summary"):
            summary = obj.summary or {}
            bank_account_data: BankAccountSummary | None = None
            if bank_account is not None:
                bank_account_data = BankAccountSummary(
                    account_id=bank_account.account_id,
                    bank_name=bank_account.bank_name,
                    account_last4=bank_account.account_number_last4,
                    nickname=bank_account.nickname,
                )
            data = {
                "snapshot_id": obj.snapshot_id,
                "created_at": obj.created_at,
                "period_start": obj.period_start,
                "period_end": obj.period_end,
                "bank_account": bank_account_data,
                "total_transactions": summary.get("total_transactions", 0),
                "total_income": summary.get("total_income", 0.0),
                "total_expenses": summary.get("total_expenses", 0.0),
                "balance": summary.get("balance", 0.0),
                "categories": summary.get("categories", {}),
                "recommendations": obj.recommendations or [],
            }
            return cls(**data)
        return super().model_validate(obj, **kwargs)


class ConfidenceStatsResponse(BaseModel):
    """
    Distribución de confianza de las transacciones de un snapshot.
    Sirve para medir qué tan bien está funcionando el KB y si vale la pena seguir entrenando.
    """
    snapshot_id: UUID
    total: int = Field(description="Total de transacciones en el snapshot")

    # Transacciones que el usuario debería revisar
    requires_review_count: int = Field(description="Transacciones con confidence < 0.8")
    requires_review_pct: float = Field(description="Porcentaje de transacciones con confidence < 0.8")

    # Fallback puro: el clasificador no encontró nada y usó el valor por defecto
    fallback_count: int = Field(description="Transacciones clasificadas por fallback (confidence ≤ 0.35)")
    fallback_pct: float = Field(description="Porcentaje de transacciones por fallback")

    avg_confidence: float = Field(description="Confianza promedio de todas las transacciones")

    # Desglose por método de clasificación — útil para saber de dónde viene el conocimiento
    by_method: dict[str, int] = Field(
        description=(
            "Conteo por método: 'kb_personal', 'kb_global', 'builtin', "
            "'user_reclassified', 'fallback', 'other'"
        )
    )


class MerchantStat(BaseModel):
    name: str
    amount: float
    count: int
    category: str | None = None


class TypeStat(BaseModel):
    type: str
    amount: float
    count: int


class MonthTrendStat(BaseModel):
    month: str    # "2025-09" — para ordenar cronológicamente
    label: str    # "Sep 25" — texto para el eje X del gráfico
    income: float
    expenses: float
    transactions: int


class AggregatedSummaryResponse(BaseModel):
    """
    KPIs calculados directamente desde analysis_transactions con filtros opcionales.
    A diferencia de AnalysisSnapshotResponse, refleja el rango exacto de fechas pedido,
    no el período completo del archivo subido.
    """
    total_income: float
    total_expenses: float
    balance: float
    total_transactions: int
    categories: dict[str, float]
    top_merchants: list[MerchantStat] = []
    by_economic_type: list[TypeStat] = []
    monthly_trend: list[MonthTrendStat] = []


class BulkReclassifyRequest(BaseModel):
    skip_user_reclassified: bool = Field(
        default=True,
        description=(
            "Si True (default), las transacciones corregidas manualmente con /reclassify "
            "quedan intactas. False las re-categoriza también con el KB actual."
        ),
    )


class BulkReclassifyResponse(BaseModel):
    snapshot_id: UUID
    total: int = Field(description="Total de transacciones en el snapshot")
    updated: int = Field(description="Transacciones re-categorizadas con el KB actual")
    skipped: int = Field(description="Transacciones omitidas (corregidas manualmente)")
    requires_review: int = Field(description="Transacciones con confidence < 0.8 tras la reclasificación")
