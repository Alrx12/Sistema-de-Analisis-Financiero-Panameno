"""add analysis transactions

Revision ID: c4f9e2a1d8ab
Revises: b91e024a922a
Create Date: 2026-03-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4f9e2a1d8ab"
down_revision: Union[str, Sequence[str], None] = "b91e024a922a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "analysis_transactions",
        sa.Column("transaction_id", sa.UUID(), nullable=False),
        sa.Column("snapshot_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("detail", sa.String(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("movement_type", sa.String(), nullable=False),
        sa.Column("economic_type", sa.String(), nullable=True),
        sa.Column("subtype_economic", sa.String(), nullable=True),
        sa.Column("transaction_category", sa.String(), nullable=True),
        sa.Column("budget_category", sa.String(), nullable=True),
        sa.Column("budget_role", sa.String(), nullable=True),
        sa.Column("confidence", sa.Numeric(5, 2), nullable=False),
        sa.Column("method", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["snapshot_id"],
            ["analysis_snapshots.snapshot_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.user_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("transaction_id"),
    )

    op.create_index(
        "idx_analysis_transactions_snapshot_id",
        "analysis_transactions",
        ["snapshot_id"],
        unique=False,
    )
    op.create_index(
        "idx_analysis_transactions_user_id",
        "analysis_transactions",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "idx_analysis_transactions_snapshot_confidence",
        "analysis_transactions",
        ["snapshot_id", "confidence"],
        unique=False,
    )
    op.create_index(
        "idx_analysis_transactions_snapshot_created_at",
        "analysis_transactions",
        ["snapshot_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_analysis_transactions_snapshot_created_at",
        table_name="analysis_transactions",
    )
    op.drop_index(
        "idx_analysis_transactions_snapshot_confidence",
        table_name="analysis_transactions",
    )
    op.drop_index(
        "idx_analysis_transactions_user_id",
        table_name="analysis_transactions",
    )
    op.drop_index(
        "idx_analysis_transactions_snapshot_id",
        table_name="analysis_transactions",
    )
    op.drop_table("analysis_transactions")