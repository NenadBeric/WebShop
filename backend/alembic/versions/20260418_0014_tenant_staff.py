"""Tabela tenant_staff — evidencija zaposlenih po tenantu.

Revision ID: 0014
Revises: 0013
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tenant_staff",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("email_normalized", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=500), server_default="", nullable=False),
        sa.Column("role", sa.String(length=64), nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "email_normalized", name="uq_tenant_staff_tenant_email"),
    )
    op.create_index("ix_tenant_staff_tenant_id", "tenant_staff", ["tenant_id"], unique=False)
    op.create_index("ix_tenant_staff_email_normalized", "tenant_staff", ["email_normalized"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tenant_staff_email_normalized", table_name="tenant_staff")
    op.drop_index("ix_tenant_staff_tenant_id", table_name="tenant_staff")
    op.drop_table("tenant_staff")
