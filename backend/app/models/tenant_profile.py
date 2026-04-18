from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TenantProfile(Base):
    """Osnovni podaci firme i pravila zakazivanja / isteka po tenant_id (string)."""

    __tablename__ = "tenant_profiles"

    tenant_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    trade_name: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    pib: Mapped[str] = mapped_column(String(32), nullable=False, server_default="")
    mb: Mapped[str] = mapped_column(String(32), nullable=False, server_default="")
    address_line: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    city: Mapped[str] = mapped_column(String(128), nullable=False, server_default="")
    postal_code: Mapped[str] = mapped_column(String(16), nullable=False, server_default="")
    country: Mapped[str] = mapped_column(String(2), nullable=False, server_default="RS")
    phone: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    website: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, server_default="Europe/Belgrade")
    terms_note: Mapped[str] = mapped_column(Text, nullable=False, server_default="")

    max_schedule_days_ahead: Mapped[int] = mapped_column(Integer, nullable=False, server_default="14")
    min_notice_hours_before_pickup: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    pickup_grace_hours_after_slot: Mapped[int] = mapped_column(Integer, nullable=False, server_default="24")

    telegram_chat_id: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")
    telegram_bot_token: Mapped[str] = mapped_column(String(128), nullable=False, server_default="")
    telegram_notify_new_order: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    notify_before_pickup_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="10")
    day_reminder_hour_local: Mapped[int] = mapped_column(Integer, nullable=False, server_default="8")
    smtp_host: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    smtp_port: Mapped[int] = mapped_column(Integer, nullable=False, server_default="587")
    smtp_user: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    smtp_password: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    smtp_from: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    smtp_use_tls: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    locations = relationship(
        "TenantLocation",
        back_populates="profile",
        cascade="all, delete-orphan",
    )


class TenantLocation(Base):
    """Lokacije unutar firme (kasnije veza sa Trainify lokacijom preko `code`)."""

    __tablename__ = "tenant_locations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("tenant_profiles.tenant_id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address_line: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    profile = relationship("TenantProfile", back_populates="locations")
