from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CartLine(Base):
    """Korpa po korisniku (tenant + JWT sub) — ista korpa na svim uređajima."""

    __tablename__ = "cart_lines"
    __table_args__ = (
        UniqueConstraint("tenant_id", "client_sub", "product_id", name="uq_cart_line_user_product"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    client_sub: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str] = mapped_column(Text, server_default="")

    product = relationship("Product", foreign_keys=[product_id])
