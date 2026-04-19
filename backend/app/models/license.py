"""Licence po tenant_id (paketi, pretplate, add-on kvote) — upravlja samo ADMIN."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LicensePlan(Base):
    __tablename__ = "license_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)

    max_pickup_locations: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_staff_seats: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_products: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_orders_per_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_distinct_buyers_30d: Mapped[int | None] = mapped_column(Integer, nullable=True)

    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LicenseSubscription(Base):
    __tablename__ = "license_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("tenant_profiles.tenant_id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[int] = mapped_column(ForeignKey("license_plans.id"), nullable=False)
    plan = relationship("LicensePlan", lazy="joined")

    status: Mapped[str] = mapped_column(String(16), nullable=False)  # ACTIVE|PAST_DUE|SUSPENDED|EXPIRED|CANCELLED
    billing_cycle: Mapped[str] = mapped_column(String(16), nullable=False)  # MONTHLY|SEMI_ANNUAL|ANNUAL
    discount_percent: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    blocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    blocked_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    addons = relationship(
        "LicenseAddon",
        lazy="selectin",
        cascade="all, delete-orphan",
        back_populates="subscription",
    )


class LicenseAddon(Base):
    __tablename__ = "license_addons"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    subscription_id: Mapped[int] = mapped_column(ForeignKey("license_subscriptions.id", ondelete="CASCADE"), nullable=False)
    addon_code: Mapped[str] = mapped_column(String(32), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    subscription = relationship("LicenseSubscription", back_populates="addons")
