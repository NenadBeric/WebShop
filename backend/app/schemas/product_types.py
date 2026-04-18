from pydantic import BaseModel, Field


class ProductTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    sort_order: int = 0


class ProductTypePatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    sort_order: int | None = None


class ProductTypeOut(BaseModel):
    id: int
    tenant_id: str
    name: str
    sort_order: int

    model_config = {"from_attributes": True}
