"""initial tables: users, bank_accounts, uploaded_files

Revision ID: aee0d9a03b5b
Revises:
Create Date: 2026-03-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'aee0d9a03b5b'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('user_id', UUID(as_uuid=True), primary_key=True),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('username', name='uq_users_username'),
        sa.UniqueConstraint('email', name='uq_users_email'),
    )

    # ── bank_accounts ──────────────────────────────────────────────────────────
    op.create_table(
        'bank_accounts',
        sa.Column('account_id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False),
        sa.Column('bank_name', sa.String(), nullable=False),
        sa.Column('account_type', sa.String(), nullable=False),
        sa.Column('nickname', sa.String(), nullable=False),
        sa.Column('account_number_last4', sa.String(), nullable=True),
        sa.Column('detected_account_number', sa.String(), nullable=True),
        sa.Column('account_fingerprint', sa.String(), nullable=False),
        sa.Column('detection_source', sa.String(), nullable=False),
        sa.Column('confidence_score', sa.Numeric(5, 2), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('user_id', 'account_fingerprint', name='uq_user_account_fingerprint'),
    )

    # ── uploaded_files ─────────────────────────────────────────────────────────
    op.create_table(
        'uploaded_files',
        sa.Column('file_id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False),
        sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('bank_accounts.account_id', ondelete='SET NULL'), nullable=True),
        sa.Column('original_filename', sa.String(), nullable=False),
        sa.Column('storage_path', sa.String(), nullable=False),
        sa.Column('mime_type', sa.String(), nullable=True),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('checksum', sa.String(), nullable=False),
        sa.Column('detected_bank_name', sa.String(), nullable=True),
        sa.Column('detected_account_type', sa.String(), nullable=True),
        sa.Column('detected_account_last4', sa.String(), nullable=True),
        sa.Column('detected_fingerprint', sa.String(), nullable=True),
        sa.Column('detection_confidence', sa.Numeric(5, 2), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='uploaded'),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('user_id', 'checksum', name='uq_user_file_checksum'),
    )


def downgrade() -> None:
    op.drop_table('uploaded_files')
    op.drop_table('bank_accounts')
    op.drop_table('users')
