"""server-side cart lines per user

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cart_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("client_sub", sa.String(length=255), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "client_sub", "product_id", name="uq_cart_line_user_product"),
    )
    op.create_index("ix_cart_lines_tenant_client", "cart_lines", ["tenant_id", "client_sub"])


def downgrade() -> None:
    op.drop_index("ix_cart_lines_tenant_client", table_name="cart_lines")
    op.drop_table("cart_lines")
