"""AI chat sesije i poruke za menadžment (izveštaji).

Revision ID: 0011
Revises: 0010
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_chat_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("owner_sub", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=120), server_default="", nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_chat_sessions_tenant_owner", "ai_chat_sessions", ["tenant_id", "owner_sub"])
    op.create_index(
        "ix_ai_chat_sessions_tenant_owner_active",
        "ai_chat_sessions",
        ["tenant_id", "owner_sub", "is_deleted"],
    )

    op.create_table(
        "ai_chat_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["ai_chat_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_chat_messages_session", "ai_chat_messages", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_chat_messages_session", table_name="ai_chat_messages")
    op.drop_table("ai_chat_messages")
    op.drop_index("ix_ai_chat_sessions_tenant_owner_active", table_name="ai_chat_sessions")
    op.drop_index("ix_ai_chat_sessions_tenant_owner", table_name="ai_chat_sessions")
    op.drop_table("ai_chat_sessions")
