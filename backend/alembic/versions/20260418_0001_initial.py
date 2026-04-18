"""initial webshop schema

Revision ID: 0001
Revises:
Create Date: 2026-04-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "order_sources",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_table(
        "dev_users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=255), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_dev_users_tenant_id", "dev_users", ["tenant_id"], unique=False)

    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("image_url", sa.String(length=2000), nullable=False),
        sa.Column("product_type", sa.String(length=64), nullable=False),
        sa.Column("available", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "replacement_product_ids",
            postgresql.ARRAY(sa.Integer()),
            server_default=sa.text("'{}'::integer[]"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_products_tenant_id", "products", ["tenant_id"], unique=False)
    op.create_index("ix_products_product_type", "products", ["product_type"], unique=False)

    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("order_number", sa.String(length=64), nullable=False),
        sa.Column("client_zitadel_id", sa.String(length=255), nullable=False),
        sa.Column("client_email", sa.String(length=255), server_default="", nullable=False),
        sa.Column("status", sa.String(length=64), server_default="pending_confirm", nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("pickup_mode", sa.String(length=32), nullable=False),
        sa.Column("pickup_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pickup_note", sa.Text(), server_default="", nullable=False),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("preferred_lang", sa.String(length=8), server_default="sr", nullable=False),
        sa.Column("qr_payload", sa.String(length=512), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("external_ref", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["order_sources.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_orders_tenant_id", "orders", ["tenant_id"], unique=False)
    op.create_index("ix_orders_order_number", "orders", ["order_number"], unique=False)
    op.create_index("ix_orders_client_zitadel_id", "orders", ["client_zitadel_id"], unique=False)

    op.create_table(
        "order_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column("substituted_from_product_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["substituted_from_product_id"], ["products.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_lines_order_id", "order_lines", ["order_id"], unique=False)

    op.create_table(
        "substitution_offers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("line_id", sa.Integer(), nullable=False),
        sa.Column("offered_product_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("selected_product_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["line_id"], ["order_lines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["selected_product_id"], ["products.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_substitution_offers_order_id", "substitution_offers", ["order_id"], unique=False)
    op.create_index("ix_substitution_offers_line_id", "substitution_offers", ["line_id"], unique=False)

    op.execute(
        """
        INSERT INTO order_sources (code, display_name, active) VALUES
        ('WEBSHOP', 'WebShop', true),
        ('TRAINIFY', 'Trainify', true)
        """
    )


def downgrade() -> None:
    op.drop_table("substitution_offers")
    op.drop_table("order_lines")
    op.drop_table("orders")
    op.drop_table("products")
    op.drop_table("dev_users")
    op.drop_table("order_sources")
