from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.product import Product
from app.services.product_sale import effective_price_gross, effective_price_net
from app.services.vat import prices_consistent


class ProductCreate(BaseModel):
    name: str = Field(..., max_length=500)
    description: str = ""
    product_type_id: int
    measure_unit_id: int
    quantity: Decimal = Field(..., gt=0, description="Količina po jedinici (npr. masa, broj kom u pakovanju)")
    vat_rate_percent: Decimal = Field(..., description="0, 10 ili 20")
    price_net: Decimal = Field(..., ge=0)
    price_gross: Decimal = Field(..., ge=0)
    image_url: str = Field(..., max_length=2000)
    available: bool = True
    replacement_product_ids: list[int] = Field(default_factory=list, max_length=3)
    sale_percent: int = Field(0, ge=0, le=99, description="Procenat sniženja od kataloške cene (0 = bez akcije)")

    @field_validator("vat_rate_percent")
    @classmethod
    def vat_ok(cls, v: Decimal) -> Decimal:
        if v not in (Decimal("0"), Decimal("10"), Decimal("20")):
            raise ValueError("invalid_vat")
        return v

    @model_validator(mode="after")
    def prices_match_vat(self) -> "ProductCreate":
        if not prices_consistent(self.price_net, self.price_gross, self.vat_rate_percent):
            raise ValueError("price_vat_mismatch")
        return self


class ProductPatch(BaseModel):
    name: str | None = Field(None, max_length=500)
    description: str | None = None
    product_type_id: int | None = None
    measure_unit_id: int | None = None
    quantity: Decimal | None = Field(None, gt=0)
    vat_rate_percent: Decimal | None = None
    price_net: Decimal | None = Field(None, ge=0)
    price_gross: Decimal | None = Field(None, ge=0)
    image_url: str | None = Field(None, max_length=2000)
    available: bool | None = None
    replacement_product_ids: list[int] | None = Field(None, max_length=3)
    sale_percent: int | None = Field(None, ge=0, le=99)

    @field_validator("vat_rate_percent")
    @classmethod
    def vat_ok(cls, v: Decimal | None) -> Decimal | None:
        if v is None:
            return v
        if v not in (Decimal("0"), Decimal("10"), Decimal("20")):
            raise ValueError("invalid_vat")
        return v


class ProductOut(BaseModel):
    id: int
    tenant_id: str
    name: str
    description: str
    product_type_id: int
    product_type_name: str
    measure_unit_id: int
    measure_unit_name: str
    quantity: Decimal
    vat_rate_percent: Decimal
    price_net: Decimal
    price_gross: Decimal
    sale_percent: int
    price_net_effective: Decimal
    price_gross_effective: Decimal
    image_url: str
    available: bool
    replacement_product_ids: list[int]

    @classmethod
    def from_product(cls, p: Product) -> "ProductOut":
        pt = getattr(p, "type_row", None)
        mu = getattr(p, "measure_row", None)
        return cls(
            id=p.id,
            tenant_id=p.tenant_id,
            name=p.name,
            description=p.description or "",
            product_type_id=p.product_type_id,
            product_type_name=pt.name if pt is not None else "",
            measure_unit_id=p.measure_unit_id,
            measure_unit_name=mu.name if mu is not None else "",
            quantity=p.quantity,
            vat_rate_percent=p.vat_rate_percent,
            price_net=p.price_net,
            price_gross=p.price_gross,
            sale_percent=int(getattr(p, "sale_percent", 0) or 0),
            price_net_effective=effective_price_net(p),
            price_gross_effective=effective_price_gross(p),
            image_url=p.image_url,
            available=p.available,
            replacement_product_ids=list(p.replacement_product_ids or []),
        )


def product_out_list(rows: list[Any]) -> list[ProductOut]:
    return [ProductOut.from_product(p) for p in rows]
