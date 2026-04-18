"""order_lines.sale_percent_applied — snimak akcije u trenutku prodaje.

Revision ID: 0016
Revises: 0015
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "order_lines",
        sa.Column("sale_percent_applied", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("order_lines", "sale_percent_applied")
