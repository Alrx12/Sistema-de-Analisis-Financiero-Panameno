"""add profile_change_history table

Revision ID: w3x0y8z6a5b4
Revises: v2w9x7y5z4a3
Create Date: 2026-04-23

Registra cambios en campos financieros clave del perfil del usuario:
expected_monthly_income, industry, pets_count, has_pets, dependents_count,
housing_type, employment_type, monthly_debt_payments, financial_goals.

Esto permite saber a partir de qué fecha cambia el comportamiento financiero
del usuario (ej: añadió mascota, cambió empleo, subió su ingreso).
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "w3x0y8z6a5b4"
down_revision = "v2w9x7y5z4a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_change_history",
        sa.Column(
            "change_id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("field_name", sa.String(64), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_profile_change_history_user_id",
        "profile_change_history",
        ["user_id"],
    )
    op.create_index(
        "ix_profile_change_history_changed_at",
        "profile_change_history",
        ["changed_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_profile_change_history_changed_at", table_name="profile_change_history")
    op.drop_index("ix_profile_change_history_user_id", table_name="profile_change_history")
    op.drop_table("profile_change_history")
