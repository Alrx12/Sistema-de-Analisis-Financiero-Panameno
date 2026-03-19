import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    __table_args__ = (
        UniqueConstraint("user_id", "checksum", name="uq_user_file_checksum"),
    )

    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bank_accounts.account_id", ondelete="SET NULL"))

    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    storage_path: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String, nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    checksum: Mapped[str] = mapped_column(String, nullable=False)

    detected_bank_name: Mapped[str | None] = mapped_column(String, nullable=True)
    detected_account_type: Mapped[str | None] = mapped_column(String, nullable=True)
    detected_account_last4: Mapped[str | None] = mapped_column(String, nullable=True)
    detected_fingerprint: Mapped[str | None] = mapped_column(String, nullable=True)
    detection_confidence: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    status: Mapped[str] = mapped_column(String, nullable=False, default="uploaded")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)