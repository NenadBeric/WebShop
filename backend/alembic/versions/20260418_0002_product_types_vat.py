"""product types, VAT prices, order line VAT

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_types",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_product_types_tenant_name"),
    )
    op.create_index("ix_product_types_tenant_id", "product_types", ["tenant_id"], unique=False)

    op.add_column("products", sa.Column("product_type_id", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("vat_rate_percent", sa.Numeric(5, 2), server_default="20", nullable=False))
    op.add_column("products", sa.Column("price_net", sa.Numeric(12, 2), nullable=True))
    op.add_column("products", sa.Column("price_gross", sa.Numeric(12, 2), nullable=True))

    conn = op.get_bind()

    conn.execute(
        sa.text("""
        INSERT INTO product_types (tenant_id, name, sort_order)
        SELECT DISTINCT p.tenant_id, p.product_type, 0
        FROM products p
        WHERE NOT EXISTS (
            SELECT 1 FROM product_types t
            WHERE t.tenant_id = p.tenant_id AND t.name = p.product_type
        )
        """)
    )

    conn.execute(
        sa.text("""
        UPDATE products p
        SET product_type_id = t.id
        FROM product_types t
        WHERE t.tenant_id = p.tenant_id AND t.name = p.product_type
        """)
    )

    conn.execute(
        sa.text("""
        UPDATE products
        SET price_gross = price,
            price_net = ROUND((price / (1 + vat_rate_percent / 100))::numeric, 2)
        WHERE price_gross IS NULL
        """)
    )

    op.alter_column("products", "product_type_id", nullable=False)
    op.alter_column("products", "price_net", nullable=False)
    op.alter_column("products", "price_gross", nullable=False)

    op.create_foreign_key("fk_products_product_type_id", "products", "product_types", ["product_type_id"], ["id"])
    op.create_index("ix_products_product_type_id", "products", ["product_type_id"], unique=False)

    op.drop_column("products", "price")
    op.drop_column("products", "product_type")

    op.add_column("order_lines", sa.Column("unit_price_net", sa.Numeric(12, 2), nullable=True))
    op.add_column("order_lines", sa.Column("vat_rate_percent", sa.Numeric(5, 2), nullable=True))

    conn.execute(
        sa.text("""
        UPDATE order_lines ol
        SET vat_rate_percent = COALESCE(p.vat_rate_percent, 20),
            unit_price_net = COALESCE(p.price_net, ROUND((ol.unit_price / 1.2)::numeric, 2))
        FROM products p
        WHERE p.id = ol.product_id
        """)
    )

    conn.execute(
        sa.text("""
        UPDATE order_lines
        SET vat_rate_percent = 20,
            unit_price_net = ROUND((unit_price / 1.2)::numeric, 2)
        WHERE vat_rate_percent IS NULL
        """)
    )

    op.alter_column("order_lines", "unit_price_net", nullable=False)
    op.alter_column("order_lines", "vat_rate_percent", nullable=False)


def downgrade() -> None:
    op.add_column("products", sa.Column("product_type", sa.String(length=64), nullable=True))
    op.add_column("products", sa.Column("price", sa.Numeric(12, 2), nullable=True))

    conn = op.get_bind()
    conn.execute(
        sa.text("""
        UPDATE products p
        SET product_type = t.name
        FROM product_types t
        WHERE t.id = p.product_type_id
        """)
    )
    conn.execute(sa.text("UPDATE products SET price = price_gross WHERE price IS NULL"))

    op.drop_constraint("fk_products_product_type_id", "products", type_="foreignkey")
    op.drop_index("ix_products_product_type_id", table_name="products")
    op.drop_column("products", "product_type_id")
    op.drop_column("products", "vat_rate_percent")
    op.drop_column("products", "price_net")
    op.drop_column("products", "price_gross")

    op.alter_column("products", "product_type", nullable=False)
    op.alter_column("products", "price", nullable=False)

    op.drop_column("order_lines", "unit_price_net")
    op.drop_column("order_lines", "vat_rate_percent")

    op.drop_index("ix_product_types_tenant_id", table_name="product_types")
    op.drop_table("product_types")
