"""Kvota i status pretplate po tenant_id (WebShop). ADMIN zaobilazi sve provere."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.i18n import tr
from app.models.license import LicensePlan, LicenseSubscription
from app.schemas.license import LicenseSubscriptionCreate
from app.models.product import Product
from app.models.shop_order import Order
from app.models.tenant_profile import TenantLocation
from app.models.tenant_staff import TenantStaff
from app.rbac import CurrentUser

BAD_STATUSES = ("rejected", "expired")

STATUS_ACTIVE = "ACTIVE"
STATUS_PAST_DUE = "PAST_DUE"
STATUS_SUSPENDED = "SUSPENDED"
STATUS_EXPIRED = "EXPIRED"
STATUS_CANCELLED = "CANCELLED"

ADD_LOCATION = "ADD_LOCATION"
ADD_STAFF_SEAT = "ADD_STAFF_SEAT"
ADD_PRODUCTS_100 = "ADD_PRODUCTS_100"
ADD_MONTHLY_ORDERS_500 = "ADD_MONTHLY_ORDERS_500"
ADD_DISTINCT_BUYERS_10 = "ADD_DISTINCT_BUYERS_10"

STAFF_COUNT_ROLES = frozenset({"WEBSHOP_RECEPTION", "WEBSHOP_MANAGER", "WEBSHOP_OWNER", "ADMIN"})


@dataclass(frozen=True)
class Limits:
    max_pickup_locations: int | None = None
    max_staff_seats: int | None = None
    max_products: int | None = None
    max_orders_per_month: int | None = None
    max_distinct_buyers_30d: int | None = None


def _http_license(_code: str, message_key: str, http_status: int = 403) -> HTTPException:
    return HTTPException(status_code=http_status, detail=tr(message_key))


async def get_latest_subscription(db: AsyncSession, tenant_id: str) -> LicenseSubscription | None:
    stmt = (
        select(LicenseSubscription)
        .options(selectinload(LicenseSubscription.addons), selectinload(LicenseSubscription.plan))
        .where(LicenseSubscription.tenant_id == tenant_id)
        .order_by(LicenseSubscription.id.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalars().first()


def compute_limits(sub: LicenseSubscription | None) -> Limits:
    if not sub or not sub.plan or not sub.plan.is_active:
        return Limits()
    base = sub.plan
    addons = sub.addons or []

    add_loc = sum(a.quantity for a in addons if a.addon_code == ADD_LOCATION)
    add_staff = sum(a.quantity for a in addons if a.addon_code == ADD_STAFF_SEAT)
    add_prod = sum(a.quantity for a in addons if a.addon_code == ADD_PRODUCTS_100) * 100
    add_ord = sum(a.quantity for a in addons if a.addon_code == ADD_MONTHLY_ORDERS_500) * 500
    add_buy = sum(a.quantity for a in addons if a.addon_code == ADD_DISTINCT_BUYERS_10) * 10

    def cap(base_v: int | None, extra: int) -> int | None:
        if base_v is None:
            return None
        return int(base_v) + int(extra)

    return Limits(
        max_pickup_locations=cap(base.max_pickup_locations, add_loc),
        max_staff_seats=cap(base.max_staff_seats, add_staff),
        max_products=cap(base.max_products, add_prod),
        max_orders_per_month=cap(base.max_orders_per_month, add_ord),
        max_distinct_buyers_30d=cap(base.max_distinct_buyers_30d, add_buy),
    )


async def count_active_pickup_locations(db: AsyncSession, tenant_id: str) -> int:
    q = await db.execute(
        select(func.count())
        .select_from(TenantLocation)
        .where(TenantLocation.tenant_id == tenant_id, TenantLocation.is_active.is_(True))
    )
    return int(q.scalar() or 0)


async def count_staff_seats(db: AsyncSession, tenant_id: str) -> int:
    q = await db.execute(
        select(func.count())
        .select_from(TenantStaff)
        .where(
            TenantStaff.tenant_id == tenant_id,
            TenantStaff.active.is_(True),
            TenantStaff.role.in_(tuple(STAFF_COUNT_ROLES)),
        )
    )
    return int(q.scalar() or 0)


async def count_products(db: AsyncSession, tenant_id: str) -> int:
    q = await db.execute(select(func.count()).select_from(Product).where(Product.tenant_id == tenant_id))
    return int(q.scalar() or 0)


def _utc_month_bounds() -> tuple[datetime, datetime]:
    now = datetime.now(UTC)
    start = datetime(now.year, now.month, 1, tzinfo=UTC)
    if now.month == 12:
        end = datetime(now.year + 1, 1, 1, tzinfo=UTC)
    else:
        end = datetime(now.year, now.month + 1, 1, tzinfo=UTC)
    return start, end


async def count_orders_this_month(db: AsyncSession, tenant_id: str) -> int:
    start, end = _utc_month_bounds()
    q = await db.execute(
        select(func.count())
        .select_from(Order)
        .where(
            Order.tenant_id == tenant_id,
            Order.created_at >= start,
            Order.created_at < end,
            ~Order.status.in_(BAD_STATUSES),
        )
    )
    return int(q.scalar() or 0)


async def count_distinct_buyers_30d(db: AsyncSession, tenant_id: str) -> int:
    since = datetime.now(UTC) - timedelta(days=30)
    q = await db.execute(
        select(func.count(func.distinct(Order.client_zitadel_id)))
        .select_from(Order)
        .where(
            Order.tenant_id == tenant_id,
            Order.created_at >= since,
            ~Order.status.in_(BAD_STATUSES),
        )
    )
    return int(q.scalar() or 0)


async def buyer_has_order_in_window(db: AsyncSession, tenant_id: str, buyer_sub: str) -> bool:
    since = datetime.now(UTC) - timedelta(days=30)
    q = await db.execute(
        select(func.count())
        .select_from(Order)
        .where(
            Order.tenant_id == tenant_id,
            Order.client_zitadel_id == buyer_sub,
            Order.created_at >= since,
            ~Order.status.in_(BAD_STATUSES),
        )
    )
    return int(q.scalar() or 0) > 0


async def usage_snapshot(db: AsyncSession, tenant_id: str) -> tuple[dict[str, int], Limits]:
    lim = compute_limits(await get_latest_subscription(db, tenant_id))
    usage = {
        "pickup_locations": await count_active_pickup_locations(db, tenant_id),
        "staff_seats": await count_staff_seats(db, tenant_id),
        "products": await count_products(db, tenant_id),
        "orders_this_month": await count_orders_this_month(db, tenant_id),
        "distinct_buyers_30d": await count_distinct_buyers_30d(db, tenant_id),
    }
    return usage, lim


def _remaining(usage: int, lim: int | None) -> int | None:
    if lim is None:
        return None
    return max(0, int(lim) - int(usage))


async def usage_payload(db: AsyncSession, tenant_id: str) -> dict:
    usage, lim = await usage_snapshot(db, tenant_id)
    limits = {
        "max_pickup_locations": lim.max_pickup_locations,
        "max_staff_seats": lim.max_staff_seats,
        "max_products": lim.max_products,
        "max_orders_per_month": lim.max_orders_per_month,
        "max_distinct_buyers_30d": lim.max_distinct_buyers_30d,
    }
    remaining = {
        "pickup_locations": _remaining(usage["pickup_locations"], lim.max_pickup_locations),
        "staff_seats": _remaining(usage["staff_seats"], lim.max_staff_seats),
        "products": _remaining(usage["products"], lim.max_products),
        "orders_this_month": _remaining(usage["orders_this_month"], lim.max_orders_per_month),
        "distinct_buyers_30d": _remaining(usage["distinct_buyers_30d"], lim.max_distinct_buyers_30d),
    }
    return {"tenant_id": tenant_id, "limits": limits, "usage": usage, "remaining": remaining}


async def enforce_tenant_write_allowed(db: AsyncSession, user: CurrentUser) -> None:
    if user.is_admin():
        return
    tenant_id = (user.tenant_id or "").strip()
    if not tenant_id:
        return
    sub = await get_latest_subscription(db, tenant_id)
    if not sub:
        return
    if sub.blocked_at is not None or (sub.blocked_reason and str(sub.blocked_reason).strip()):
        raise _http_license("SUBSCRIPTION_PAYMENT_BLOCKED", "license_subscription_payment_blocked")
    today = date.today()
    if sub.valid_to and sub.valid_to < today and sub.status == STATUS_ACTIVE:
        raise _http_license("SUBSCRIPTION_EXPIRED", "license_subscription_expired")
    if sub.status == STATUS_PAST_DUE:
        raise _http_license("SUBSCRIPTION_PAST_DUE", "license_subscription_past_due")
    if sub.status in (STATUS_SUSPENDED, STATUS_EXPIRED, STATUS_CANCELLED):
        raise _http_license("SUBSCRIPTION_BLOCKED", "license_subscription_blocked")


async def enforce_pickup_location_quota(db: AsyncSession, tenant_id: str, proposed_active: int) -> None:
    sub = await get_latest_subscription(db, tenant_id)
    lim = compute_limits(sub).max_pickup_locations
    if lim is None:
        return
    if proposed_active > int(lim):
        raise _http_license("LICENSE_LIMIT_REACHED", "license_limit_locations")


async def enforce_staff_seat_quota(db: AsyncSession, tenant_id: str) -> None:
    sub = await get_latest_subscription(db, tenant_id)
    lim = compute_limits(sub).max_staff_seats
    if lim is None:
        return
    cur = await count_staff_seats(db, tenant_id)
    if cur >= int(lim):
        raise _http_license("LICENSE_LIMIT_REACHED", "license_limit_staff")


async def enforce_product_quota(db: AsyncSession, tenant_id: str) -> None:
    sub = await get_latest_subscription(db, tenant_id)
    lim = compute_limits(sub).max_products
    if lim is None:
        return
    cur = await count_products(db, tenant_id)
    if cur >= int(lim):
        raise _http_license("LICENSE_LIMIT_REACHED", "license_limit_products")


async def enforce_new_order_quotas(db: AsyncSession, tenant_id: str, buyer_sub: str) -> None:
    sub = await get_latest_subscription(db, tenant_id)
    limits = compute_limits(sub)

    if limits.max_orders_per_month is not None:
        cur = await count_orders_this_month(db, tenant_id)
        if cur >= int(limits.max_orders_per_month):
            raise _http_license("LICENSE_LIMIT_REACHED", "license_limit_orders_month")

    if limits.max_distinct_buyers_30d is not None:
        if not await buyer_has_order_in_window(db, tenant_id, buyer_sub):
            buyers = await count_distinct_buyers_30d(db, tenant_id)
            if buyers >= int(limits.max_distinct_buyers_30d):
                raise _http_license("LICENSE_LIMIT_REACHED", "license_limit_buyers_30d")


async def upsert_subscription_from_create(db: AsyncSession, body: LicenseSubscriptionCreate) -> LicenseSubscription:
    """Kreira ili ažurira poslednju pretplatu za tenant (isto ponašanje kao admin POST /subscriptions)."""
    tid = body.tenant_id.strip()
    plan = await db.get(LicensePlan, body.plan_id)
    if not plan or not plan.is_active:
        raise _http_license("INVALID_PLAN", "validation_error")
    exist = await get_latest_subscription(db, tid)
    br = (body.blocked_reason or "").strip() or None
    if exist:
        exist.plan_id = body.plan_id
        exist.status = body.status
        exist.billing_cycle = body.billing_cycle
        exist.discount_percent = body.discount_percent
        exist.valid_from = body.valid_from
        exist.valid_to = body.valid_to
        exist.auto_renew = body.auto_renew
        exist.blocked_reason = br
        exist.blocked_at = datetime.now(UTC) if br else None
        await db.commit()
        await db.refresh(exist, ["plan", "addons"])
        return exist
    row = LicenseSubscription(
        tenant_id=tid,
        plan_id=body.plan_id,
        status=body.status,
        billing_cycle=body.billing_cycle,
        discount_percent=body.discount_percent,
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        auto_renew=body.auto_renew,
        blocked_reason=br,
        blocked_at=(datetime.now(UTC) if br else None),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row, ["plan", "addons"])
    return row


async def seed_default_plans(db: AsyncSession) -> list[str]:
    """Idempotent: osnovni paketi ako ne postoje."""
    defaults: list[tuple[str, str, tuple]] = [
        (
            "WS_START",
            "WebShop Start",
            (1, 3, 200, 400, 80),
        ),
        (
            "WS_GROW",
            "WebShop Grow",
            (3, 10, 800, 2500, 300),
        ),
        (
            "WS_PRO",
            "WebShop Pro",
            (12, 40, 5000, 15000, 1500),
        ),
    ]
    created: list[str] = []
    for code, name, caps in defaults:
        existing = (await db.execute(select(LicensePlan).where(LicensePlan.code == code))).scalar_one_or_none()
        if existing:
            continue
        loc, staff, prod, ord_m, buyers = caps
        db.add(
            LicensePlan(
                code=code,
                name=name,
                max_pickup_locations=loc,
                max_staff_seats=staff,
                max_products=prod,
                max_orders_per_month=ord_m,
                max_distinct_buyers_30d=buyers,
                price=Decimal("0"),
                is_active=True,
            )
        )
        created.append(code)
    if created:
        await db.commit()
    return created
