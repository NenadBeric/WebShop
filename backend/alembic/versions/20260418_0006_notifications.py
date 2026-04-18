"""in-app notifications for orders

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("audience", sa.String(length=20), nullable=False),
        sa.Column("recipient_sub", sa.String(length=255), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_tenant_id", "notifications", ["tenant_id"], unique=False)
    op.create_index("ix_notifications_audience", "notifications", ["audience"], unique=False)
    op.create_index("ix_notifications_recipient_sub", "notifications", ["recipient_sub"], unique=False)
    op.create_index("ix_notifications_order_id", "notifications", ["order_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_notifications_order_id", table_name="notifications")
    op.drop_index("ix_notifications_recipient_sub", table_name="notifications")
    op.drop_index("ix_notifications_audience", table_name="notifications")
    op.drop_index("ix_notifications_tenant_id", table_name="notifications")
    op.drop_table("notifications")
