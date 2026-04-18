"""tenant SMTP/Telegram settings; order telegram reminder flags

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenant_profiles",
        sa.Column("telegram_chat_id", sa.String(length=64), server_default="", nullable=False),
    )
    op.add_column(
        "tenant_profiles",
        sa.Column("telegram_notify_new_order", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column(
        "tenant_profiles",
        sa.Column("notify_before_pickup_minutes", sa.Integer(), server_default="10", nullable=False),
    )
    op.add_column(
        "tenant_profiles",
        sa.Column("day_reminder_hour_local", sa.Integer(), server_default="8", nullable=False),
    )
    op.add_column(
        "tenant_profiles",
        sa.Column("smtp_host", sa.String(length=255), server_default="", nullable=False),
    )
    op.add_column(
        "tenant_profiles",
        sa.Column("smtp_port", sa.Integer(), server_default="587", nullable=False),
    )
    op.add_column(
        "tenant_profiles",
        sa.Column("smtp_user", sa.String(length=255), server_default="", nullable=False),
    )
    op.add_column(
        "tenant_profiles",
        sa.Column("smtp_password", sa.String(length=255), server_default="", nullable=False),
    )
    op.add_column(
        "tenant_profiles",
        sa.Column("smtp_from", sa.String(length=255), server_default="", nullable=False),
    )
    op.add_column(
        "tenant_profiles",
        sa.Column("smtp_use_tls", sa.Boolean(), server_default="true", nullable=False),
    )

    op.add_column(
        "orders",
        sa.Column("telegram_pickup_reminder_sent", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "orders",
        sa.Column("telegram_day_reminder_sent", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("orders", "telegram_day_reminder_sent")
    op.drop_column("orders", "telegram_pickup_reminder_sent")
    op.drop_column("tenant_profiles", "smtp_use_tls")
    op.drop_column("tenant_profiles", "smtp_from")
    op.drop_column("tenant_profiles", "smtp_password")
    op.drop_column("tenant_profiles", "smtp_user")
    op.drop_column("tenant_profiles", "smtp_port")
    op.drop_column("tenant_profiles", "smtp_host")
    op.drop_column("tenant_profiles", "day_reminder_hour_local")
    op.drop_column("tenant_profiles", "notify_before_pickup_minutes")
    op.drop_column("tenant_profiles", "telegram_notify_new_order")
    op.drop_column("tenant_profiles", "telegram_chat_id")
