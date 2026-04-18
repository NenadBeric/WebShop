from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.tenant import TenantLocationOut


class ReceptionDeskOut(BaseModel):
    location_id: int | None = None
    locations: list[TenantLocationOut] = Field(default_factory=list)


class ReceptionDeskPut(BaseModel):
    location_id: int = Field(..., ge=1)
