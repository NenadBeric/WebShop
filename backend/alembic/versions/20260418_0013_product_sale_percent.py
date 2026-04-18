"""Kolona products.sale_percent — akcija u procentima (kataloška cena se ne menja).

Revision ID: 0013
Revises: 0012
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("sale_percent", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("products", "sale_percent")
