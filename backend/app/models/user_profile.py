import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    # Industria laboral — categorías genéricas, nullable
    industry: Mapped[str | None] = mapped_column(String, nullable=True)
    # Ingreso mensual esperado — puede diferir del ingreso detectado en estados de cuenta
    expected_monthly_income: Mapped[float | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    # Metas financieras — lista de strings, ej: ["fondo_emergencia", "ahorro", "deuda"]
    financial_goals: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # Gastos adicionales no reflejados en estados de cuenta (efectivo, otro banco, etc.)
    # null = nunca configurado (muestra modal); [] = configurado pero sin gastos
    manual_expenses: Mapped[list | None] = mapped_column(JSON, nullable=True, default=None)
    # ── Perfil extendido para presupuesto personalizado ──────────────────────────
    # Número de dependientes (hijos, padres a cargo, etc.)
    dependents_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Tipo de vivienda: rent | mortgage | own | family | other
    housing_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Tipo de empleo: employed_fixed | employed_variable | self_employed | business_owner | unemployed | retired
    employment_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Total de pagos mensuales de deuda (préstamos, tarjetas, auto, etc.)
    monthly_debt_payments: Mapped[float | None] = mapped_column(Float, nullable=True)
    # ¿Tiene mascotas? (afecta clasificación de gastos en veterinaria/comida)
    has_pets: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Número de mascotas (0-10) — usado con has_pets para control de ajuste de presupuesto
    pets_count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)

    # Si el usuario completó el flujo de onboarding post-primer-análisis
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
