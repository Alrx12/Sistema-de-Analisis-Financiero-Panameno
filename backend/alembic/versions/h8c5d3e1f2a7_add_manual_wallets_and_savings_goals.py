"""add manual_wallets and savings_goals

Revision ID: h8c5d3e1f2a7
Revises: g7b4c9d2e1f6
Create Date: 2026-03-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = 'h8c5d3e1f2a7'
down_revision = 'g7b4c9d2e1f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── manual_wallets ─────────────────────────────────────────────────────────
    op.create_table(
        'manual_wallets',
        sa.Column('wallet_id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True),
                  sa.ForeignKey('users.user_id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('wallet_type', sa.String(50), nullable=False, server_default='cash'),
        sa.Column('icon', sa.String(50), nullable=False, server_default='Wallet'),
        sa.Column('color', sa.String(20), nullable=False, server_default='#6B7280'),
        sa.Column('current_balance', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── savings_goals ──────────────────────────────────────────────────────────
    op.create_table(
        'savings_goals',
        sa.Column('goal_id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True),
                  sa.ForeignKey('users.user_id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('icon', sa.String(50), nullable=False, server_default='Star'),
        sa.Column('color', sa.String(20), nullable=False, server_default='#8B5CF6'),
        sa.Column('target_amount', sa.Numeric(14, 2), nullable=False),
        sa.Column('current_amount', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('deadline', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('savings_goals')
    op.drop_table('manual_wallets')
