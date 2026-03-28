"""add auth features: email verification, 2FA, OAuth social login

Revision ID: j0e7f5g4h3i2
Revises: i9d6e4f3g2h1
Create Date: 2026-03-28

Cambios en la tabla users:
  - password_hash: NOT NULL → nullable (para usuarios de OAuth sin contraseña local)
  - is_verified: nuevo campo booleano (email verificado)
  - totp_secret: secreto TOTP para 2FA (nullable)
  - totp_enabled: 2FA activado (booleano)
  - social_provider: proveedor OAuth ('google' | 'github') (nullable)
  - social_id: ID del usuario en el proveedor OAuth (nullable)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'j0e7f5g4h3i2'
down_revision: Union[str, Sequence[str], None] = 'i9d6e4f3g2h1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Hacer password_hash nullable (usuarios OAuth no tienen contraseña local)
    op.alter_column(
        'users',
        'password_hash',
        existing_type=sa.String(),
        nullable=True,
    )

    # Verificación de email
    op.add_column(
        'users',
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'),
    )

    # 2FA (TOTP)
    op.add_column(
        'users',
        sa.Column('totp_secret', sa.String(64), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('totp_enabled', sa.Boolean(), nullable=False, server_default='false'),
    )

    # OAuth social login
    op.add_column(
        'users',
        sa.Column('social_provider', sa.String(20), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('social_id', sa.String(100), nullable=True),
    )

    # Índice para búsquedas por proveedor + social_id
    op.create_index(
        'ix_users_social_provider_id',
        'users',
        ['social_provider', 'social_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_users_social_provider_id', table_name='users')
    op.drop_column('users', 'social_id')
    op.drop_column('users', 'social_provider')
    op.drop_column('users', 'totp_enabled')
    op.drop_column('users', 'totp_secret')
    op.drop_column('users', 'is_verified')
    op.alter_column(
        'users',
        'password_hash',
        existing_type=sa.String(),
        nullable=False,
    )
