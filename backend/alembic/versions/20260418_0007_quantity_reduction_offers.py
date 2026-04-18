"""quantity reduction offers pending customer approval

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "quantity_reduction_offers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("line_id", sa.Integer(), nullable=False),
        sa.Column("previous_quantity", sa.Integer(), nullable=False),
        sa.Column("proposed_quantity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["line_id"], ["order_lines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_quantity_reduction_offers_order_id", "quantity_reduction_offers", ["order_id"], unique=False)
    op.create_index("ix_quantity_reduction_offers_line_id", "quantity_reduction_offers", ["line_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_quantity_reduction_offers_line_id", table_name="quantity_reduction_offers")
    op.drop_index("ix_quantity_reduction_offers_order_id", table_name="quantity_reduction_offers")
    op.drop_table("quantity_reduction_offers")
