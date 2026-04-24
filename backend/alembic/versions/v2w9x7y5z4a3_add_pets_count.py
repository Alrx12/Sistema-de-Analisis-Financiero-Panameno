"""add pets_count to user_profiles

Revision ID: v2w9x7y5z4a3
Revises: u1v8w6x5y4z3
Create Date: 2026-04-24

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "v2w9x7y5z4a3"
down_revision = "u1v8w6x5y4z3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Campo para contar mascotas (0-10).
    # Valores: 0 = sin mascotas, 1-10 = número de mascotas.
    # Se usa junto con has_pets para controlar si el usuario tiene mascotas.
    op.add_column(
        "user_profiles",
        sa.Column("pets_count", sa.Integer(), nullable=True, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("user_profiles", "pets_count")
