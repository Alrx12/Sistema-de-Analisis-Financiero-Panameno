import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ManualWallet(Base):
    """Billetera / cuenta manual definida por el usuario (Tarjeta, Efectivo, etc.)
    Independiente de las bank_accounts detectadas automáticamente en los uploads.
    """
    __tablename__ = "manual_wallets"

    wallet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Nombre visible: "Tarjeta", "Efectivo", "BAC personal", etc.
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Tipo semántico: "card" | "cash" | "savings" | "other"
    wallet_type: Mapped[str] = mapped_column(String(50), nullable=False, default="cash")
    # Nombre del ícono lucide-react (CreditCard, Wallet, Landmark, etc.)
    icon: Mapped[str] = mapped_column(String(50), nullable=False, default="Wallet")
    # Color hexadecimal (#3B82F6)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#6B7280")
    # Saldo actual — el usuario lo ajusta manualmente
    current_balance: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False, default=0.0
    )
    # Billetera por defecto del usuario
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
