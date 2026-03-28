import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SavingsGoal(Base):
    """Meta de ahorro del usuario con seguimiento de progreso.
    Ej: "Para un sueño", "Fondo de emergencia", "Viaje a Europa".
    """
    __tablename__ = "savings_goals"

    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Nombre de la meta: "Fondo de emergencia", "iPad", etc.
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Nombre del ícono lucide-react (Star, Home, Plane, Shield, etc.)
    icon: Mapped[str] = mapped_column(String(50), nullable=False, default="Star")
    # Color hexadecimal
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#8B5CF6")
    # Monto objetivo
    target_amount: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False
    )
    # Monto acumulado hasta ahora
    current_amount: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False, default=0.0
    )
    # Fecha límite (opcional)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
