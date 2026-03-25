"""add economic_type_detail drop transaction_category

Revision ID: d7e3f1a2b9c4
Revises: c4f9e2a1d8ab
Create Date: 2026-03-24 19:00:00.000000

Cambios:
  - analysis_transactions: agrega columna economic_type_detail (VARCHAR, nullable)
  - analysis_transactions: elimina columna transaction_category
"""
from alembic import op
import sqlalchemy as sa


revision = "d7e3f1a2b9c4"
down_revision = "c4f9e2a1d8ab"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Agregar columna nueva: tipo económico extendido (salario, comision, impuesto, etc.)
    op.add_column(
        "analysis_transactions",
        sa.Column("economic_type_detail", sa.String(), nullable=True),
    )
    # Eliminar columna obsoleta: Tipo de transacción (fusionada en economic_type_detail)
    op.drop_column("analysis_transactions", "transaction_category")


def downgrade() -> None:
    # Restaurar transaction_category (nullable, sin datos)
    op.add_column(
        "analysis_transactions",
        sa.Column("transaction_category", sa.VARCHAR(), autoincrement=False, nullable=True),
    )
    # Eliminar economic_type_detail
    op.drop_column("analysis_transactions", "economic_type_detail")
