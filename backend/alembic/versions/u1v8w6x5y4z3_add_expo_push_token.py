"""add expo_push_token to users

Revision ID: u1v8w6x5y4z3
Revises: t0u7v5w4x3y2
Create Date: 2026-04-23

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "u1v8w6x5y4z3"
down_revision = "t0u7v5w4x3y2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Campo para el token de Expo Push Notifications.
    # Se almacena en formato "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxx]".
    # nullable=True — el token solo existe si el usuario tiene la app móvil
    # y otorgó permisos de notificación.
    op.add_column(
        "users",
        sa.Column("expo_push_token", sa.String(200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "expo_push_token")
