"""Korenski endpointi koje Trainify backend proxy očekuje (bez /api/v1 prefiksa).

Podešavanje u Trainify: ``WEBSHOP_API_BASE_URL=http://<webshop-backend>:8000`` (bez završnog slasha).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import AuthUser
from app.models.tenant_profile import TenantLocation
from app.routers.cart import get_cart
from app.schemas.orders import OrderListItemOut
from app.services import order_service, tenant_service

router = APIRouter(tags=["trainify-upstream"])


@router.get("/pickup-locations")
async def trainify_pickup_locations(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
) -> list[dict[str, Any]]:
    rules = await tenant_service.get_order_rules(db, user.tenant_id)
    return [
        {"id": loc.id, "name": loc.name, "code": loc.code, "pickupLocationId": loc.id, "pickupName": loc.name}
        for loc in rules.locations
        if loc.is_active
    ]


@router.get("/cart/summary")
async def trainify_cart_summary(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
) -> dict[str, Any]:
    cart = await get_cart(db, user)
    total_qty = sum(ln.quantity for ln in cart.lines)
    return {
        "lineCount": len(cart.lines),
        "totalQuantity": total_qty,
        "lines": [ln.model_dump(mode="json") for ln in cart.lines],
    }


@router.get("/orders")
async def trainify_orders_page(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any]:
    orders = await order_service.list_orders(db, user, mine=True, sort="created_desc")
    ids = [o.id for o in orders]
    totals = await order_service.order_line_totals_by_order_ids(db, ids)
    rules = await tenant_service.get_order_rules(db, user.tenant_id)
    loc_names: dict[int, str] = {loc.id: loc.name for loc in rules.locations}
    missing = {o.pickup_location_id for o in orders if o.pickup_location_id and o.pickup_location_id not in loc_names}
    if missing:
        r = await db.execute(select(TenantLocation).where(TenantLocation.id.in_(missing)))
        for loc in r.scalars():
            loc_names[loc.id] = loc.name

    out: list[OrderListItemOut] = []
    for o in orders:
        net_sum, gross_sum = totals.get(o.id, (Decimal("0"), Decimal("0")))
        vat_sum = gross_sum - net_sum
        plid = o.pickup_location_id
        plname = loc_names.get(plid, "") if plid is not None else ""
        out.append(
            OrderListItemOut(
                id=o.id,
                order_number=o.order_number,
                status=o.status,
                total=o.total,
                total_net=net_sum,
                total_vat=vat_sum,
                created_at=o.created_at,
                client_email=o.client_email,
                client_first_name=o.client_first_name or "",
                client_last_name=o.client_last_name or "",
                pickup_mode=o.pickup_mode,
                pickup_at=o.pickup_at,
                pickup_location_id=plid,
                pickup_location_name=plname,
            )
        )

    start = (page - 1) * page_size
    slice_rows = out[start : start + page_size]
    return {
        "items": [r.model_dump(mode="json") for r in slice_rows],
        "page": page,
        "pageSize": page_size,
        "total": len(out),
    }
