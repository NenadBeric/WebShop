"""order client first/last name snapshot

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("client_first_name", sa.String(length=255), server_default="", nullable=False),
    )
    op.add_column(
        "orders",
        sa.Column("client_last_name", sa.String(length=255), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("orders", "client_last_name")
    op.drop_column("orders", "client_first_name")
