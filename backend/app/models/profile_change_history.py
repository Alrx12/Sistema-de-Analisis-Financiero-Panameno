"""
ProfileChangeHistory — registro de cambios en campos financieros clave del perfil.

Cada vez que el usuario modifica un campo relevante para el presupuesto
(industria, ingreso, mascotas, dependientes, tipo de vivienda, etc.)
se guarda una fila con el valor anterior y el nuevo.

Esto permite:
  1. Saber a partir de qué fecha cambia el comportamiento financiero del usuario.
  2. Ajustar comparaciones históricas (antes/después del cambio de mascota,
     de empleo, etc.) en el motor de recomendaciones.
  3. Mostrar al usuario "tu presupuesto cambió el 15/03 porque añadiste 1 mascota."
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


# Campos del perfil cuya modificación se registra en el historial.
# Cualquier campo fuera de esta lista se ignora silenciosamente.
TRACKED_PROFILE_FIELDS: set[str] = {
    "expected_monthly_income",
    "industry",
    "pets_count",
    "has_pets",
    "dependents_count",
    "housing_type",
    "employment_type",
    "monthly_debt_payments",
    "financial_goals",
}


class ProfileChangeHistory(Base):
    __tablename__ = "profile_change_history"

    change_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Nombre del campo que cambió (ej: "expected_monthly_income", "pets_count")
    field_name: Mapped[str] = mapped_column(String(64), nullable=False)
    # Valor anterior — serializado como JSON string (None = campo nunca había sido configurado)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Valor nuevo — serializado como JSON string
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Cuándo ocurrió el cambio
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
