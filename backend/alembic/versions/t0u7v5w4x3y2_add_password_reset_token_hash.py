"""add password_reset_token_hash to users

Revision ID: t0u7v5w4x3y2
Revises: s9t6u4v3w2x1
Create Date: 2026-04-13

CN-009: Permite invalidar el token de reset de password después de su primer uso.
Sin esta columna, un token interceptado puede reutilizarse dentro de su TTL de 15 min.
"""
from alembic import op
import sqlalchemy as sa

revision = "t0u7v5w4x3y2"
down_revision = "s9t6u4v3w2x1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "password_reset_token_hash",
            sa.String(64),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "password_reset_token_hash")
