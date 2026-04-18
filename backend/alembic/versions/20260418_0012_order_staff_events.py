"""Tabela order_staff_events — ko je (recepcija/sistem) obradio akciju na porudžbini.

Revision ID: 0012
Revises: 0011
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "order_staff_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("from_status", sa.String(length=64), nullable=True),
        sa.Column("to_status", sa.String(length=64), nullable=True),
        sa.Column("actor_sub", sa.String(length=255), nullable=True),
        sa.Column("actor_email", sa.String(length=255), server_default="", nullable=False),
        sa.Column("actor_name", sa.String(length=255), server_default="", nullable=False),
        sa.Column(
            "meta",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_staff_events_order_id", "order_staff_events", ["order_id"])
    op.create_index("ix_order_staff_events_tenant_id", "order_staff_events", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_order_staff_events_tenant_id", table_name="order_staff_events")
    op.drop_index("ix_order_staff_events_order_id", table_name="order_staff_events")
    op.drop_table("order_staff_events")
