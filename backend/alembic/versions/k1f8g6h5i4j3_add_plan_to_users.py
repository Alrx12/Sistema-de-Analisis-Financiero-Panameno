"""add plan to users

Revision ID: k1f8g6h5i4j3
Revises: j0e7f5g4h3i2
Create Date: 2026-03-30

"""
from alembic import op
import sqlalchemy as sa

revision = 'k1f8g6h5i4j3'
down_revision = 'j0e7f5g4h3i2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'plan',
            sa.String(length=30),
            nullable=False,
            server_default='friends_and_family',
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'plan')
