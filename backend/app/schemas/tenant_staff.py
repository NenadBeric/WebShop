from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class TenantStaffCreate(BaseModel):
    email: EmailStr
    display_name: str = Field("", max_length=500)
    role: str = Field(..., min_length=4, max_length=64)


class TenantStaffPatch(BaseModel):
    display_name: str | None = Field(None, max_length=500)
    role: str | None = Field(None, max_length=64)
    active: bool | None = None


class TenantStaffOut(BaseModel):
    id: int
    tenant_id: str
    email: str
    display_name: str
    role: str
    active: bool

    model_config = {"from_attributes": True}
