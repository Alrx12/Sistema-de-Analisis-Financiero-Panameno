"""add manual_expenses to user_profiles

Revision ID: g7b4c9d2e1f6
Revises: f6a1b2c3d4e5
Create Date: 2026-03-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

# revision identifiers, used by Alembic.
revision = 'g7b4c9d2e1f6'
down_revision = 'f6a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'user_profiles',
        sa.Column('manual_expenses', JSON, nullable=True, server_default=None),
    )


def downgrade() -> None:
    op.drop_column('user_profiles', 'manual_expenses')
