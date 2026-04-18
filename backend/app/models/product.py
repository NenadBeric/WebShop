from datetime import datetime
from decimal import Decimal

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    product_type_id: Mapped[int] = mapped_column(ForeignKey("product_types.id"), nullable=False, index=True)
    measure_unit_id: Mapped[int] = mapped_column(ForeignKey("measure_units.id"), nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, server_default="1")
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, server_default="")
    vat_rate_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default="20")
    price_net: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    price_gross: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    sale_percent: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    image_url: Mapped[str] = mapped_column(String(2000), nullable=False)
    available: Mapped[bool] = mapped_column(Boolean, server_default="true")
    replacement_product_ids: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    type_row = relationship("ProductType", back_populates="products")
    measure_row = relationship("MeasureUnit", back_populates="products")
