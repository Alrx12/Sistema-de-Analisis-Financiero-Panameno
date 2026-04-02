"""add stripe fields to users

Revision ID: n4i1j9k8l7m6
Revises: m3h0i8j7k6l5
Create Date: 2026-04-02

Agrega:
  - users.stripe_customer_id   (VARCHAR 100, nullable, unique)
  - users.subscription_expires_at  (TIMESTAMP WITH TIME ZONE, nullable)
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "n4i1j9k8l7m6"
down_revision = "m3h0i8j7k6l5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("stripe_customer_id", sa.String(100), nullable=True),
    )
    op.create_unique_constraint(
        "uq_users_stripe_customer_id",
        "users",
        ["stripe_customer_id"],
    )
    op.add_column(
        "users",
        sa.Column(
            "subscription_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_constraint("uq_users_stripe_customer_id", "users", type_="unique")
    op.drop_column("users", "stripe_customer_id")
    op.drop_column("users", "subscription_expires_at")
