from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ReceptionDeskSelection(Base):
    """Jedna aktivna lokacija preuzimanja po recepcijskom nalogu (tenant + Zitadel sub)."""

    __tablename__ = "reception_desk_selections"
    __table_args__ = (UniqueConstraint("tenant_id", "user_sub", name="uq_reception_desk_tenant_sub"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_sub: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    location_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tenant_locations.id", ondelete="CASCADE"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
