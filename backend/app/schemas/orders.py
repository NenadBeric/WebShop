from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class PickupIn(BaseModel):
    mode: Literal["exact", "day"]
    at: datetime | None = None
    note: str = ""


class OrderLineCreate(BaseModel):
    product_id: int
    quantity: int = Field(..., ge=1)
    note: str = ""


class OrderCreate(BaseModel):
    lines: list[OrderLineCreate]
    pickup: PickupIn
    source_code: str = "WEBSHOP"
    external_ref: str | None = None
    preferred_lang: str = "sr"
    pickup_location_id: int | None = None


class OrderLineOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    quantity: int
    unit_price: Decimal
    unit_price_net: Decimal
    vat_rate_percent: Decimal
    note: str
    product_available_now: bool
    substituted_from_product_id: int | None = None
    sale_percent_applied: int = 0
    catalog_unit_price_gross: Decimal
    catalog_unit_price_net: Decimal

    model_config = {"from_attributes": True}


class OrderResolveScanOut(BaseModel):
    id: int


class OrderStaffEventOut(BaseModel):
    id: int
    event_type: str
    from_status: str | None = None
    to_status: str | None = None
    actor_sub: str | None = None
    actor_email: str = ""
    actor_name: str = ""
    meta: dict = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderDetailOut(BaseModel):
    id: int
    order_number: str
    status: str
    total: Decimal
    pickup_mode: str
    pickup_at: datetime | None
    pickup_note: str
    pickup_location_id: int | None = None
    rejection_reason: str | None
    client_email: str
    client_first_name: str = ""
    client_last_name: str = ""
    preferred_lang: str
    qr_data_url: str
    lines: list[OrderLineOut]
    pending_substitutions: list[dict] = Field(default_factory=list)
    pending_quantity_reductions: list[dict] = Field(default_factory=list)
    resolved_substitutions: list[dict] = Field(default_factory=list)
    resolved_quantity_reductions: list[dict] = Field(default_factory=list)
    source_code: str = ""
    staff_events: list[OrderStaffEventOut] = Field(default_factory=list)
    is_my_order: bool = Field(
        default=False,
        description="Viewer is the order client (own order); staff see customer flow for their purchases.",
    )
    approve_blocked_by_customer_rejection: bool = Field(
        default=False,
        description="When true, reception cannot approve_all until affected lines are removed or a new proposal is sent.",
    )

    model_config = {"from_attributes": True}


class OrderListItemOut(BaseModel):
    id: int
    order_number: str
    status: str
    total: Decimal
    total_net: Decimal
    total_vat: Decimal
    created_at: datetime
    client_email: str
    client_first_name: str = ""
    client_last_name: str = ""
    pickup_mode: str
    pickup_at: datetime | None
    pickup_location_id: int | None = None
    pickup_location_name: str = ""

    model_config = {"from_attributes": True}


class OrderStatusUpdate(BaseModel):
    action: Literal["approve_all", "reject_all", "mark_ready", "mark_picked_up"]
    rejection_reason: str | None = None
    payment_note: str = ""


class OrderLineQuantityPatch(BaseModel):
    quantity: int = Field(..., ge=1)


class SubstitutionCreate(BaseModel):
    line_id: int
    offered_product_ids: list[int] = Field(..., min_length=1, max_length=3)


class SubstitutionResponse(BaseModel):
    offer_id: int
    accept: bool
    selected_product_id: int | None = None


class QuantityReductionResponse(BaseModel):
    offer_id: int
    accept: bool


class ReceptionChangeLineIn(BaseModel):
    line_id: int
    offered_product_ids: list[int] = Field(default_factory=list)
    proposed_quantity: int | None = None

    @model_validator(mode="after")
    def one_change_type(self) -> "ReceptionChangeLineIn":
        has_sub = bool(self.offered_product_ids)
        has_qty = self.proposed_quantity is not None
        if not has_sub and not has_qty:
            raise ValueError("empty_change")
        if has_sub and has_qty:
            raise ValueError("both_sub_and_qty")
        return self


class ReceptionProposeChangesBody(BaseModel):
    changes: list[ReceptionChangeLineIn] = Field(..., min_length=1, max_length=30)
