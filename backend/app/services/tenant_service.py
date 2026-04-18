from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.i18n import tr
from app.models.shop_order import Order, OrderStatus
from app.services.order_staff_audit import log_order_staff_event
from app.models.tenant_profile import TenantLocation, TenantProfile
from app.rbac import CurrentUser
from app.schemas.tenant import (
    TenantLocationIn,
    TenantLocationOut,
    TenantOrderRulesOut,
    TenantProfileOut,
    TenantProfileUpdate,
)

logger = logging.getLogger(__name__)


def _tenant(user: CurrentUser) -> str:
    return user.tenant_id


async def ensure_profile(db: AsyncSession, tenant_id: str) -> TenantProfile:
    row = await db.get(TenantProfile, tenant_id)
    if row is None:
        row = TenantProfile(tenant_id=tenant_id)
        db.add(row)
        await db.flush()
    return row


def _profile_out(p: TenantProfile) -> TenantProfileOut:
    locs = sorted(p.locations or [], key=lambda x: (x.sort_order, x.id))
    return TenantProfileOut(
        tenant_id=p.tenant_id,
        legal_name=p.legal_name,
        trade_name=p.trade_name,
        pib=p.pib,
        mb=p.mb,
        address_line=p.address_line,
        city=p.city,
        postal_code=p.postal_code,
        country=p.country,
        phone=p.phone,
        contact_email=p.contact_email,
        website=p.website,
        timezone=p.timezone,
        terms_note=p.terms_note,
        max_schedule_days_ahead=p.max_schedule_days_ahead,
        min_notice_hours_before_pickup=p.min_notice_hours_before_pickup,
        pickup_grace_hours_after_slot=p.pickup_grace_hours_after_slot,
        locations=[TenantLocationOut.model_validate(x) for x in locs],
        telegram_chat_id=p.telegram_chat_id or "",
        telegram_bot_token_set=bool((p.telegram_bot_token or "").strip()),
        telegram_notify_new_order=bool(p.telegram_notify_new_order),
        notify_before_pickup_minutes=int(p.notify_before_pickup_minutes or 10),
        day_reminder_hour_local=int(p.day_reminder_hour_local or 8),
        smtp_host=p.smtp_host or "",
        smtp_port=int(p.smtp_port or 587),
        smtp_user=p.smtp_user or "",
        smtp_from=p.smtp_from or "",
        smtp_use_tls=bool(p.smtp_use_tls),
        smtp_password_set=bool((p.smtp_password or "").strip()),
    )


async def get_profile_out(db: AsyncSession, tenant_id: str) -> TenantProfileOut:
    p = await ensure_profile(db, tenant_id)
    await db.refresh(p, ["locations"])
    return _profile_out(p)


async def get_order_rules(db: AsyncSession, tenant_id: str) -> TenantOrderRulesOut:
    p = await ensure_profile(db, tenant_id)
    await db.refresh(p, ["locations"])
    locs = [TenantLocationOut.model_validate(x) for x in (p.locations or []) if x.is_active]
    locs.sort(key=lambda x: (x.sort_order, x.id))
    return TenantOrderRulesOut(
        max_schedule_days_ahead=p.max_schedule_days_ahead,
        min_notice_hours_before_pickup=p.min_notice_hours_before_pickup,
        pickup_grace_hours_after_slot=p.pickup_grace_hours_after_slot,
        timezone=p.timezone,
        locations=locs,
    )


def _resolve_tz(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name or "Europe/Belgrade")
    except ZoneInfoNotFoundError:
        return ZoneInfo("Europe/Belgrade")


async def validate_pickup_datetime(
    db: AsyncSession,
    tenant_id: str,
    *,
    pickup_at: datetime,
) -> None:
    """HTTPException ako pickup_at krsi pravila tenant profila."""
    from fastapi import HTTPException
    p = await ensure_profile(db, tenant_id)
    tz = _resolve_tz(p.timezone)
    now_local = datetime.now(tz)
    pickup_local = pickup_at.astimezone(tz) if pickup_at.tzinfo else pickup_at.replace(tzinfo=UTC).astimezone(tz)

    earliest = now_local + timedelta(hours=p.min_notice_hours_before_pickup)
    if pickup_local < earliest:
        raise HTTPException(status_code=400, detail=tr("pickup_too_soon"))

    last_day: date = now_local.date() + timedelta(days=p.max_schedule_days_ahead)
    if pickup_local.date() > last_day:
        raise HTTPException(status_code=400, detail=tr("pickup_too_far"))


async def update_profile(db: AsyncSession, user: CurrentUser, body: TenantProfileUpdate) -> TenantProfileOut:
    tenant = _tenant(user)
    p = await ensure_profile(db, tenant)

    codes: set[str] = set()
    for loc in body.locations:
        c = loc.code.strip().lower()
        if c in codes:
            from fastapi import HTTPException

            raise HTTPException(status_code=400, detail=tr("tenant_location_duplicate_code"))
        codes.add(c)

    try:
        _ = ZoneInfo(body.timezone.strip() or "Europe/Belgrade")
    except ZoneInfoNotFoundError:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=tr("tenant_timezone_invalid")) from None

    p.legal_name = body.legal_name.strip()
    p.trade_name = body.trade_name.strip()
    p.pib = body.pib.strip()
    p.mb = body.mb.strip()
    p.address_line = body.address_line.strip()
    p.city = body.city.strip()
    p.postal_code = body.postal_code.strip()
    p.country = (body.country or "RS").strip()[:2].upper()
    p.phone = body.phone.strip()
    p.contact_email = body.contact_email.strip()
    p.website = body.website.strip()
    p.timezone = body.timezone.strip() or "Europe/Belgrade"
    p.terms_note = body.terms_note.strip()
    p.max_schedule_days_ahead = body.max_schedule_days_ahead
    p.min_notice_hours_before_pickup = body.min_notice_hours_before_pickup
    p.pickup_grace_hours_after_slot = body.pickup_grace_hours_after_slot

    p.telegram_chat_id = (body.telegram_chat_id or "").strip()[:64]
    if body.telegram_bot_token is not None:
        p.telegram_bot_token = body.telegram_bot_token.strip()[:128]
    p.telegram_notify_new_order = body.telegram_notify_new_order
    p.notify_before_pickup_minutes = body.notify_before_pickup_minutes
    p.day_reminder_hour_local = body.day_reminder_hour_local
    p.smtp_host = (body.smtp_host or "").strip()[:255]
    p.smtp_port = body.smtp_port
    p.smtp_user = (body.smtp_user or "").strip()[:255]
    p.smtp_from = (body.smtp_from or "").strip()[:255]
    p.smtp_use_tls = body.smtp_use_tls
    if body.smtp_password is not None:
        p.smtp_password = body.smtp_password.strip()[:255]

    await db.execute(delete(TenantLocation).where(TenantLocation.tenant_id == tenant))
    for i, loc in enumerate(body.locations):
        db.add(
            TenantLocation(
                tenant_id=tenant,
                code=loc.code.strip(),
                name=loc.name.strip(),
                address_line=loc.address_line.strip(),
                sort_order=loc.sort_order if loc.sort_order != 0 else i,
                is_active=loc.is_active,
            )
        )
    await db.commit()
    await db.refresh(p, ["locations"])
    return _profile_out(p)


async def validate_pickup_location(
    db: AsyncSession, tenant_id: str, location_id: int | None
) -> None:
    from fastapi import HTTPException

    if location_id is None:
        return
    loc = await db.get(TenantLocation, location_id)
    if not loc or loc.tenant_id != tenant_id or not loc.is_active:
        raise HTTPException(status_code=400, detail=tr("pickup_location_invalid"))


async def expire_overdue_ready_orders(db: AsyncSession) -> int:
    """ready + pickup_at -> expired ako je prosao rok (pickup_at + grace)."""
    stmt = select(Order).where(Order.status == OrderStatus.READY.value, Order.pickup_at.isnot(None))
    orders = list((await db.scalars(stmt)).all())
    if not orders:
        return 0
    tenant_ids = {o.tenant_id for o in orders}
    profs = (await db.scalars(select(TenantProfile).where(TenantProfile.tenant_id.in_(tenant_ids)))).all()
    pmap = {p.tenant_id: p for p in profs}
    now = datetime.now(UTC)
    changed = 0
    for o in orders:
        p = pmap.get(o.tenant_id)
        grace_h = p.pickup_grace_hours_after_slot if p else 24
        pu = o.pickup_at
        if pu is None:
            continue
        if pu.tzinfo is None:
            pu = pu.replace(tzinfo=UTC)
        deadline = pu + timedelta(hours=grace_h)
        if now > deadline:
            log_order_staff_event(
                db,
                o,
                None,
                "system_order_expired",
                from_status=OrderStatus.READY.value,
                to_status=OrderStatus.EXPIRED.value,
                meta={"pickup_at": pu.isoformat() if pu else None, "grace_hours": grace_h},
            )
            o.status = OrderStatus.EXPIRED.value
            changed += 1
    if changed:
        await db.commit()
    return changed
