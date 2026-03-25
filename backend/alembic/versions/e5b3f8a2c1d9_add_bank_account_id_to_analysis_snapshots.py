"""add bank_account_id to analysis_snapshots

Revision ID: e5b3f8a2c1d9
Revises: d7e3f1a2b9c4
Create Date: 2026-03-25

Vincula cada análisis con la cuenta bancaria que lo originó.
Nullable + ON DELETE SET NULL: si se elimina la cuenta, los snapshots
históricos se conservan con bank_account_id=NULL en lugar de borrarse.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e5b3f8a2c1d9"
down_revision = "d7e3f1a2b9c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "analysis_snapshots",
        sa.Column(
            "bank_account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bank_accounts.account_id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_analysis_snapshots_bank_account_id",
        "analysis_snapshots",
        ["bank_account_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_analysis_snapshots_bank_account_id", table_name="analysis_snapshots")
    op.drop_column("analysis_snapshots", "bank_account_id")
