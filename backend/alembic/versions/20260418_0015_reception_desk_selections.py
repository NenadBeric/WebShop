"""Tabela reception_desk_selections — lokacija pulta za WEBSHOP_RECEPTION.

Revision ID: 0015
Revises: 0014
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reception_desk_selections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("user_sub", sa.String(length=255), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["location_id"], ["tenant_locations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "user_sub", name="uq_reception_desk_tenant_sub"),
    )
    op.create_index("ix_reception_desk_selections_tenant_id", "reception_desk_selections", ["tenant_id"], unique=False)
    op.create_index("ix_reception_desk_selections_user_sub", "reception_desk_selections", ["user_sub"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_reception_desk_selections_user_sub", table_name="reception_desk_selections")
    op.drop_index("ix_reception_desk_selections_tenant_id", table_name="reception_desk_selections")
    op.drop_table("reception_desk_selections")
