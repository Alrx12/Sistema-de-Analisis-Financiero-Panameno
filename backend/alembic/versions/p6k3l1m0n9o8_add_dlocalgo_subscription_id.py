"""add_dlocalgo_subscription_id

Agrega dlocalgo_subscription_id a la tabla users.
Almacena el subscription_id de dLocal Go para poder cancelar
o modificar la suscripción del usuario mediante la API.

Revision ID: p6k3l1m0n9o8
Revises: o5j2k0l9m8n7
Create Date: 2026-04-09
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "p6k3l1m0n9o8"
down_revision = "o5j2k0l9m8n7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "dlocalgo_subscription_id",
            sa.String(100),
            nullable=True,
            comment="ID de suscripción en dLocal Go (subscription_id devuelto por la API)",
        ),
    )
    # Índice único — un usuario tiene como máximo una suscripción activa
    op.create_index(
        "ix_users_dlocalgo_subscription_id",
        "users",
        ["dlocalgo_subscription_id"],
        unique=True,
        postgresql_where=sa.text("dlocalgo_subscription_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_users_dlocalgo_subscription_id", table_name="users")
    op.drop_column("users", "dlocalgo_subscription_id")
