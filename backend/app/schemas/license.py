from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

SubscriptionStatus = Literal["ACTIVE", "PAST_DUE", "SUSPENDED", "EXPIRED", "CANCELLED"]
BillingCycle = Literal["MONTHLY", "SEMI_ANNUAL", "ANNUAL"]


class LicensePlanCreate(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    name: str = Field(min_length=1, max_length=128)
    max_pickup_locations: int | None = Field(default=None, ge=0)
    max_staff_seats: int | None = Field(default=None, ge=0)
    max_products: int | None = Field(default=None, ge=0)
    max_orders_per_month: int | None = Field(default=None, ge=0)
    max_distinct_buyers_30d: int | None = Field(default=None, ge=0)
    price: float | None = Field(default=None, ge=0)
    is_active: bool = True


class LicensePlanPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    max_pickup_locations: int | None = None
    max_staff_seats: int | None = None
    max_products: int | None = None
    max_orders_per_month: int | None = None
    max_distinct_buyers_30d: int | None = None
    price: float | None = Field(default=None, ge=0)
    is_active: bool | None = None


class LicensePlanOut(BaseModel):
    id: int
    code: str
    name: str
    max_pickup_locations: int | None
    max_staff_seats: int | None
    max_products: int | None
    max_orders_per_month: int | None
    max_distinct_buyers_30d: int | None
    price: float | None
    is_active: bool

    model_config = {"from_attributes": True}


class LicenseAddonOut(BaseModel):
    id: int
    addon_code: str
    quantity: int

    model_config = {"from_attributes": True}


class LicenseSubscriptionCreate(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64)
    plan_id: int
    status: SubscriptionStatus = "ACTIVE"
    billing_cycle: BillingCycle = "MONTHLY"
    discount_percent: int = Field(default=0, ge=0, le=100)
    valid_from: date | None = None
    valid_to: date | None = None
    auto_renew: bool = False
    blocked_reason: str | None = Field(default=None, max_length=255)


class LicenseSubscriptionsBulkCreate(BaseModel):
    """Ista pretplata za više tenanata odjednom (ADMIN)."""

    tenant_ids: list[str] = Field(min_length=1, max_length=300)
    plan_id: int = Field(gt=0)
    status: SubscriptionStatus = "ACTIVE"
    billing_cycle: BillingCycle = "MONTHLY"
    discount_percent: int = Field(default=0, ge=0, le=100)
    valid_from: date | None = None
    valid_to: date | None = None
    auto_renew: bool = False
    blocked_reason: str | None = Field(default=None, max_length=255)

    @field_validator("tenant_ids", mode="before")
    @classmethod
    def _normalize_tenant_ids(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            raise ValueError("tenant_ids must be a list")
        out: list[str] = []
        seen: set[str] = set()
        for x in v:
            s = str(x).strip()
            if not s or s in seen:
                continue
            seen.add(s)
            out.append(s)
        if not out:
            raise ValueError("tenant_ids_empty")
        return out


class LicenseSubscriptionPatch(BaseModel):
    plan_id: int | None = None
    status: SubscriptionStatus | None = None
    billing_cycle: BillingCycle | None = None
    discount_percent: int | None = Field(default=None, ge=0, le=100)
    valid_from: date | None = None
    valid_to: date | None = None
    auto_renew: bool | None = None
    blocked_reason: str | None = Field(default=None, max_length=255)


class LicenseAddonUpsert(BaseModel):
    addon_code: str = Field(min_length=2, max_length=32)
    quantity: int = Field(ge=0, le=10_000)


class LicenseSubscriptionOut(BaseModel):
    id: int
    tenant_id: str
    plan: LicensePlanOut
    status: str
    billing_cycle: str
    discount_percent: int
    valid_from: date | None
    valid_to: date | None
    blocked_at: datetime | None
    blocked_reason: str | None
    auto_renew: bool
    addons: list[LicenseAddonOut]

    model_config = {"from_attributes": True}


class LicenseUsageOut(BaseModel):
    tenant_id: str
    limits: dict[str, int | None]
    usage: dict[str, int]
    remaining: dict[str, int | None]
