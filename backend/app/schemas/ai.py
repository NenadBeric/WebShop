from pydantic import BaseModel, Field


class AiCatalogSearchIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)


class AiCatalogSearchHit(BaseModel):
    product_id: int
    name: str
    reason: str = ""


class AiCatalogSearchOut(BaseModel):
    hits: list[AiCatalogSearchHit]


class StaffChatIn(BaseModel):
    session_id: int | None = Field(default=None, description="Postojeća sesija ili null za novu")
    message: str = Field(..., min_length=1, max_length=4000)


class StaffChatSessionOut(BaseModel):
    id: int
    title: str
    last_activity_at: str | None = None
    message_count: int = 0


class StaffChatRenameIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
