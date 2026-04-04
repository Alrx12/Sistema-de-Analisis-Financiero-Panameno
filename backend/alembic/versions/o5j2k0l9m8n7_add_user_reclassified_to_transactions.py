"""add user_reclassified to analysis_transactions

Revision ID: o5j2k0l9m8n7
Revises: n4i1j9k8l7m6
Create Date: 2026-04-04

Agrega columna user_reclassified (BOOLEAN DEFAULT FALSE) a analysis_transactions.
Permite medir en Power BI cuántos learns ha aplicado cada usuario directamente
desde la DB, sin depender de analytics.product_events.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'o5j2k0l9m8n7'
down_revision = 'n4i1j9k8l7m6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'analysis_transactions',
        sa.Column(
            'user_reclassified',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )
    # Índice para que Power BI y el backfill de analytics sean rápidos
    op.create_index(
        'ix_analysis_transactions_user_reclassified',
        'analysis_transactions',
        ['user_reclassified'],
        postgresql_where=sa.text('user_reclassified = true'),
    )


def downgrade() -> None:
    op.drop_index('ix_analysis_transactions_user_reclassified', table_name='analysis_transactions')
    op.drop_column('analysis_transactions', 'user_reclassified')
