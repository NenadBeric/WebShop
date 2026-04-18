"""order_lines: redovne (kataloške) cene po jedinici — snimak za porudžbenicu.

Revision ID: 0017
Revises: 0016
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "order_lines",
        sa.Column("catalog_unit_price_gross", sa.Numeric(12, 2), server_default="0", nullable=False),
    )
    op.add_column(
        "order_lines",
        sa.Column("catalog_unit_price_net", sa.Numeric(12, 2), server_default="0", nullable=False),
    )
    op.execute(
        """
        UPDATE order_lines
        SET catalog_unit_price_gross = unit_price,
            catalog_unit_price_net = unit_price_net
        """
    )


def downgrade() -> None:
    op.drop_column("order_lines", "catalog_unit_price_net")
    op.drop_column("order_lines", "catalog_unit_price_gross")
