"""add_paypal_subscription_id

Agrega paypal_subscription_id a la tabla users.
Almacena el subscription_id de PayPal (I-xxxx) para poder cancelar
la suscripción del usuario mediante la API de PayPal Subscriptions.

Revision ID: q7l4m2n1o0p9
Revises: p6k3l1m0n9o8
Create Date: 2026-04-09
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "q7l4m2n1o0p9"
down_revision = "p6k3l1m0n9o8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "paypal_subscription_id",
            sa.String(100),
            nullable=True,
            comment="ID de suscripción en PayPal (I-xxxx devuelto por la API de Subscriptions)",
        ),
    )
    # Índice único parcial — un usuario tiene como máximo una suscripción activa
    op.create_index(
        "ix_users_paypal_subscription_id",
        "users",
        ["paypal_subscription_id"],
        unique=True,
        postgresql_where=sa.text("paypal_subscription_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_users_paypal_subscription_id", table_name="users")
    op.drop_column("users", "paypal_subscription_id")
