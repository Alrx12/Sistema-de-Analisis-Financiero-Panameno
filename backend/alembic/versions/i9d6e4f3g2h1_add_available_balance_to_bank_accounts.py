"""add available_balance to bank_accounts

Revision ID: i9d6e4f3g2h1
Revises: h8c5d3e1f2a7
Create Date: 2026-03-27

"""
from alembic import op
import sqlalchemy as sa

revision = 'i9d6e4f3g2h1'
down_revision = 'h8c5d3e1f2a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'bank_accounts',
        sa.Column('available_balance', sa.Numeric(14, 2), nullable=True, server_default=None),
    )


def downgrade() -> None:
    op.drop_column('bank_accounts', 'available_balance')
