from pydantic import BaseModel, Field

from app.schemas.products import ProductOut


class CartLineIn(BaseModel):
    product_id: int = Field(..., ge=1)
    quantity: int = Field(..., ge=1, le=9999)
    note: str = Field(default="", max_length=2000)


class CartPutIn(BaseModel):
    lines: list[CartLineIn] = Field(default_factory=list, max_length=200)


class CartLineItemOut(BaseModel):
    product: ProductOut
    quantity: int
    note: str


class CartOut(BaseModel):
    lines: list[CartLineItemOut]
