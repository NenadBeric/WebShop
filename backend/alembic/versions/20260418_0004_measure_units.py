"""measure units + product quantity and measure_unit_id

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "measure_units",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_measure_units_tenant_name"),
    )
    op.create_index(op.f("ix_measure_units_tenant_id"), "measure_units", ["tenant_id"], unique=False)

    conn = op.get_bind()
    conn.execute(
        sa.text("""
            INSERT INTO measure_units (tenant_id, name, sort_order)
            SELECT DISTINCT x.tenant_id, 'kom', 0
            FROM (
                SELECT tenant_id FROM products
                UNION
                SELECT tenant_id FROM product_types
            ) AS x
            WHERE NOT EXISTS (
                SELECT 1 FROM measure_units mu
                WHERE mu.tenant_id = x.tenant_id AND mu.name = 'kom'
            )
        """)
    )

    op.add_column("products", sa.Column("measure_unit_id", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("quantity", sa.Numeric(12, 4), server_default="1", nullable=False))
    op.create_foreign_key(
        "fk_products_measure_unit_id",
        "products",
        "measure_units",
        ["measure_unit_id"],
        ["id"],
    )

    conn.execute(
        sa.text("""
            UPDATE products AS p
            SET measure_unit_id = m.id
            FROM measure_units AS m
            WHERE m.tenant_id = p.tenant_id AND m.name = 'kom'
        """)
    )
    conn.execute(
        sa.text("""
            UPDATE products
            SET measure_unit_id = (
                SELECT m.id FROM measure_units m
                WHERE m.tenant_id = products.tenant_id
                ORDER BY m.id LIMIT 1
            )
            WHERE measure_unit_id IS NULL
        """)
    )

    op.alter_column("products", "measure_unit_id", existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    op.drop_constraint("fk_products_measure_unit_id", "products", type_="foreignkey")
    op.drop_column("products", "quantity")
    op.drop_column("products", "measure_unit_id")
    op.drop_index(op.f("ix_measure_units_tenant_id"), table_name="measure_units")
    op.drop_table("measure_units")
