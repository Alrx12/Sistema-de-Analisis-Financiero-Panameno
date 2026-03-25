import uuid
from datetime import datetime, date

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AnalysisTransaction(Base):
    __tablename__ = "analysis_transactions"

    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("analysis_snapshots.snapshot_id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )

    date: Mapped[date | None] = mapped_column(Date, nullable=True)
    detail: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    movement_type: Mapped[str] = mapped_column(String, nullable=False)

    economic_type: Mapped[str | None] = mapped_column(String)
    economic_type_detail: Mapped[str | None] = mapped_column(String)
    subtype_economic: Mapped[str | None] = mapped_column(String)
    budget_category: Mapped[str | None] = mapped_column(String)
    budget_role: Mapped[str | None] = mapped_column(String)

    confidence: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    method: Mapped[str] = mapped_column(String, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )