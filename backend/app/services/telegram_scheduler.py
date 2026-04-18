"""Telegram podsjetnici za tačan termin i „danas“ za day-mode (WebShop.md §2.5)."""

from __future__ import annotations

import html
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.i18n.messages import MESSAGES
from app.models.shop_order import Order, OrderStatus, PickupMode
from app.models.tenant_profile import TenantProfile
from app.services.telegram_api import resolve_telegram_bot_token, send_telegram_message
from app.services.tenant_service import _resolve_tz

logger = logging.getLogger(__name__)


def _t(key: str, lang: str, **kwargs: object) -> str:
    lang = lang if lang in ("sr", "en", "ru", "zh") else "sr"
    row = MESSAGES.get(key) or {}
    text = row.get(lang) or row.get("sr", key)
    if kwargs:
        try:
            return str(text).format(**kwargs)
        except (KeyError, ValueError):
            return str(text)
    return str(text)


async def run_scheduled_telegram_reminders(db: AsyncSession) -> None:
    now = datetime.now(UTC)
    open_statuses = (
        OrderStatus.PENDING_CONFIRM.value,
        OrderStatus.PARTIAL_WAITING_SWAP.value,
        OrderStatus.READY.value,
    )

    stmt = (
        select(Order, TenantProfile)
        .join(TenantProfile, TenantProfile.tenant_id == Order.tenant_id)
        .where(
            TenantProfile.telegram_chat_id != "",
            Order.status.in_(open_statuses),
        )
    )
    rows = (await db.execute(stmt)).all()

    changed = False
    for order, prof in rows:
        lang = (order.preferred_lang or "sr")[:8]
        if lang not in ("sr", "en", "ru", "zh"):
            lang = "sr"
        chat = (prof.telegram_chat_id or "").strip()
        token = resolve_telegram_bot_token(prof)
        if not chat or not token:
            continue

        # --- Tačan termin: X minuta prije preuzimanja ---
        if (
            not order.telegram_pickup_reminder_sent
            and order.pickup_mode == PickupMode.EXACT.value
            and order.pickup_at is not None
        ):
            pu = order.pickup_at
            if pu.tzinfo is None:
                pu = pu.replace(tzinfo=UTC)
            m = int(prof.notify_before_pickup_minutes or 10)
            start = pu - timedelta(minutes=m + 3)
            end = pu - timedelta(minutes=max(m - 2, 0))
            if start <= now <= end:
                await db.refresh(order, ["lines"])
                parts: list[str] = []
                for ln in order.lines or []:
                    await db.refresh(ln, ["product"])
                    pname = html.escape(ln.product.name if ln.product else str(ln.product_id))
                    parts.append(f"{pname}×{ln.quantity}")
                lines_txt = ", ".join(parts) if parts else "—"
                when = pu.astimezone(_resolve_tz(prof.timezone)).strftime("%Y-%m-%d %H:%M")
                try:
                    text = _t(
                        "telegram_pickup_reminder",
                        lang,
                        minutes=str(m),
                        order_number=order.order_number,
                        lines=lines_txt,
                        when=when,
                    )
                    await send_telegram_message(text, chat, token=token)
                    order.telegram_pickup_reminder_sent = True
                    changed = True
                except Exception:
                    logger.exception("Telegram pickup podsjetnik order=%s", order.id)

        # --- Okvirni dan: jednom ujutro (sat iz profila) ---
        if (
            not order.telegram_day_reminder_sent
            and order.pickup_mode == PickupMode.DAY.value
            and order.pickup_at is not None
        ):
            tz = _resolve_tz(prof.timezone)
            now_local = datetime.now(tz)
            pu = order.pickup_at
            if pu.tzinfo is None:
                pu = pu.replace(tzinfo=UTC)
            pl = pu.astimezone(tz)
            target_h = int(prof.day_reminder_hour_local or 8)
            if pl.date() == now_local.date() and now_local.hour == target_h and now_local.minute < 30:
                await db.refresh(order, ["lines"])
                parts = []
                for ln in order.lines or []:
                    await db.refresh(ln, ["product"])
                    pname = html.escape(ln.product.name if ln.product else str(ln.product_id))
                    parts.append(f"{pname}×{ln.quantity}")
                lines_txt = ", ".join(parts) if parts else "—"
                try:
                    text = _t(
                        "telegram_day_reminder",
                        lang,
                        order_number=order.order_number,
                        lines=lines_txt,
                    )
                    await send_telegram_message(text, chat, token=token)
                    order.telegram_day_reminder_sent = True
                    changed = True
                except Exception:
                    logger.exception("Telegram day podsjetnik order=%s", order.id)

    if changed:
        await db.commit()
