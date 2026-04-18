import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OrderStatus(str, enum.Enum):
    PENDING_CONFIRM = "pending_confirm"
    PARTIAL_WAITING_SWAP = "partial_waiting_swap"
    READY = "ready"
    PICKED_UP = "picked_up"
    REJECTED = "rejected"
    EXPIRED = "expired"


class PickupMode(str, enum.Enum):
    EXACT = "exact"
    DAY = "day"
    NONE = "none"


class SubstitutionOffer(Base):
    __tablename__ = "substitution_offers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    line_id: Mapped[int] = mapped_column(ForeignKey("order_lines.id", ondelete="CASCADE"), index=True)
    offered_product_ids: Mapped[list] = mapped_column(JSONB, nullable=False)
    selected_product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order = relationship("Order", back_populates="substitution_offers")
    line = relationship("OrderLine", back_populates="substitution_offers")


class QuantityReductionOffer(Base):
    __tablename__ = "quantity_reduction_offers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    line_id: Mapped[int] = mapped_column(ForeignKey("order_lines.id", ondelete="CASCADE"), index=True)
    previous_quantity: Mapped[int] = mapped_column(nullable=False)
    proposed_quantity: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order = relationship("Order", back_populates="quantity_reduction_offers")
    line = relationship("OrderLine", back_populates="quantity_reduction_offers")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    order_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    client_zitadel_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    client_email: Mapped[str] = mapped_column(String(255), server_default="")
    client_first_name: Mapped[str] = mapped_column(String(255), server_default="")
    client_last_name: Mapped[str] = mapped_column(String(255), server_default="")
    status: Mapped[str] = mapped_column(String(64), nullable=False, server_default=OrderStatus.PENDING_CONFIRM.value)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    pickup_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    pickup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pickup_note: Mapped[str] = mapped_column(Text, server_default="")
    pickup_location_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenant_locations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_lang: Mapped[str] = mapped_column(String(8), server_default="sr")
    qr_payload: Mapped[str] = mapped_column(String(512), nullable=False)
    source_id: Mapped[int] = mapped_column(ForeignKey("order_sources.id"), nullable=False)
    external_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telegram_pickup_reminder_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    telegram_day_reminder_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    source = relationship("OrderSource", back_populates="orders")
    lines = relationship("OrderLine", back_populates="order", cascade="all, delete-orphan")
    substitution_offers = relationship(
        "SubstitutionOffer", back_populates="order", cascade="all, delete-orphan"
    )
    quantity_reduction_offers = relationship(
        "QuantityReductionOffer", back_populates="order", cascade="all, delete-orphan"
    )
    staff_events = relationship(
        "OrderStaffEvent", back_populates="order", cascade="all, delete-orphan"
    )


class OrderLine(Base):
    __tablename__ = "order_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit_price_net: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    vat_rate_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    note: Mapped[str] = mapped_column(Text, server_default="")
    substituted_from_product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    sale_percent_applied: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    catalog_unit_price_gross: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    catalog_unit_price_net: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")

    order = relationship("Order", back_populates="lines")
    product = relationship("Product", foreign_keys=[product_id])
    substitution_offers = relationship("SubstitutionOffer", back_populates="line")
    quantity_reduction_offers = relationship("QuantityReductionOffer", back_populates="line")
