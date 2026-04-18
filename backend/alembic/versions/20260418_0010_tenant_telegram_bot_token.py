"""Per-tenant Telegram bot token (optional; falls back to env TELEGRAM_BOT_TOKEN)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenant_profiles",
        sa.Column("telegram_bot_token", sa.String(length=128), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("tenant_profiles", "telegram_bot_token")
