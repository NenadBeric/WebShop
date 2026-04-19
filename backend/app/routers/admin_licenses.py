"""Upravljanje licencama — isključivo ADMIN."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session
from app.dependencies import AuthUser
from app.i18n import tr
from app.models.license import LicenseAddon, LicensePlan, LicenseSubscription
from app.rbac import CurrentUser
from app.schemas.license import (
    LicenseAddonOut,
    LicenseAddonUpsert,
    LicensePlanCreate,
    LicensePlanOut,
    LicensePlanPatch,
    LicenseSubscriptionCreate,
    LicenseSubscriptionOut,
    LicenseSubscriptionPatch,
    LicenseSubscriptionsBulkCreate,
    LicenseUsageOut,
)
from app.services import license_service
from app.services.license_service import get_latest_subscription as fetch_subscription
from app.services.tenant_service import ensure_profile

router = APIRouter(prefix="/admin/licenses", tags=["admin_licenses"])


def _require_admin(user: AuthUser) -> CurrentUser:
    if not user.is_admin():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    return user


def _plan_out(p: LicensePlan) -> LicensePlanOut:
    return LicensePlanOut(
        id=p.id,
        code=p.code,
        name=p.name,
        max_pickup_locations=p.max_pickup_locations,
        max_staff_seats=p.max_staff_seats,
        max_products=p.max_products,
        max_orders_per_month=p.max_orders_per_month,
        max_distinct_buyers_30d=p.max_distinct_buyers_30d,
        price=float(p.price) if p.price is not None else None,
        is_active=bool(p.is_active),
    )


def _sub_out(s: LicenseSubscription) -> LicenseSubscriptionOut:
    return LicenseSubscriptionOut(
        id=s.id,
        tenant_id=s.tenant_id,
        plan=_plan_out(s.plan),
        status=s.status,
        billing_cycle=s.billing_cycle,
        discount_percent=int(s.discount_percent or 0),
        valid_from=s.valid_from,
        valid_to=s.valid_to,
        blocked_at=s.blocked_at,
        blocked_reason=s.blocked_reason,
        auto_renew=bool(s.auto_renew),
        addons=[LicenseAddonOut.model_validate(a) for a in (s.addons or [])],
    )


@router.get("/plans", response_model=list[LicensePlanOut])
async def list_plans(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    _require_admin(user)
    rows = (await db.execute(select(LicensePlan).order_by(LicensePlan.id))).scalars().all()
    return [_plan_out(p) for p in rows]


@router.post("/plans", response_model=LicensePlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(
    body: LicensePlanCreate,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    _require_admin(user)
    code = body.code.strip()
    dup = (await db.execute(select(LicensePlan).where(LicensePlan.code == code))).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail=tr("validation_error"))
    p = LicensePlan(
        code=code,
        name=body.name.strip(),
        max_pickup_locations=body.max_pickup_locations,
        max_staff_seats=body.max_staff_seats,
        max_products=body.max_products,
        max_orders_per_month=body.max_orders_per_month,
        max_distinct_buyers_30d=body.max_distinct_buyers_30d,
        price=Decimal(str(body.price)) if body.price is not None else None,
        is_active=body.is_active,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return _plan_out(p)


@router.patch("/plans/{plan_id}", response_model=LicensePlanOut)
async def patch_plan(
    plan_id: int,
    body: LicensePlanPatch,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    _require_admin(user)
    p = await db.get(LicensePlan, plan_id)
    if not p:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        p.name = str(data["name"]).strip()
    for key in (
        "max_pickup_locations",
        "max_staff_seats",
        "max_products",
        "max_orders_per_month",
        "max_distinct_buyers_30d",
    ):
        if key in data:
            setattr(p, key, data[key])
    if "price" in data:
        p.price = Decimal(str(data["price"])) if data["price"] is not None else None
    if "is_active" in data and data["is_active"] is not None:
        p.is_active = bool(data["is_active"])
    await db.commit()
    await db.refresh(p)
    return _plan_out(p)


@router.post("/seed-default-plans", response_model=dict)
async def seed_defaults(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    _require_admin(user)
    created = await license_service.seed_default_plans(db)
    return {"created_plan_codes": created}


@router.get("/subscriptions/latest", response_model=LicenseSubscriptionOut | None)
async def read_latest_subscription(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
    tenant_id: str = Query(..., min_length=1, max_length=64),
):
    _require_admin(user)
    sub = await fetch_subscription(db, tenant_id.strip())
    if not sub:
        return None
    return _sub_out(sub)


@router.post("/subscriptions", response_model=LicenseSubscriptionOut, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    body: LicenseSubscriptionCreate,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    _require_admin(user)
    tid = body.tenant_id.strip()
    await ensure_profile(db, tid)
    row = await license_service.upsert_subscription_from_create(db, body)
    return _sub_out(row)


@router.get("/subscriptions", response_model=list[LicenseSubscriptionOut])
async def list_subscriptions(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
    limit: int = Query(500, ge=1, le=1000),
):
    _require_admin(user)
    latest = (
        select(LicenseSubscription.tenant_id.label("tid"), func.max(LicenseSubscription.id).label("max_id"))
        .group_by(LicenseSubscription.tenant_id)
        .subquery()
    )
    stmt = (
        select(LicenseSubscription)
        .join(latest, LicenseSubscription.id == latest.c.max_id)
        .options(selectinload(LicenseSubscription.plan), selectinload(LicenseSubscription.addons))
        .order_by(LicenseSubscription.tenant_id.asc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_sub_out(s) for s in rows]


@router.post("/subscriptions/bulk", response_model=list[LicenseSubscriptionOut])
async def bulk_create_subscriptions(
    body: LicenseSubscriptionsBulkCreate,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    _require_admin(user)
    out: list[LicenseSubscriptionOut] = []
    for tid in body.tenant_ids:
        await ensure_profile(db, tid)
        sub = await license_service.upsert_subscription_from_create(
            db,
            LicenseSubscriptionCreate(
                tenant_id=tid,
                plan_id=body.plan_id,
                status=body.status,
                billing_cycle=body.billing_cycle,
                discount_percent=body.discount_percent,
                valid_from=body.valid_from,
                valid_to=body.valid_to,
                auto_renew=body.auto_renew,
                blocked_reason=body.blocked_reason,
            ),
        )
        out.append(_sub_out(sub))
    return out


@router.patch("/subscriptions/{subscription_id}", response_model=LicenseSubscriptionOut)
async def patch_subscription(
    subscription_id: int,
    body: LicenseSubscriptionPatch,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    _require_admin(user)
    row = await db.get(LicenseSubscription, subscription_id)
    if not row:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    data = body.model_dump(exclude_unset=True)
    if "plan_id" in data and data["plan_id"] is not None:
        new_id = int(data["plan_id"])
        plan = await db.get(LicensePlan, new_id)
        if not plan:
            raise HTTPException(status_code=400, detail=tr("validation_error"))
        if new_id != row.plan_id and not plan.is_active:
            raise HTTPException(status_code=400, detail=tr("validation_error"))
        row.plan_id = new_id
    if "status" in data and data["status"] is not None:
        row.status = data["status"]
    if "billing_cycle" in data and data["billing_cycle"] is not None:
        row.billing_cycle = data["billing_cycle"]
    if "discount_percent" in data and data["discount_percent"] is not None:
        row.discount_percent = int(data["discount_percent"])
    if "valid_from" in data:
        row.valid_from = data["valid_from"]
    if "valid_to" in data:
        row.valid_to = data["valid_to"]
    if "auto_renew" in data and data["auto_renew"] is not None:
        row.auto_renew = bool(data["auto_renew"])
    if "blocked_reason" in data:
        br = data["blocked_reason"]
        if br is None or (isinstance(br, str) and not str(br).strip()):
            row.blocked_reason = None
            row.blocked_at = None
        else:
            row.blocked_reason = str(br).strip()[:255]
            row.blocked_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row, ["plan", "addons"])
    return _sub_out(row)


@router.post("/subscriptions/{subscription_id}/addons", response_model=LicenseSubscriptionOut)
async def upsert_addon(
    subscription_id: int,
    body: LicenseAddonUpsert,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    _require_admin(user)
    sub = await db.get(LicenseSubscription, subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    code = body.addon_code.strip()
    r = await db.execute(
        select(LicenseAddon).where(
            LicenseAddon.subscription_id == subscription_id,
            LicenseAddon.addon_code == code,
        )
    )
    ad = r.scalar_one_or_none()
    if ad:
        ad.quantity = int(body.quantity)
    else:
        db.add(LicenseAddon(subscription_id=subscription_id, addon_code=code, quantity=int(body.quantity)))
    await db.commit()
    await db.refresh(sub, ["plan", "addons"])
    return _sub_out(sub)


@router.get("/usage/{tenant_id}", response_model=LicenseUsageOut)
async def get_usage(
    tenant_id: str,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    _require_admin(user)
    tid = tenant_id.strip()
    await ensure_profile(db, tid)
    payload = await license_service.usage_payload(db, tid)
    return LicenseUsageOut(**payload)
