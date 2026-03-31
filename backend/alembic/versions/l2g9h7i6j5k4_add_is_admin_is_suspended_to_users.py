"""add is_admin and is_suspended to users

Revision ID: l2g9h7i6j5k4
Revises: k1f8g6h5i4j3
Create Date: 2026-03-30

"""
from alembic import op
import sqlalchemy as sa

revision = 'l2g9h7i6j5k4'
down_revision = 'k1f8g6h5i4j3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'users',
        sa.Column('is_suspended', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('users', 'is_suspended')
    op.drop_column('users', 'is_admin')
