from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OrderStaffEvent(Base):
    """Zapis recepcijskih / sistemskih akcija na porudžbini (ko je šta uradio)."""

    __tablename__ = "order_staff_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor_sub: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_email: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    actor_name: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order = relationship("Order", back_populates="staff_events")
