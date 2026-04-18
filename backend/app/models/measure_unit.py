from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MeasureUnit(Base):
    """Šifarnik jedinica mere (kom, kg, l, …) po tenantu."""

    __tablename__ = "measure_units"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_measure_units_tenant_name"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    products = relationship("Product", back_populates="measure_row")
