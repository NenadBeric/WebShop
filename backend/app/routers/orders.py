from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import AuthUser
from app.models.tenant_profile import TenantLocation
from app.schemas.orders import (
    OrderCreate,
    OrderDetailOut,
    OrderLineQuantityPatch,
    OrderListItemOut,
    OrderResolveScanOut,
    OrderStatusUpdate,
    QuantityReductionResponse,
    ReceptionProposeChangesBody,
    SubstitutionCreate,
    SubstitutionResponse,
)
from decimal import Decimal

from app.services import order_service, tenant_service

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[OrderListItemOut])
async def list_orders(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
    mine: bool = Query(
        False,
        description="If true, only orders placed by the current user (sub). Used for “My orders”; staff list omits this.",
    ),
    search: str | None = Query(None, max_length=200),
    buyer: str | None = Query(None, max_length=200),
    status: str | None = Query(None, description="Comma-separated order statuses"),
    created_from: date | None = Query(None),
    created_to: date | None = Query(None),
    pickup_from: date | None = Query(None),
    pickup_to: date | None = Query(None),
    sort: str = Query("created_desc", max_length=32),
):
    statuses_list: list[str] | None = None
    if status and status.strip():
        statuses_list = [s.strip() for s in status.split(",") if s.strip()]
    orders = await order_service.list_orders(
        db,
        user,
        mine=mine,
        search=search,
        buyer=buyer if user.can_reception() else None,
        statuses=statuses_list,
        created_from=created_from,
        created_to=created_to,
        pickup_from=pickup_from,
        pickup_to=pickup_to,
        sort=sort,
    )
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
    return out


@router.get("/scan/resolve", response_model=OrderResolveScanOut)
async def resolve_order_scan(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
    raw: str = Query(..., min_length=1, max_length=1024, description="Decoded QR text (webshop:tenant:orderNumber[:id])"),
):
    oid = await order_service.resolve_order_qr_scan(db, user, raw)
    return OrderResolveScanOut(id=oid)


@router.post("", response_model=OrderDetailOut, status_code=status.HTTP_201_CREATED)
async def create_order(
    body: OrderCreate,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    order = await order_service.create_order(db, user, body)
    return await order_service.order_to_detail_out(db, order, viewer=user)


@router.get("/{order_id}", response_model=OrderDetailOut)
async def get_order(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    return await order_service.get_order_for_user(db, user, order_id)


@router.put("/{order_id}/status", response_model=OrderDetailOut)
async def update_status(
    order_id: int,
    body: OrderStatusUpdate,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    await order_service.update_order_status(db, user, order_id, body)
    return await order_service.get_order_for_user(db, user, order_id)


@router.post("/{order_id}/reception/propose-changes", response_model=OrderDetailOut, status_code=status.HTTP_201_CREATED)
async def reception_propose_changes(
    order_id: int,
    body: ReceptionProposeChangesBody,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    return await order_service.propose_reception_changes(db, user, order_id, body)


@router.post("/{order_id}/customer/pending/reject-all", response_model=OrderDetailOut)
async def customer_reject_all_pending(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    return await order_service.customer_reject_all_pending(db, user, order_id)


@router.post("/{order_id}/customer/pending/accept-all", response_model=OrderDetailOut)
async def customer_accept_all_pending(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    return await order_service.customer_accept_all_pending(db, user, order_id)


@router.post("/{order_id}/substitution", response_model=OrderDetailOut, status_code=status.HTTP_201_CREATED)
async def propose_substitution(
    order_id: int,
    body: SubstitutionCreate,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    return await order_service.create_substitution_offer(db, user, order_id, body)


@router.delete("/{order_id}/lines/{line_id}", response_model=OrderDetailOut)
async def staff_delete_order_line(
    order_id: int,
    line_id: int,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    return await order_service.staff_delete_order_line(db, user, order_id, line_id)


@router.patch("/{order_id}/lines/{line_id}", response_model=OrderDetailOut)
async def staff_patch_order_line_quantity(
    order_id: int,
    line_id: int,
    body: OrderLineQuantityPatch,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    return await order_service.staff_set_order_line_quantity(db, user, order_id, line_id, body.quantity)


@router.post("/{order_id}/substitution-offers/{offer_id}/cancel", response_model=OrderDetailOut)
async def staff_cancel_substitution_offer(
    order_id: int,
    offer_id: int,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    return await order_service.staff_cancel_substitution_offer(db, user, order_id, offer_id)


@router.put("/{order_id}/substitution/response", response_model=OrderDetailOut)
async def respond_substitution(
    order_id: int,
    body: SubstitutionResponse,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    return await order_service.respond_substitution(db, user, order_id, body)


@router.put("/{order_id}/quantity-reduction/response", response_model=OrderDetailOut)
async def respond_quantity_reduction(
    order_id: int,
    body: QuantityReductionResponse,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    return await order_service.respond_quantity_reduction(db, user, order_id, body)


@router.post("/{order_id}/quantity-reduction-offers/{offer_id}/cancel", response_model=OrderDetailOut)
async def staff_cancel_quantity_reduction_offer(
    order_id: int,
    offer_id: int,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    return await order_service.staff_cancel_quantity_reduction_offer(db, user, order_id, offer_id)
