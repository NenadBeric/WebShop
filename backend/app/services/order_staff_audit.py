from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order_staff_event import OrderStaffEvent
from app.models.shop_order import Order
from app.rbac import CurrentUser


def log_order_staff_event(
    db: AsyncSession,
    order: Order,
    user: CurrentUser | None,
    event_type: str,
    *,
    from_status: str | None = None,
    to_status: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    """Upis događaja u istoj transakciji kao mutacija narudžbine. `user=None` = sistem (npr. istek roka)."""
    if user is None:
        actor_sub = None
        actor_email = ""
        actor_name = "system"
    else:
        actor_sub = (user.sub or "")[:255] or None
        actor_email = (user.email or "")[:255]
        actor_name = (user.name or "")[:255]
    db.add(
        OrderStaffEvent(
            tenant_id=order.tenant_id,
            order_id=order.id,
            event_type=(event_type or "unknown")[:64],
            from_status=(from_status[:64] if from_status else None),
            to_status=(to_status[:64] if to_status else None),
            actor_sub=actor_sub,
            actor_email=actor_email,
            actor_name=actor_name,
            meta=dict(meta or {}),
        )
    )
