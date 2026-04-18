from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TenantStaff(Base):
    """Evidencija zaposlenih/korisnika tenanta (Zitadel + lokalna provera duplikata mejla)."""

    __tablename__ = "tenant_staff"
    __table_args__ = (UniqueConstraint("tenant_id", "email_normalized", name="uq_tenant_staff_tenant_email"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    email_normalized: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(500), nullable=False, server_default="")
    role: Mapped[str] = mapped_column(String(64), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
