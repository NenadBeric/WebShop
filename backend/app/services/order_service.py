from __future__ import annotations

import logging
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import Select, false, func, nulls_last, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.i18n import tr
from app.models.order_source import OrderSource
from app.models.order_staff_event import OrderStaffEvent
from app.models.product import Product
from app.models.shop_order import Order, OrderLine, OrderStatus, QuantityReductionOffer, SubstitutionOffer
from app.rbac import CurrentUser
from app.schemas.orders import (
    OrderCreate,
    OrderDetailOut,
    OrderLineOut,
    OrderStaffEventOut,
    OrderStatusUpdate,
    PickupIn,
    QuantityReductionResponse,
    ReceptionProposeChangesBody,
    SubstitutionCreate,
    SubstitutionResponse,
)
from app.schemas.products import ProductOut
from app.services.client_keys import legacy_client_zitadel_keys
from app.services.notification_service import add_customer, add_reception
from app.services.post_order_dispatch import dispatch_after_order_created
from app.services.qr import qr_code_data_url
from app.services import license_service, tenant_service
from app.services.order_staff_audit import log_order_staff_event
from app.services.product_sale import effective_price_gross, effective_price_net, sale_percent_at_purchase

logger = logging.getLogger(__name__)


def _substitution_offered_product_dict(p: Product) -> dict:
    """Pun podatak o proizvodu za kupca (zamena) — isti oblik kao u katalogu."""
    return ProductOut.from_product(p).model_dump(mode="json")


def _tenant(user: CurrentUser) -> str:
    return user.tenant_id


async def _reception_desk_location_id(db: AsyncSession, user: CurrentUser) -> int | None:
    from app.services import reception_desk_service

    return await reception_desk_service.get_selected_location_id(db, user)


async def _reception_order_readable_by_desk_user(
    db: AsyncSession, user: CurrentUser, order: Order
) -> bool:
    if user.role != "WEBSHOP_RECEPTION":
        return True
    owner_keys = await legacy_client_zitadel_keys(db, user)
    if order.client_zitadel_id in owner_keys:
        return True
    desk = await _reception_desk_location_id(db, user)
    if desk is None:
        return False
    return order.pickup_location_id == desk


async def _assert_reception_staff_order_location(db: AsyncSession, user: CurrentUser, order: Order) -> None:
    if user.role != "WEBSHOP_RECEPTION":
        return
    desk = await _reception_desk_location_id(db, user)
    if desk is None:
        raise HTTPException(status_code=403, detail=tr("reception_desk_required"))
    if order.pickup_location_id != desk:
        raise HTTPException(status_code=403, detail=tr("forbidden"))


async def _resolve_source_id(db: AsyncSession, code: str) -> int:
    r = await db.execute(select(OrderSource.id).where(OrderSource.code == code, OrderSource.active.is_(True)))
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=400, detail=tr("validation_error"))
    return int(row)


def _pickup_fields(pickup: PickupIn) -> tuple[str, datetime, str]:
    if pickup.mode == "exact":
        if pickup.at is None:
            raise HTTPException(status_code=400, detail=tr("validation_error"))
        return pickup.mode, pickup.at, pickup.note
    if pickup.mode == "day":
        if pickup.at is None:
            raise HTTPException(status_code=400, detail=tr("validation_error"))
        return pickup.mode, pickup.at, pickup.note
    raise HTTPException(status_code=400, detail=tr("validation_error"))


def _generate_order_number() -> str:
    import secrets

    return f"WS-{datetime.now(UTC).strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"


def _split_client_name(display_name: str) -> tuple[str, str]:
    n = (display_name or "").strip()
    if not n:
        return ("", "")
    parts = n.split(None, 1)
    first = parts[0][:255]
    last = (parts[1] if len(parts) > 1 else "")[:255]
    return (first, last)


async def create_order(db: AsyncSession, user: CurrentUser, body: OrderCreate) -> Order:
    if not user.can_shop():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))

    tenant = _tenant(user)
    await license_service.enforce_tenant_write_allowed(db, user)
    await license_service.enforce_new_order_quotas(db, tenant, user.sub)
    pickup_mode, pickup_at, pickup_note = _pickup_fields(body.pickup)
    await tenant_service.validate_pickup_datetime(db, tenant, pickup_at=pickup_at)
    if await license_service.count_active_pickup_locations(db, tenant) > 0 and body.pickup_location_id is None:
        raise HTTPException(status_code=400, detail=tr("pickup_location_required"))
    await tenant_service.validate_pickup_location(db, tenant, body.pickup_location_id)
    source_id = await _resolve_source_id(db, body.source_code.upper())

    lines_total = Decimal("0")
    line_entities: list[tuple[Product, int, str]] = []

    for ln in body.lines:
        pr = (
            await db.execute(
                select(Product).where(
                    Product.id == ln.product_id,
                    Product.tenant_id == tenant,
                )
            )
        ).scalar_one_or_none()
        if not pr or not pr.available:
            raise HTTPException(status_code=400, detail=tr("product_unavailable"))
        line_total = effective_price_gross(pr) * ln.quantity
        lines_total += line_total
        line_entities.append((pr, ln.quantity, ln.note))

    order_number = _generate_order_number()
    qr_payload = f"webshop:{tenant}:{order_number}"
    first_name, last_name = _split_client_name(user.name)
    order = Order(
        tenant_id=tenant,
        order_number=order_number,
        client_zitadel_id=user.sub,
        client_email=user.email,
        client_first_name=first_name,
        client_last_name=last_name,
        status=OrderStatus.PENDING_CONFIRM.value,
        total=lines_total,
        pickup_mode=pickup_mode,
        pickup_at=pickup_at,
        pickup_note=pickup_note,
        pickup_location_id=body.pickup_location_id,
        preferred_lang=body.preferred_lang[:8] if body.preferred_lang else "sr",
        qr_payload=qr_payload,
        source_id=source_id,
        external_ref=body.external_ref,
    )
    db.add(order)
    await db.flush()
    order.qr_payload = f"webshop:{tenant}:{order.order_number}:{order.id}"

    for pr, qty, note in line_entities:
        db.add(
            OrderLine(
                order_id=order.id,
                product_id=pr.id,
                quantity=qty,
                unit_price=effective_price_gross(pr),
                unit_price_net=effective_price_net(pr),
                vat_rate_percent=pr.vat_rate_percent,
                note=note,
                sale_percent_applied=sale_percent_at_purchase(pr),
                catalog_unit_price_gross=pr.price_gross,
                catalog_unit_price_net=pr.price_net,
            )
        )
    await add_reception(
        db,
        tenant_id=tenant,
        order_id=order.id,
        event_type="reception.order_created",
    )
    await db.commit()
    reloaded = await _load_order(db, order.id, tenant)
    assert reloaded is not None
    await dispatch_after_order_created(db, reloaded)
    return reloaded


async def _load_order(
    db: AsyncSession, order_id: int, tenant: str, options: list | None = None
) -> Order | None:
    stmt: Select = select(Order).where(Order.id == order_id, Order.tenant_id == tenant)
    stmt = stmt.options(
        selectinload(Order.lines).selectinload(OrderLine.product),
        selectinload(Order.source),
        selectinload(Order.substitution_offers),
        selectinload(Order.quantity_reduction_offers),
    )
    return (await db.execute(stmt)).unique().scalar_one_or_none()


def _line_out(line: OrderLine) -> OrderLineOut:
    p = line.product
    return OrderLineOut(
        id=line.id,
        product_id=line.product_id,
        product_name=p.name if p else "",
        quantity=line.quantity,
        unit_price=line.unit_price,
        unit_price_net=line.unit_price_net,
        vat_rate_percent=line.vat_rate_percent,
        note=line.note,
        product_available_now=bool(p and p.available),
        substituted_from_product_id=line.substituted_from_product_id,
        sale_percent_applied=int(getattr(line, "sale_percent_applied", 0) or 0),
        catalog_unit_price_gross=line.catalog_unit_price_gross,
        catalog_unit_price_net=line.catalog_unit_price_net,
    )


async def order_to_detail_out(
    db: AsyncSession, order: Order, viewer: CurrentUser | None = None
) -> OrderDetailOut:
    lines = (await db.execute(select(OrderLine).where(OrderLine.order_id == order.id))).scalars().all()
    for ln in lines:
        await db.refresh(ln, ["product"])
    offer_product_ids: list[int] = []
    for off in order.substitution_offers or []:
        for x in (off.offered_product_ids or [])[:12]:
            try:
                offer_product_ids.append(int(x))
            except (TypeError, ValueError):
                continue
        if off.status == "accepted" and off.selected_product_id:
            offer_product_ids.append(int(off.selected_product_id))
    product_by_id: dict[int, Product] = {}
    uniq = list(dict.fromkeys(offer_product_ids))[:50]
    if uniq:
        stmt = (
            select(Product)
            .where(Product.tenant_id == order.tenant_id, Product.id.in_(uniq))
            .options(selectinload(Product.type_row), selectinload(Product.measure_row))
        )
        prs = (await db.execute(stmt)).scalars().all()
        for p in prs:
            product_by_id[int(p.id)] = p
    name_by_id: dict[int, str] = {pid: p.name for pid, p in product_by_id.items()}

    def offered_products_payload(ids: list[int]) -> list[dict]:
        out: list[dict] = []
        for i in ids:
            pr = product_by_id.get(i)
            if pr is not None:
                out.append(_substitution_offered_product_dict(pr))
            else:
                out.append({"id": i, "name": name_by_id.get(i, f"#{i}")})
        return out

    pending: list[dict] = []
    resolved_sub: list[dict] = []
    for off in order.substitution_offers or []:
        if off.status == "pending":
            ids = [int(x) for x in (off.offered_product_ids or [])[:10]]
            offered_products = offered_products_payload(ids)
            pending.append(
                {
                    "id": off.id,
                    "line_id": off.line_id,
                    "offered_product_ids": ids,
                    "offered_products": offered_products,
                }
            )
        elif off.status in ("accepted", "rejected", "withdrawn"):
            ids = [int(x) for x in (off.offered_product_ids or [])[:10]]
            offered_products = offered_products_payload(ids)
            row: dict = {
                "id": off.id,
                "line_id": off.line_id,
                "status": off.status,
                "offered_product_ids": ids,
                "offered_products": offered_products,
            }
            if off.status == "accepted" and off.selected_product_id:
                sid = int(off.selected_product_id)
                row["selected_product_id"] = sid
                row["selected_product_name"] = name_by_id.get(sid, f"#{sid}")
            resolved_sub.append(row)
    resolved_sub.sort(key=lambda r: int(r["id"]), reverse=True)
    line_by_id = {ln.id: ln for ln in lines}
    pending_qty: list[dict] = []
    resolved_qty: list[dict] = []
    for qoff in order.quantity_reduction_offers or []:
        if qoff.status == "pending":
            ln = line_by_id.get(qoff.line_id)
            pending_qty.append(
                {
                    "id": qoff.id,
                    "line_id": qoff.line_id,
                    "previous_quantity": qoff.previous_quantity,
                    "proposed_quantity": qoff.proposed_quantity,
                    "product_name": _line_out(ln).product_name if ln else "",
                }
            )
        elif qoff.status in ("accepted", "rejected", "withdrawn"):
            ln = line_by_id.get(qoff.line_id)
            resolved_qty.append(
                {
                    "id": qoff.id,
                    "line_id": qoff.line_id,
                    "status": qoff.status,
                    "previous_quantity": qoff.previous_quantity,
                    "proposed_quantity": qoff.proposed_quantity,
                    "product_name": _line_out(ln).product_name if ln else "",
                }
            )
    resolved_qty.sort(key=lambda r: int(r["id"]), reverse=True)
    src_code = order.source.code if order.source else ""
    is_my_order = False
    if viewer is not None:
        owner_keys = await legacy_client_zitadel_keys(db, viewer)
        is_my_order = order.client_zitadel_id in owner_keys
    staff_events: list[OrderStaffEventOut] = []
    if viewer is not None and viewer.can_reception():
        ev_rows = (
            await db.execute(
                select(OrderStaffEvent)
                .where(OrderStaffEvent.order_id == order.id, OrderStaffEvent.tenant_id == order.tenant_id)
                .order_by(OrderStaffEvent.created_at.desc())
                .limit(200)
            )
        ).scalars().all()
        staff_events = [OrderStaffEventOut.model_validate(r) for r in ev_rows]
    approve_blocked_by_customer_rejection = False
    if (
        viewer is not None
        and viewer.can_reception()
        and order.status == OrderStatus.PENDING_CONFIRM.value
    ):
        lids = {ln.id for ln in lines}
        approve_blocked_by_customer_rejection = bool(
            await _line_ids_with_latest_offer_rejected_by_customer(db, order.id, lids)
        )
    return OrderDetailOut(
        id=order.id,
        order_number=order.order_number,
        status=order.status,
        total=order.total,
        pickup_mode=order.pickup_mode,
        pickup_at=order.pickup_at,
        pickup_note=order.pickup_note,
        pickup_location_id=order.pickup_location_id,
        rejection_reason=order.rejection_reason,
        client_email=order.client_email,
        client_first_name=order.client_first_name or "",
        client_last_name=order.client_last_name or "",
        preferred_lang=order.preferred_lang,
        qr_data_url=qr_code_data_url(order.qr_payload),
        lines=[_line_out(ln) for ln in lines],
        pending_substitutions=pending,
        pending_quantity_reductions=pending_qty,
        resolved_substitutions=resolved_sub,
        resolved_quantity_reductions=resolved_qty,
        source_code=src_code,
        staff_events=staff_events,
        is_my_order=is_my_order,
        approve_blocked_by_customer_rejection=approve_blocked_by_customer_rejection,
    )


async def resolve_order_qr_scan(db: AsyncSession, user: CurrentUser, raw: str) -> int:
    """Recepcija / menadžment: iz teksta QR-a (webshop:tenant:broj[:id]) vraća id porudžbine u istom tenantu."""
    if not user.can_reception():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    text = (raw or "").strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=tr("validation_error"))
    parts = text.split(":")
    if len(parts) < 3 or parts[0].lower() != "webshop":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=tr("invalid_order_qr"))
    qr_tenant = (parts[1] or "").strip()
    order_number = (parts[2] or "").strip()
    optional_id: int | None = None
    if len(parts) >= 4:
        tail = (parts[3] or "").strip()
        if tail.isdigit():
            optional_id = int(tail)
    if not qr_tenant or not order_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=tr("invalid_order_qr"))

    if user.is_admin():
        effective_tenant = qr_tenant
    else:
        if qr_tenant != user.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
        effective_tenant = user.tenant_id

    order: Order | None = None
    if optional_id is not None:
        order = await _load_order(db, optional_id, effective_tenant)
        if order is None or order.order_number != order_number:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=tr("not_found"))
    else:
        r = await db.execute(
            select(Order).where(Order.tenant_id == effective_tenant, Order.order_number == order_number)
        )
        order = r.scalar_one_or_none()
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=tr("not_found"))

    if user.role == "WEBSHOP_RECEPTION" and not user.is_admin():
        owner_keys = await legacy_client_zitadel_keys(db, user)
        if order.client_zitadel_id not in owner_keys:
            await _assert_reception_staff_order_location(db, user, order)
    return int(order.id)


async def get_order_for_user(db: AsyncSession, user: CurrentUser, order_id: int) -> OrderDetailOut:
    tenant = _tenant(user)
    order = await _load_order(db, order_id, tenant)
    if not order:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    if user.can_reception():
        if user.role == "WEBSHOP_RECEPTION" and not await _reception_order_readable_by_desk_user(db, user, order):
            if await _reception_desk_location_id(db, user) is None:
                raise HTTPException(status_code=403, detail=tr("reception_desk_required"))
            raise HTTPException(status_code=403, detail=tr("forbidden"))
    else:
        owner_keys = await legacy_client_zitadel_keys(db, user)
        if order.client_zitadel_id not in owner_keys:
            raise HTTPException(status_code=403, detail=tr("forbidden"))
    return await order_to_detail_out(db, order, viewer=user)


_ALLOWED_ORDER_SORT = frozenset(
    {
        "created_desc",
        "created_asc",
        "pickup_desc",
        "pickup_asc",
        "total_desc",
        "total_asc",
        "number_desc",
        "number_asc",
    }
)


async def list_orders(
    db: AsyncSession,
    user: CurrentUser,
    *,
    mine: bool = False,
    search: str | None = None,
    buyer: str | None = None,
    statuses: list[str] | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
    pickup_from: date | None = None,
    pickup_to: date | None = None,
    sort: str = "created_desc",
) -> list[Order]:
    tenant = _tenant(user)
    stmt: Select = select(Order).where(Order.tenant_id == tenant)
    # "Moje porudžbine" šalje mine=True — uvek samo porudžbine ovog naloga, i za recepciju/menadžment.
    # Recepcija (mine=False): WEBSHOP_RECEPTION samo porudžbine za izabranu lokaciju preuzimanja; ostali staff vide sve.
    if mine:
        if not user.can_shop():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
        owner_keys = await legacy_client_zitadel_keys(db, user)
        stmt = stmt.where(Order.client_zitadel_id.in_(owner_keys))
    elif user.can_reception():
        if user.role == "WEBSHOP_RECEPTION":
            desk_id = await _reception_desk_location_id(db, user)
            if desk_id is None:
                stmt = stmt.where(false())
            else:
                stmt = stmt.where(Order.pickup_location_id == desk_id)
    else:
        owner_keys = await legacy_client_zitadel_keys(db, user)
        stmt = stmt.where(Order.client_zitadel_id.in_(owner_keys))

    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Order.order_number.ilike(q),
                Order.client_email.ilike(q),
                Order.client_first_name.ilike(q),
                Order.client_last_name.ilike(q),
            )
        )
    if buyer and buyer.strip() and user.can_reception():
        b = f"%{buyer.strip()}%"
        stmt = stmt.where(
            or_(
                Order.client_email.ilike(b),
                Order.client_first_name.ilike(b),
                Order.client_last_name.ilike(b),
            )
        )
    if statuses:
        valid = {s.value for s in OrderStatus}
        use = [s for s in statuses if s in valid]
        if use:
            stmt = stmt.where(Order.status.in_(use))

    if created_from is not None:
        start = datetime.combine(created_from, time.min, tzinfo=UTC)
        stmt = stmt.where(Order.created_at >= start)
    if created_to is not None:
        end_excl = datetime.combine(created_to + timedelta(days=1), time.min, tzinfo=UTC)
        stmt = stmt.where(Order.created_at < end_excl)

    if pickup_from is not None:
        pstart = datetime.combine(pickup_from, time.min, tzinfo=UTC)
        stmt = stmt.where(Order.pickup_at.isnot(None), Order.pickup_at >= pstart)
    if pickup_to is not None:
        pend_excl = datetime.combine(pickup_to + timedelta(days=1), time.min, tzinfo=UTC)
        stmt = stmt.where(Order.pickup_at.isnot(None), Order.pickup_at < pend_excl)

    sort_key = sort if sort in _ALLOWED_ORDER_SORT else "created_desc"
    if sort_key == "created_asc":
        stmt = stmt.order_by(Order.created_at.asc())
    elif sort_key == "pickup_desc":
        stmt = stmt.order_by(nulls_last(Order.pickup_at.desc()))
    elif sort_key == "pickup_asc":
        stmt = stmt.order_by(nulls_last(Order.pickup_at.asc()))
    elif sort_key == "total_desc":
        stmt = stmt.order_by(Order.total.desc(), Order.created_at.desc())
    elif sort_key == "total_asc":
        stmt = stmt.order_by(Order.total.asc(), Order.created_at.desc())
    elif sort_key == "number_desc":
        stmt = stmt.order_by(Order.order_number.desc())
    elif sort_key == "number_asc":
        stmt = stmt.order_by(Order.order_number.asc())
    else:
        stmt = stmt.order_by(Order.created_at.desc())

    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def order_line_totals_by_order_ids(db: AsyncSession, order_ids: list[int]) -> dict[int, tuple[Decimal, Decimal]]:
    """order_id -> (sum_net, sum_gross) po stavkama narudžbine."""
    if not order_ids:
        return {}
    stmt = (
        select(
            OrderLine.order_id,
            func.coalesce(func.sum(OrderLine.unit_price_net * OrderLine.quantity), 0).label("sum_net"),
            func.coalesce(func.sum(OrderLine.unit_price * OrderLine.quantity), 0).label("sum_gross"),
        )
        .where(OrderLine.order_id.in_(order_ids))
        .group_by(OrderLine.order_id)
    )
    rows = (await db.execute(stmt)).all()
    out: dict[int, tuple[Decimal, Decimal]] = {}
    for r in rows:
        oid = int(r.order_id)
        net = r.sum_net if r.sum_net is not None else Decimal("0")
        gross = r.sum_gross if r.sum_gross is not None else Decimal("0")
        out[oid] = (net, gross)
    return out


async def _recalc_order_total(db: AsyncSession, order: Order) -> None:
    total = (
        await db.execute(
            select(func.coalesce(func.sum(OrderLine.unit_price * OrderLine.quantity), 0)).where(
                OrderLine.order_id == order.id
            )
        )
    ).scalar_one()
    if total is None:
        order.total = Decimal("0")
    elif isinstance(total, Decimal):
        order.total = total
    else:
        order.total = Decimal(str(total))


async def _line_ids_with_latest_offer_rejected_by_customer(
    db: AsyncSession, order_id: int, line_ids: set[int]
) -> set[int]:
    """Stavke gde je poslednja ponuda zamene ili smanjenja količine u statusu `rejected` (kupac je odbio)."""
    blocked: set[int] = set()
    for lid in line_ids:
        st = (
            await db.execute(
                select(SubstitutionOffer.status)
                .where(SubstitutionOffer.order_id == order_id, SubstitutionOffer.line_id == lid)
                .order_by(SubstitutionOffer.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if st == "rejected":
            blocked.add(lid)
        qt = (
            await db.execute(
                select(QuantityReductionOffer.status)
                .where(QuantityReductionOffer.order_id == order_id, QuantityReductionOffer.line_id == lid)
                .order_by(QuantityReductionOffer.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if qt == "rejected":
            blocked.add(lid)
    return blocked


async def _pending_customer_actions_count(db: AsyncSession, order_id: int) -> int:
    s = (
        await db.execute(
            select(func.count())
            .select_from(SubstitutionOffer)
            .where(SubstitutionOffer.order_id == order_id, SubstitutionOffer.status == "pending")
        )
    ).scalar_one()
    q = (
        await db.execute(
            select(func.count())
            .select_from(QuantityReductionOffer)
            .where(QuantityReductionOffer.order_id == order_id, QuantityReductionOffer.status == "pending")
        )
    ).scalar_one()
    return int(s or 0) + int(q or 0)


async def _sync_order_status_if_no_pending_subs(db: AsyncSession, order: Order) -> None:
    if order.status != OrderStatus.PARTIAL_WAITING_SWAP.value:
        return
    if await _pending_customer_actions_count(db, order.id) == 0:
        order.status = OrderStatus.PENDING_CONFIRM.value


async def _reject_pending_quantity_offers_for_line(db: AsyncSession, order_id: int, line_id: int) -> None:
    stmt = select(QuantityReductionOffer).where(
        QuantityReductionOffer.order_id == order_id,
        QuantityReductionOffer.line_id == line_id,
        QuantityReductionOffer.status == "pending",
    )
    for old_off in (await db.scalars(stmt)).all():
        old_off.status = "rejected"


async def _reject_pending_substitution_offers_for_line(db: AsyncSession, order_id: int, line_id: int) -> None:
    stmt = select(SubstitutionOffer).where(
        SubstitutionOffer.order_id == order_id,
        SubstitutionOffer.line_id == line_id,
        SubstitutionOffer.status == "pending",
    )
    for old_off in (await db.scalars(stmt)).all():
        old_off.status = "rejected"


async def update_order_status(db: AsyncSession, user: CurrentUser, order_id: int, body: OrderStatusUpdate) -> Order:
    if not user.can_reception():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    tenant = _tenant(user)
    order = await _load_order(db, order_id, tenant)
    if not order:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    await _assert_reception_staff_order_location(db, user, order)
    old_status = order.status

    if body.action != "reject_all":
        pending = await _pending_customer_actions_count(db, order.id)
        if pending > 0 and body.action in ("approve_all", "mark_ready", "mark_picked_up"):
            raise HTTPException(status_code=400, detail=tr("order_pending_customer"))

    if body.action == "reject_all":
        order.status = OrderStatus.REJECTED.value
        order.rejection_reason = body.rejection_reason or ""
    elif body.action == "approve_all":
        if order.status != OrderStatus.PENDING_CONFIRM.value:
            raise HTTPException(status_code=400, detail=tr("order_not_editable"))
        await db.refresh(order, ["lines"])
        active_line_ids = {ln.id for ln in order.lines}
        rejected_latest = await _line_ids_with_latest_offer_rejected_by_customer(db, order.id, active_line_ids)
        if rejected_latest:
            raise HTTPException(status_code=400, detail=tr("order_approve_customer_rejected_line"))
        await _recalc_order_total(db, order)
        for ln in order.lines:
            await db.refresh(ln, ["product"])
            if not ln.product or not ln.product.available:
                raise HTTPException(status_code=400, detail=tr("product_unavailable"))
        order.status = OrderStatus.READY.value
    elif body.action == "mark_ready":
        if order.status != OrderStatus.PARTIAL_WAITING_SWAP.value:
            raise HTTPException(status_code=400, detail=tr("mark_ready_wrong_status"))
        await db.refresh(order, ["lines"])
        await _recalc_order_total(db, order)
        for ln in order.lines:
            await db.refresh(ln, ["product"])
            if not ln.product or not ln.product.available:
                raise HTTPException(status_code=400, detail=tr("product_unavailable"))
        order.status = OrderStatus.READY.value
    elif body.action == "mark_picked_up":
        if order.status != OrderStatus.READY.value:
            raise HTTPException(status_code=400, detail=tr("mark_picked_up_wrong_status"))
        order.status = OrderStatus.PICKED_UP.value

    if order.status != old_status:
        meta: dict = {"action": body.action}
        if body.action == "reject_all":
            meta["rejection_reason"] = order.rejection_reason or ""
        log_order_staff_event(
            db,
            order,
            user,
            f"status_{body.action}",
            from_status=old_status,
            to_status=order.status,
            meta=meta,
        )

    await add_customer(
        db,
        tenant_id=tenant,
        recipient_sub=order.client_zitadel_id,
        order_id=order.id,
        event_type="customer.status_changed",
        meta={"status": order.status},
    )
    await db.commit()
    await db.refresh(order)
    return order


async def create_substitution_offer(
    db: AsyncSession, user: CurrentUser, order_id: int, body: SubstitutionCreate
) -> OrderDetailOut:
    if not user.can_reception():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    tenant = _tenant(user)
    order = await _load_order(db, order_id, tenant)
    if not order:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    await _assert_reception_staff_order_location(db, user, order)
    if order.status not in (OrderStatus.PENDING_CONFIRM.value, OrderStatus.PARTIAL_WAITING_SWAP.value):
        raise HTTPException(status_code=400, detail=tr("order_not_editable"))

    line = await db.get(OrderLine, body.line_id)
    if not line or line.order_id != order.id:
        raise HTTPException(status_code=404, detail=tr("not_found"))

    seen = list(dict.fromkeys(body.offered_product_ids))
    if not seen:
        raise HTTPException(status_code=400, detail=tr("validation_error"))
    for pid in seen:
        if pid == line.product_id:
            raise HTTPException(status_code=400, detail=tr("validation_error"))
        pr = await db.get(Product, pid)
        if not pr or pr.tenant_id != tenant or not pr.available:
            raise HTTPException(status_code=400, detail=tr("product_unavailable"))

    await _reject_pending_substitution_offers_for_line(db, order.id, line.id)
    await _reject_pending_quantity_offers_for_line(db, order.id, line.id)
    await _sync_order_status_if_no_pending_subs(db, order)

    off = SubstitutionOffer(
        order_id=order.id,
        line_id=line.id,
        offered_product_ids=seen,
        status="pending",
    )
    db.add(off)
    order.status = OrderStatus.PARTIAL_WAITING_SWAP.value
    await db.flush()
    log_order_staff_event(
        db,
        order,
        user,
        "substitution_offer_created",
        meta={"offer_id": off.id, "line_id": line.id},
    )
    await add_customer(
        db,
        tenant_id=tenant,
        recipient_sub=order.client_zitadel_id,
        order_id=order.id,
        event_type="customer.substitution_offer",
        meta={"offer_id": off.id},
    )
    await db.commit()
    order = await _load_order(db, order_id, tenant)
    assert order is not None
    return await order_to_detail_out(db, order, viewer=user)


async def respond_substitution(
    db: AsyncSession, user: CurrentUser, order_id: int, body: SubstitutionResponse
) -> OrderDetailOut:
    tenant = _tenant(user)
    order = await _load_order(db, order_id, tenant)
    owner_keys = await legacy_client_zitadel_keys(db, user)
    if not order or order.client_zitadel_id not in owner_keys:
        raise HTTPException(status_code=403, detail=tr("forbidden"))

    off = await db.get(SubstitutionOffer, body.offer_id)
    if not off or off.order_id != order.id or off.status != "pending":
        raise HTTPException(status_code=404, detail=tr("not_found"))

    if body.accept:
        if not body.selected_product_id or body.selected_product_id not in off.offered_product_ids:
            raise HTTPException(status_code=400, detail=tr("validation_error"))
        line = await db.get(OrderLine, off.line_id)
        if not line:
            raise HTTPException(status_code=404, detail=tr("not_found"))
        new_p = await db.get(Product, body.selected_product_id)
        if not new_p or new_p.tenant_id != tenant or not new_p.available:
            raise HTTPException(status_code=400, detail=tr("product_unavailable"))
        old_id = line.product_id
        line.substituted_from_product_id = old_id
        line.product_id = new_p.id
        line.unit_price = effective_price_gross(new_p)
        line.unit_price_net = effective_price_net(new_p)
        line.vat_rate_percent = new_p.vat_rate_percent
        line.sale_percent_applied = sale_percent_at_purchase(new_p)
        line.catalog_unit_price_gross = new_p.price_gross
        line.catalog_unit_price_net = new_p.price_net
        off.selected_product_id = body.selected_product_id
        off.status = "accepted"
        await _recalc_order_total(db, order)
    else:
        off.status = "rejected"

    line_row = await db.get(OrderLine, off.line_id)
    pname = ""
    if line_row:
        await db.refresh(line_row, ["product"])
        if line_row.product:
            pname = (line_row.product.name or "")[:200]

    await _sync_order_status_if_no_pending_subs(db, order)
    await add_reception(
        db,
        tenant_id=tenant,
        order_id=order.id,
        event_type="reception.customer_substitution",
        meta={"accepted": body.accept, "line_id": off.line_id, "product_name": pname},
    )
    await db.commit()
    order = await _load_order(db, order_id, tenant)
    assert order
    return await order_to_detail_out(db, order, viewer=user)


async def staff_delete_order_line(db: AsyncSession, user: CurrentUser, order_id: int, line_id: int) -> OrderDetailOut:
    if not user.can_reception():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    tenant = _tenant(user)
    order = await _load_order(db, order_id, tenant)
    if not order:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    await _assert_reception_staff_order_location(db, user, order)
    if order.status not in (OrderStatus.PENDING_CONFIRM.value, OrderStatus.PARTIAL_WAITING_SWAP.value):
        raise HTTPException(status_code=400, detail=tr("order_not_editable"))
    lines = list(order.lines or [])
    if len(lines) <= 1:
        raise HTTPException(status_code=400, detail=tr("cannot_remove_last_line"))
    line = await db.get(OrderLine, line_id)
    if not line or line.order_id != order.id:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    await db.delete(line)
    await db.flush()
    await _recalc_order_total(db, order)
    await _sync_order_status_if_no_pending_subs(db, order)
    log_order_staff_event(db, order, user, "order_line_deleted", meta={"line_id": line_id})
    await add_customer(
        db,
        tenant_id=tenant,
        recipient_sub=order.client_zitadel_id,
        order_id=order.id,
        event_type="customer.order_line_removed",
        meta={},
    )
    await db.commit()
    order = await _load_order(db, order_id, tenant)
    assert order is not None
    return await order_to_detail_out(db, order, viewer=user)


async def staff_set_order_line_quantity(
    db: AsyncSession, user: CurrentUser, order_id: int, line_id: int, quantity: int
) -> OrderDetailOut:
    if not user.can_reception():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    tenant = _tenant(user)
    order = await _load_order(db, order_id, tenant)
    if not order:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    await _assert_reception_staff_order_location(db, user, order)
    if order.status not in (OrderStatus.PENDING_CONFIRM.value, OrderStatus.PARTIAL_WAITING_SWAP.value):
        raise HTTPException(status_code=400, detail=tr("order_not_editable"))
    line = await db.get(OrderLine, line_id)
    if not line or line.order_id != order.id:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    if quantity >= line.quantity:
        raise HTTPException(status_code=400, detail=tr("line_quantity_must_decrease"))

    await _reject_pending_substitution_offers_for_line(db, order.id, line.id)
    await _reject_pending_quantity_offers_for_line(db, order.id, line.id)
    await _sync_order_status_if_no_pending_subs(db, order)

    off = QuantityReductionOffer(
        order_id=order.id,
        line_id=line.id,
        previous_quantity=line.quantity,
        proposed_quantity=quantity,
        status="pending",
    )
    db.add(off)
    order.status = OrderStatus.PARTIAL_WAITING_SWAP.value
    await db.flush()
    log_order_staff_event(
        db,
        order,
        user,
        "quantity_reduction_proposed",
        meta={"offer_id": off.id, "line_id": line.id, "proposed_quantity": quantity},
    )
    await add_customer(
        db,
        tenant_id=tenant,
        recipient_sub=order.client_zitadel_id,
        order_id=order.id,
        event_type="customer.quantity_reduction_offer",
        meta={"offer_id": off.id},
    )
    await db.commit()
    order = await _load_order(db, order_id, tenant)
    assert order is not None
    return await order_to_detail_out(db, order, viewer=user)


async def respond_quantity_reduction(
    db: AsyncSession, user: CurrentUser, order_id: int, body: QuantityReductionResponse
) -> OrderDetailOut:
    tenant = _tenant(user)
    order = await _load_order(db, order_id, tenant)
    owner_keys = await legacy_client_zitadel_keys(db, user)
    if not order or order.client_zitadel_id not in owner_keys:
        raise HTTPException(status_code=403, detail=tr("forbidden"))

    off = await db.get(QuantityReductionOffer, body.offer_id)
    if not off or off.order_id != order.id or off.status != "pending":
        raise HTTPException(status_code=404, detail=tr("not_found"))

    line = await db.get(OrderLine, off.line_id)
    if not line or line.order_id != order.id:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    if line.quantity != off.previous_quantity:
        raise HTTPException(status_code=400, detail=tr("validation_error"))

    if body.accept:
        if off.proposed_quantity < 1 or off.proposed_quantity >= off.previous_quantity:
            raise HTTPException(status_code=400, detail=tr("validation_error"))
        line.quantity = off.proposed_quantity
        off.status = "accepted"
        await _recalc_order_total(db, order)
    else:
        off.status = "rejected"

    await db.refresh(line, ["product"])
    pname = (line.product.name if line.product else "")[:200]

    await _sync_order_status_if_no_pending_subs(db, order)
    await add_reception(
        db,
        tenant_id=tenant,
        order_id=order.id,
        event_type="reception.customer_qty_reply",
        meta={"accepted": body.accept, "line_id": off.line_id, "product_name": pname},
    )
    await db.commit()
    order = await _load_order(db, order_id, tenant)
    assert order is not None
    return await order_to_detail_out(db, order, viewer=user)


async def staff_cancel_quantity_reduction_offer(
    db: AsyncSession, user: CurrentUser, order_id: int, offer_id: int
) -> OrderDetailOut:
    if not user.can_reception():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    tenant = _tenant(user)
    order = await _load_order(db, order_id, tenant)
    if not order:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    await _assert_reception_staff_order_location(db, user, order)
    off = await db.get(QuantityReductionOffer, offer_id)
    if not off or off.order_id != order.id:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    if off.status != "pending":
        raise HTTPException(status_code=400, detail=tr("validation_error"))
    off.status = "withdrawn"
    await _sync_order_status_if_no_pending_subs(db, order)
    log_order_staff_event(
        db,
        order,
        user,
        "quantity_reduction_offer_cancelled",
        meta={"offer_id": offer_id, "line_id": off.line_id},
    )
    await add_customer(
        db,
        tenant_id=tenant,
        recipient_sub=order.client_zitadel_id,
        order_id=order.id,
        event_type="customer.quantity_reduction_withdrawn",
        meta={"offer_id": offer_id},
    )
    await db.commit()
    order = await _load_order(db, order_id, tenant)
    assert order is not None
    return await order_to_detail_out(db, order, viewer=user)


async def staff_cancel_substitution_offer(
    db: AsyncSession, user: CurrentUser, order_id: int, offer_id: int
) -> OrderDetailOut:
    if not user.can_reception():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    tenant = _tenant(user)
    order = await _load_order(db, order_id, tenant)
    if not order:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    await _assert_reception_staff_order_location(db, user, order)
    off = await db.get(SubstitutionOffer, offer_id)
    if not off or off.order_id != order.id:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    if off.status != "pending":
        raise HTTPException(status_code=400, detail=tr("validation_error"))
    off.status = "withdrawn"
    await _sync_order_status_if_no_pending_subs(db, order)
    log_order_staff_event(
        db,
        order,
        user,
        "substitution_offer_cancelled",
        meta={"offer_id": offer_id, "line_id": off.line_id},
    )
    await add_customer(
        db,
        tenant_id=tenant,
        recipient_sub=order.client_zitadel_id,
        order_id=order.id,
        event_type="customer.substitution_withdrawn",
        meta={"offer_id": offer_id},
    )
    await db.commit()
    order = await _load_order(db, order_id, tenant)
    assert order is not None
    return await order_to_detail_out(db, order, viewer=user)


async def propose_reception_changes(
    db: AsyncSession, user: CurrentUser, order_id: int, body: ReceptionProposeChangesBody
) -> OrderDetailOut:
    if not user.can_reception():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    tenant = _tenant(user)
    order = await _load_order(db, order_id, tenant)
    if not order:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    await _assert_reception_staff_order_location(db, user, order)
    if order.status != OrderStatus.PENDING_CONFIRM.value:
        raise HTTPException(status_code=400, detail=tr("order_not_editable"))
    if await _pending_customer_actions_count(db, order.id) > 0:
        raise HTTPException(status_code=400, detail=tr("order_pending_customer"))
    prev_status = order.status

    line_ids = [c.line_id for c in body.changes]
    if len(line_ids) != len(set(line_ids)):
        raise HTTPException(status_code=400, detail=tr("validation_error"))

    lines_by_id: dict[int, OrderLine] = {ln.id: ln for ln in (order.lines or [])}

    for ch in body.changes:
        line = lines_by_id.get(ch.line_id)
        if not line:
            raise HTTPException(status_code=404, detail=tr("not_found"))
        if ch.offered_product_ids:
            seen = list(dict.fromkeys(ch.offered_product_ids))[:3]
            if not seen:
                raise HTTPException(status_code=400, detail=tr("validation_error"))
            for pid in seen:
                if pid == line.product_id:
                    raise HTTPException(status_code=400, detail=tr("validation_error"))
                pr = await db.get(Product, pid)
                if not pr or pr.tenant_id != tenant or not pr.available:
                    raise HTTPException(status_code=400, detail=tr("product_unavailable"))
        if ch.proposed_quantity is not None:
            if ch.proposed_quantity >= line.quantity:
                raise HTTPException(status_code=400, detail=tr("line_quantity_must_decrease"))

    for ch in body.changes:
        await _reject_pending_substitution_offers_for_line(db, order.id, ch.line_id)
        await _reject_pending_quantity_offers_for_line(db, order.id, ch.line_id)
    await _sync_order_status_if_no_pending_subs(db, order)

    created = 0
    for ch in sorted(body.changes, key=lambda c: c.line_id):
        line = lines_by_id[ch.line_id]
        if ch.offered_product_ids:
            seen = list(dict.fromkeys(ch.offered_product_ids))[:3]
            sub_off = SubstitutionOffer(
                order_id=order.id,
                line_id=line.id,
                offered_product_ids=seen,
                status="pending",
            )
            db.add(sub_off)
            await db.flush()
            log_order_staff_event(
                db,
                order,
                user,
                "substitution_offer_created",
                meta={"offer_id": sub_off.id, "line_id": line.id, "batch": True},
            )
            created += 1
        if ch.proposed_quantity is not None:
            qty_off = QuantityReductionOffer(
                order_id=order.id,
                line_id=line.id,
                previous_quantity=line.quantity,
                proposed_quantity=ch.proposed_quantity,
                status="pending",
            )
            db.add(qty_off)
            await db.flush()
            log_order_staff_event(
                db,
                order,
                user,
                "quantity_reduction_proposed",
                meta={
                    "offer_id": qty_off.id,
                    "line_id": line.id,
                    "proposed_quantity": ch.proposed_quantity,
                    "batch": True,
                },
            )
            created += 1

    if created > 0:
        order.status = OrderStatus.PARTIAL_WAITING_SWAP.value
    await db.flush()
    log_order_staff_event(
        db,
        order,
        user,
        "reception_batch_proposed",
        from_status=prev_status,
        to_status=order.status,
        meta={"change_count": created},
    )
    await add_customer(
        db,
        tenant_id=tenant,
        recipient_sub=order.client_zitadel_id,
        order_id=order.id,
        event_type="customer.reception_batch_proposed",
        meta={"change_count": created},
    )
    await db.commit()
    order = await _load_order(db, order_id, tenant)
    assert order is not None
    return await order_to_detail_out(db, order, viewer=user)


async def customer_reject_all_pending(db: AsyncSession, user: CurrentUser, order_id: int) -> OrderDetailOut:
    tenant = _tenant(user)
    order = await _load_order(db, order_id, tenant)
    owner_keys = await legacy_client_zitadel_keys(db, user)
    if not order or order.client_zitadel_id not in owner_keys:
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    n = 0
    stmt = select(SubstitutionOffer).where(
        SubstitutionOffer.order_id == order.id, SubstitutionOffer.status == "pending"
    )
    for off in (await db.scalars(stmt)).all():
        off.status = "rejected"
        n += 1
    stmt2 = select(QuantityReductionOffer).where(
        QuantityReductionOffer.order_id == order.id, QuantityReductionOffer.status == "pending"
    )
    for off in (await db.scalars(stmt2)).all():
        off.status = "rejected"
        n += 1
    if n == 0:
        raise HTTPException(status_code=400, detail=tr("validation_error"))
    await _sync_order_status_if_no_pending_subs(db, order)
    await add_reception(
        db,
        tenant_id=tenant,
        order_id=order.id,
        event_type="reception.customer_pending_bulk",
        meta={"rejected_all": True},
    )
    await db.commit()
    order = await _load_order(db, order_id, tenant)
    assert order is not None
    return await order_to_detail_out(db, order, viewer=user)


async def customer_accept_all_pending(db: AsyncSession, user: CurrentUser, order_id: int) -> OrderDetailOut:
    tenant = _tenant(user)
    order = await _load_order(db, order_id, tenant)
    owner_keys = await legacy_client_zitadel_keys(db, user)
    if not order or order.client_zitadel_id not in owner_keys:
        raise HTTPException(status_code=403, detail=tr("forbidden"))

    sub_stmt = select(SubstitutionOffer).where(
        SubstitutionOffer.order_id == order.id, SubstitutionOffer.status == "pending"
    )
    subs = list((await db.scalars(sub_stmt)).all())
    for off in subs:
        if len(off.offered_product_ids or []) > 1:
            raise HTTPException(status_code=400, detail=tr("order_bulk_accept_needs_pick"))

    qty_stmt = select(QuantityReductionOffer).where(
        QuantityReductionOffer.order_id == order.id, QuantityReductionOffer.status == "pending"
    )
    qtys = list((await db.scalars(qty_stmt)).all())
    if not subs and not qtys:
        raise HTTPException(status_code=400, detail=tr("validation_error"))

    for off in qtys:
        line = await db.get(OrderLine, off.line_id)
        if not line or line.order_id != order.id or line.quantity != off.previous_quantity:
            raise HTTPException(status_code=400, detail=tr("validation_error"))
        if off.proposed_quantity < 1 or off.proposed_quantity >= off.previous_quantity:
            raise HTTPException(status_code=400, detail=tr("validation_error"))
        line.quantity = off.proposed_quantity
        off.status = "accepted"

    for off in subs:
        line = await db.get(OrderLine, off.line_id)
        if not line or line.order_id != order.id:
            raise HTTPException(status_code=404, detail=tr("not_found"))
        pid = int(off.offered_product_ids[0])
        new_p = await db.get(Product, pid)
        if not new_p or new_p.tenant_id != tenant or not new_p.available:
            raise HTTPException(status_code=400, detail=tr("product_unavailable"))
        old_id = line.product_id
        line.substituted_from_product_id = old_id
        line.product_id = new_p.id
        line.unit_price = effective_price_gross(new_p)
        line.unit_price_net = effective_price_net(new_p)
        line.vat_rate_percent = new_p.vat_rate_percent
        line.sale_percent_applied = sale_percent_at_purchase(new_p)
        line.catalog_unit_price_gross = new_p.price_gross
        line.catalog_unit_price_net = new_p.price_net
        off.selected_product_id = pid
        off.status = "accepted"

    await _recalc_order_total(db, order)
    await _sync_order_status_if_no_pending_subs(db, order)
    await add_reception(
        db,
        tenant_id=tenant,
        order_id=order.id,
        event_type="reception.customer_pending_bulk",
        meta={"accepted_all": True},
    )
    await db.commit()
    order = await _load_order(db, order_id, tenant)
    assert order is not None
    return await order_to_detail_out(db, order, viewer=user)


