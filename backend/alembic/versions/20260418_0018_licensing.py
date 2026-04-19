"""license_plans, license_subscriptions, license_addons (kvote po tenantu).

Revision ID: 0018
Revises: 0017
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "license_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("max_pickup_locations", sa.Integer(), nullable=True),
        sa.Column("max_staff_seats", sa.Integer(), nullable=True),
        sa.Column("max_products", sa.Integer(), nullable=True),
        sa.Column("max_orders_per_month", sa.Integer(), nullable=True),
        sa.Column("max_distinct_buyers_30d", sa.Integer(), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_license_plans_code"),
    )
    op.create_index("ix_license_plans_active", "license_plans", ["is_active"])

    op.create_table(
        "license_subscriptions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("billing_cycle", sa.String(length=16), nullable=False),
        sa.Column("discount_percent", sa.Integer(), server_default="0", nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("blocked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("blocked_reason", sa.String(length=255), nullable=True),
        sa.Column("auto_renew", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["license_plans.id"], name="fk_license_subscriptions_plan"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant_profiles.tenant_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_license_subscriptions_tenant", "license_subscriptions", ["tenant_id"])
    op.create_index("ix_license_subscriptions_status", "license_subscriptions", ["status"])

    op.create_table(
        "license_addons",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("subscription_id", sa.Integer(), nullable=False),
        sa.Column("addon_code", sa.String(length=32), nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(
            ["subscription_id"],
            ["license_subscriptions.id"],
            ondelete="CASCADE",
            name="fk_license_addons_subscription",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subscription_id", "addon_code", name="uq_license_addons_sub_code"),
    )
    op.create_index("ix_license_addons_subscription", "license_addons", ["subscription_id"])


def downgrade() -> None:
    op.drop_index("ix_license_addons_subscription", table_name="license_addons")
    op.drop_table("license_addons")
    op.drop_index("ix_license_subscriptions_status", table_name="license_subscriptions")
    op.drop_index("ix_license_subscriptions_tenant", table_name="license_subscriptions")
    op.drop_table("license_subscriptions")
    op.drop_index("ix_license_plans_active", table_name="license_plans")
    op.drop_table("license_plans")
