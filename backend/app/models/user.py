import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    # Nullable para usuarios de OAuth (Google/GitHub) que no tienen contraseña local
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Verificación de email
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 2FA (TOTP)
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # OAuth social login
    social_provider: Mapped[str | None] = mapped_column(String(20), nullable=True)   # 'google' | 'github'
    social_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Plan de suscripción: 'friends_and_family' | 'free' | 'pro'
    plan: Mapped[str] = mapped_column(String(30), nullable=False, default="friends_and_family")

    # dLocal Go — suscripción activa
    # Almacena el subscription_id devuelto por dLocal Go al suscribirse.
    # Se usa para cancelar o cambiar de plan vía API.
    dlocalgo_subscription_id: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    subscription_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Stripe — LEGACY (no usar para nuevos pagos, conservar para usuarios migrados)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)

    # Administración
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_suspended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )