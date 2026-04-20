from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Select, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.shop_order import Order
from app.rbac import CurrentUser
from app.schemas.notifications import NotificationOut
from app.services.client_keys import legacy_client_zitadel_keys


async def add_reception(
    db: AsyncSession,
    *,
    tenant_id: str,
    order_id: int,
    event_type: str,
    meta: dict | None = None,
) -> None:
    db.add(
        Notification(
            tenant_id=tenant_id,
            audience="reception",
            recipient_sub=None,
            order_id=order_id,
            event_type=event_type,
            meta=meta,
        )
    )


async def add_customer(
    db: AsyncSession,
    *,
    tenant_id: str,
    recipient_sub: str,
    order_id: int,
    event_type: str,
    meta: dict | None = None,
) -> None:
    db.add(
        Notification(
            tenant_id=tenant_id,
            audience="customer",
            recipient_sub=recipient_sub,
            order_id=order_id,
            event_type=event_type,
            meta=meta,
        )
    )


async def _list_filter_stmt(db: AsyncSession, user: CurrentUser) -> Select:
    tenant = user.tenant_id
    keys = await legacy_client_zitadel_keys(db, user)
    stmt: Select = (
        select(Notification, Order.order_number)
        .join(Order, Order.id == Notification.order_id)
        .where(Notification.tenant_id == tenant)
    )
    recv = (Notification.audience == "reception") & (Notification.recipient_sub.is_(None))
    cust = (Notification.audience == "customer") & (Notification.recipient_sub.in_(keys))
    if user.can_reception():
        stmt = stmt.where(or_(recv, cust))
    else:
        stmt = stmt.where(cust)
    return stmt


async def list_notifications(
    db: AsyncSession, user: CurrentUser, *, limit: int = 50, unread_only: bool = False
) -> list[NotificationOut]:
    stmt = await _list_filter_stmt(db, user)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(min(max(limit, 1), 100))
    rows = (await db.execute(stmt)).all()
    out: list[NotificationOut] = []
    for n, order_number in rows:
        out.append(
            NotificationOut(
                id=n.id,
                order_id=n.order_id,
                order_number=order_number,
                event_type=n.event_type,
                meta=dict(n.meta or {}),
                read_at=n.read_at,
                created_at=n.created_at,
            )
        )
    return out


async def _user_may_access_notification(db: AsyncSession, user: CurrentUser, n: Notification) -> bool:
    if n.tenant_id != user.tenant_id:
        return False
    keys = await legacy_client_zitadel_keys(db, user)
    recv = n.audience == "reception" and n.recipient_sub is None
    cust = n.audience == "customer" and n.recipient_sub in keys
    if user.can_reception():
        return recv or cust
    return cust


async def mark_notifications_read(db: AsyncSession, user: CurrentUser, ids: list[int]) -> int:
    if not ids:
        return 0
    now = datetime.now(UTC)
    updated = 0
    for nid in ids[:100]:
        n = await db.get(Notification, nid)
        if not n or not await _user_may_access_notification(db, user, n):
            continue
        if n.read_at is None:
            n.read_at = now
            updated += 1
    await db.commit()
    return updated


async def delete_notifications(db: AsyncSession, user: CurrentUser, ids: list[int]) -> int:
    if not ids:
        return 0
    deleted = 0
    for nid in ids[:200]:
        n = await db.get(Notification, nid)
        if not n or not await _user_may_access_notification(db, user, n):
            continue
        await db.delete(n)
        deleted += 1
    await db.commit()
    return deleted


async def clear_notifications(db: AsyncSession, user: CurrentUser) -> int:
    stmt = await _list_filter_stmt(db, user)
    rows = (await db.execute(stmt.with_only_columns(Notification.id))).all()
    ids = [int(r[0]) for r in rows if r and r[0] is not None]
    if not ids:
        return 0
    await db.execute(delete(Notification).where(Notification.id.in_(ids)))
    await db.commit()
    return len(ids)


async def clear_read_notifications(db: AsyncSession, user: CurrentUser) -> int:
    stmt = await _list_filter_stmt(db, user)
    stmt = stmt.where(Notification.read_at.is_not(None))
    rows = (await db.execute(stmt.with_only_columns(Notification.id))).all()
    ids = [int(r[0]) for r in rows if r and r[0] is not None]
    if not ids:
        return 0
    await db.execute(delete(Notification).where(Notification.id.in_(ids)))
    await db.commit()
    return len(ids)
