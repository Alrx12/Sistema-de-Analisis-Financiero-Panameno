"""add extended profile fields for personalized budget

Revision ID: m3h0i8j7k6l5
Revises: l2g9h7i6j5k4
Create Date: 2026-04-01

Adds 5 fields to user_profiles that enable personalized 50/30/20 targets:
  - dependents_count   : number of dependents (children, elderly parents)
  - housing_type       : rent | mortgage | own | family | other
  - employment_type    : employed_fixed | employed_variable | self_employed | business_owner | unemployed | retired
  - monthly_debt_payments : total monthly debt obligations in USD
  - has_pets           : boolean
"""
from alembic import op
import sqlalchemy as sa


revision = 'm3h0i8j7k6l5'
down_revision = 'l2g9h7i6j5k4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column('dependents_count', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('user_profiles', sa.Column('housing_type', sa.String(length=32), nullable=True))
    op.add_column('user_profiles', sa.Column('employment_type', sa.String(length=32), nullable=True))
    op.add_column('user_profiles', sa.Column('monthly_debt_payments', sa.Float(), nullable=True))
    op.add_column('user_profiles', sa.Column('has_pets', sa.Boolean(), nullable=True, server_default='false'))


def downgrade() -> None:
    op.drop_column('user_profiles', 'has_pets')
    op.drop_column('user_profiles', 'monthly_debt_payments')
    op.drop_column('user_profiles', 'employment_type')
    op.drop_column('user_profiles', 'housing_type')
    op.drop_column('user_profiles', 'dependents_count')
