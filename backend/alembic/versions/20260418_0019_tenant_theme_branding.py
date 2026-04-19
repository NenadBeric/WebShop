"""tenant_profiles: tema i brend (Trainify-paritet).

Revision ID: 0019
Revises: 0018
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenant_profiles", sa.Column("theme_preset", sa.String(length=32), nullable=True))
    op.add_column("tenant_profiles", sa.Column("primary_color_hex", sa.String(length=16), nullable=True))
    op.add_column("tenant_profiles", sa.Column("theme_border_radius_px", sa.Integer(), nullable=True))
    op.add_column("tenant_profiles", sa.Column("theme_font", sa.String(length=32), nullable=True))
    op.add_column("tenant_profiles", sa.Column("theme_button_hover_hex", sa.String(length=16), nullable=True))
    op.add_column("tenant_profiles", sa.Column("theme_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tenant_profiles", sa.Column("theme_logo_path", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("tenant_profiles", "theme_logo_path")
    op.drop_column("tenant_profiles", "theme_updated_at")
    op.drop_column("tenant_profiles", "theme_button_hover_hex")
    op.drop_column("tenant_profiles", "theme_font")
    op.drop_column("tenant_profiles", "theme_border_radius_px")
    op.drop_column("tenant_profiles", "primary_color_hex")
    op.drop_column("tenant_profiles", "theme_preset")
