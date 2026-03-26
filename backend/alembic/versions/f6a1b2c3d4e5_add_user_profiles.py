"""add user_profiles table

Revision ID: f6a1b2c3d4e5
Revises: e5b3f8a2c1d9
Create Date: 2026-03-26

Tabla de perfil del usuario: industria, ingreso esperado, metas financieras.
Se crea (o upsertea) después del primer análisis para enriquecer las recomendaciones.
ON DELETE CASCADE: si se borra el usuario, su perfil se borra con él.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f6a1b2c3d4e5"
down_revision = "e5b3f8a2c1d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_profiles",
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("industry", sa.String(), nullable=True),
        sa.Column("expected_monthly_income", sa.Numeric(12, 2), nullable=True),
        sa.Column("financial_goals", postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("profile_id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_user_profiles_user_id", "user_profiles", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_profiles_user_id", table_name="user_profiles")
    op.drop_table("user_profiles")
