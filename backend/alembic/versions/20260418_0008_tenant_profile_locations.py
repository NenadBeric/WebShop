"""tenant profile, locations, order pickup_location

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tenant_profiles",
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("legal_name", sa.String(length=255), server_default="", nullable=False),
        sa.Column("trade_name", sa.String(length=255), server_default="", nullable=False),
        sa.Column("pib", sa.String(length=32), server_default="", nullable=False),
        sa.Column("mb", sa.String(length=32), server_default="", nullable=False),
        sa.Column("address_line", sa.Text(), server_default="", nullable=False),
        sa.Column("city", sa.String(length=128), server_default="", nullable=False),
        sa.Column("postal_code", sa.String(length=16), server_default="", nullable=False),
        sa.Column("country", sa.String(length=2), server_default="RS", nullable=False),
        sa.Column("phone", sa.String(length=64), server_default="", nullable=False),
        sa.Column("contact_email", sa.String(length=255), server_default="", nullable=False),
        sa.Column("website", sa.String(length=255), server_default="", nullable=False),
        sa.Column("timezone", sa.String(length=64), server_default="Europe/Belgrade", nullable=False),
        sa.Column("terms_note", sa.Text(), server_default="", nullable=False),
        sa.Column("max_schedule_days_ahead", sa.Integer(), server_default="14", nullable=False),
        sa.Column("min_notice_hours_before_pickup", sa.Integer(), server_default="0", nullable=False),
        sa.Column("pickup_grace_hours_after_slot", sa.Integer(), server_default="24", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("tenant_id"),
    )
    op.create_table(
        "tenant_locations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("address_line", sa.Text(), server_default="", nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant_profiles.tenant_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenant_locations_tenant_id", "tenant_locations", ["tenant_id"], unique=False)
    op.create_index(
        "uq_tenant_locations_tenant_code", "tenant_locations", ["tenant_id", "code"], unique=True
    )
    op.add_column(
        "orders",
        sa.Column("pickup_location_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_orders_pickup_location_id",
        "orders",
        "tenant_locations",
        ["pickup_location_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_orders_pickup_location_id", "orders", ["pickup_location_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_orders_pickup_location_id", table_name="orders")
    op.drop_constraint("fk_orders_pickup_location_id", "orders", type_="foreignkey")
    op.drop_column("orders", "pickup_location_id")
    op.drop_index("uq_tenant_locations_tenant_code", table_name="tenant_locations")
    op.drop_index("ix_tenant_locations_tenant_id", table_name="tenant_locations")
    op.drop_table("tenant_locations")
    op.drop_table("tenant_profiles")
