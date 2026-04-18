"""SSE AI chat za menadžment — planer (JSON alati) + strim odgovora (Trainify obrasci, bez LangChain)."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ai_chat import AiChatMessage, AiChatSession
from app.rbac import CurrentUser
from app.services import ai_staff_tools
from app.services.ai_llm_client import llm_chat_json, llm_chat_stream_tokens

logger = logging.getLogger(__name__)

MAX_SESSIONS_PER_USER = 40
MAX_TOOLS_PER_TURN = 5
MAX_HISTORY_MESSAGES = 36


KNOWN_TOOLS = frozenset(
    {
        "shop_report",
        "orders_by_status_detail",
        "top_products_by_location",
        "revenue_by_location",
        "top_customers",
        "order_staff_actions",
        "staff_actions_summary",
        "catalog_sale_products",
    }
)


def _sse(obj: dict[str, Any]) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


def _today_utc() -> date:
    return datetime.now(UTC).date()


def _default_range() -> tuple[date, date]:
    end = _today_utc()
    start = end - timedelta(days=30)
    return start, end


async def _count_sessions(db: AsyncSession, *, tenant_id: str, owner_sub: str) -> int:
    q = await db.execute(
        select(func.count(AiChatSession.id)).where(
            AiChatSession.tenant_id == tenant_id,
            AiChatSession.owner_sub == owner_sub,
            AiChatSession.is_deleted.is_(False),
        )
    )
    return int(q.scalar() or 0)


async def _archive_oldest_session(db: AsyncSession, *, tenant_id: str, owner_sub: str) -> None:
    oldest = (
        await db.execute(
            select(AiChatSession)
            .where(
                AiChatSession.tenant_id == tenant_id,
                AiChatSession.owner_sub == owner_sub,
                AiChatSession.is_deleted.is_(False),
            )
            .order_by(AiChatSession.last_activity_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if oldest:
        oldest.is_deleted = True
        oldest.deleted_at = datetime.now(UTC)


async def _create_session(db: AsyncSession, user: CurrentUser, first_message: str) -> AiChatSession:
    if await _count_sessions(db, tenant_id=user.tenant_id, owner_sub=user.sub) >= MAX_SESSIONS_PER_USER:
        await _archive_oldest_session(db, tenant_id=user.tenant_id, owner_sub=user.sub)
    title = first_message.strip()[:120]
    row = AiChatSession(
        tenant_id=user.tenant_id,
        owner_sub=user.sub,
        title=title or "Chat",
        last_activity_at=datetime.now(UTC),
    )
    db.add(row)
    await db.flush()
    return row


async def _get_session(db: AsyncSession, session_id: int, user: CurrentUser) -> AiChatSession | None:
    r = await db.execute(
        select(AiChatSession).where(
            AiChatSession.id == session_id,
            AiChatSession.tenant_id == user.tenant_id,
            AiChatSession.owner_sub == user.sub,
            AiChatSession.is_deleted.is_(False),
        )
    )
    return r.scalar_one_or_none()


async def _save_message(db: AsyncSession, session_id: int, role: str, content: str) -> AiChatMessage:
    msg = AiChatMessage(session_id=session_id, role=role, content=content, sent_at=datetime.now(UTC))
    db.add(msg)
    await db.flush()
    return msg


async def _load_history_messages(db: AsyncSession, session_id: int) -> list[AiChatMessage]:
    """Poslednje poruke (user/assistant), hronološki rastuće."""
    stmt = (
        select(AiChatMessage)
        .where(
            AiChatMessage.session_id == session_id,
            AiChatMessage.is_deleted.is_(False),
            AiChatMessage.role.in_(("user", "assistant")),
        )
        .order_by(AiChatMessage.sent_at.desc())
        .limit(MAX_HISTORY_MESSAGES)
    )
    rows = list((await db.scalars(stmt)).all())
    rows.reverse()
    return rows


def _history_for_planner(msgs: list[AiChatMessage]) -> str:
    """Bez poslednje (trenutne) korisničke — ona ide odvojeno."""
    if len(msgs) <= 1:
        return ""
    parts: list[str] = []
    for m in msgs[:-1]:
        tag = "user" if m.role == "user" else "assistant"
        parts.append(f"[{tag}]: {(m.content or '')[:2500]}")
    return "\n".join(parts)


def _history_for_summarizer(msgs: list[AiChatMessage]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for m in msgs[:-1]:
        if m.role not in ("user", "assistant"):
            continue
        out.append({"role": m.role, "content": m.content or ""})
    return out


async def _run_planner(
    *,
    user_message: str,
    history_text: str,
    date_from: str,
    date_to: str,
) -> dict[str, Any]:
    system = (
        "You are a query planner for a shop analytics assistant (orders, revenue, locations, customers, "
        "staff actions on orders).\n"
        "Respond with ONLY valid JSON (no markdown). Schema:\n"
        '{"tools":[{"name":"<str>","args":{...}}],"need_clarification":null}\n'
        'or {"tools":[],"need_clarification":"<one short question>"}\n\n'
        "Available tool names (exact):\n"
        '- "shop_report": args {date_from, date_to} — KPIs, by_status, by_day, top_products (each row includes '
        "quantity_sold_on_sale and revenue_gross_on_sale), by_source, discount summary.\n"
        '- "orders_by_status_detail": args {date_from, date_to}.\n'
        '- "top_products_by_location": args {date_from, date_to, limit?} (limit 1–50, default 20).\n'
        '- "catalog_sale_products": args {limit?} — products that currently have sale_percent>0 in the catalog.\n'
        '- "revenue_by_location": args {date_from, date_to}.\n'
        '- "top_customers": args {date_from, date_to, limit?} (default 15).\n'
        '- "order_staff_actions": args {date_from, date_to, limit?, order_id?, order_number?, event_type?, '
        "actor_email?, actor_name?} — reception/system audit log lines (newest first); dates filter event time, "
        "not order creation.\n"
        '- "staff_actions_summary": args {date_from, date_to} — counts grouped by staff actor and by event_type.\n\n'
        f"If the user does not specify dates, use date_from={date_from} and date_to={date_to} (UTC calendar days).\n"
        f"At most {MAX_TOOLS_PER_TURN} tools. Prefer fewer tools when one shop_report is enough.\n"
        "For questions about who processed orders, approvals, substitutions, or reception activity, "
        "use order_staff_actions and/or staff_actions_summary (not shop_report alone).\n"
        "If the question is ambiguous about dates or metric, ask a short clarification instead of guessing years.\n"
        "For promotions, discounts, or which products are on sale, use shop_report (sold-on-sale history) "
        "and/or catalog_sale_products (current sale list)."
    )
    user_block = f"Prior conversation (may be empty):\n{history_text}\n\nLatest user message:\n{user_message}"
    plan = await llm_chat_json(
        [{"role": "system", "content": system}, {"role": "user", "content": user_block}],
        temperature=0.15,
    )
    if not isinstance(plan, dict):
        raise ValueError("llm_invalid_json")
    return plan


async def staff_chat_stream(
    db: AsyncSession,
    user: CurrentUser,
    *,
    session_id: int | None,
    message: str,
) -> AsyncIterator[str]:
    """SSE događaji: session_created, token, replace, done, error (kod)."""
    if not (settings.LLM_API_KEY or "").strip():
        yield _sse({"type": "error", "code": "AI_DISABLED"})
        return

    df, dt = _default_range()
    default_from_s = df.isoformat()
    default_to_s = dt.isoformat()

    try:
        created_new = False
        if session_id is None:
            session = await _create_session(db, user, message)
            created_new = True
        else:
            session = await _get_session(db, session_id, user)
            if session is None:
                yield _sse({"type": "error", "code": "SESSION_NOT_FOUND"})
                return

        await _save_message(db, session.id, "user", message)
        await db.commit()

        if created_new:
            yield _sse({"type": "session_created", "session_id": session.id})

        history_rows = await _load_history_messages(db, session.id)
        history_text = _history_for_planner(history_rows)

        plan: dict[str, Any] = {}
        try:
            plan = await _run_planner(
                user_message=message,
                history_text=history_text,
                date_from=default_from_s,
                date_to=default_to_s,
            )
        except ValueError:
            plan = {
                "tools": [{"name": "shop_report", "args": {"date_from": default_from_s, "date_to": default_to_s}}],
                "need_clarification": None,
            }

        clarification = plan.get("need_clarification")
        if clarification and str(clarification).strip():
            text = str(clarification).strip()
            yield _sse({"type": "replace", "text": text})
            am = await _save_message(db, session.id, "assistant", text)
            session.last_activity_at = datetime.now(UTC)
            await db.commit()
            yield _sse({"type": "done", "assistant_message_id": am.id})
            return

        tools = plan.get("tools") or []
        if not isinstance(tools, list):
            tools = []

        executed: list[dict[str, Any]] = []
        for spec in tools[:MAX_TOOLS_PER_TURN]:
            if not isinstance(spec, dict):
                continue
            name = str(spec.get("name") or "").strip()
            args = spec.get("args") if isinstance(spec.get("args"), dict) else {}
            if name not in KNOWN_TOOLS:
                executed.append({"tool": name, "ok": False, "error": "unknown_tool"})
                continue
            try:
                out = await ai_staff_tools.run_staff_tool(db, tenant_id=user.tenant_id, name=name, args=args)
                executed.append(out)
            except Exception as exc:
                logger.exception("staff tool %s", name)
                executed.append({"tool": name, "ok": False, "error": str(exc)})

        if not executed:
            executed.append(
                await ai_staff_tools.run_staff_tool(
                    db,
                    tenant_id=user.tenant_id,
                    name="shop_report",
                    args={"date_from": default_from_s, "date_to": default_to_s},
                )
            )

        facts = json.dumps(executed, ensure_ascii=False, default=str)[:120_000]
        sum_system = (
            "You are a concise analytics assistant for a retail WebShop. "
            "Use ONLY facts from DATABASE_RESULTS JSON; do not invent numbers, orders, locations, or staff names. "
            "Staff audit rows use actor_name / actor_email from the system; treat them as the source of truth. "
            "If something is missing from the data, say you do not have it. "
            "shop_report includes discount: revenue from order lines that were sold with a recorded sale snapshot, "
            "and top_products rows include quantity_sold_on_sale / revenue_gross_on_sale. "
            "catalog_sale_products lists current catalog items with an active sale. "
            "Match the language of the user's latest message (sr/en/ru/zh). "
            "Short markdown bullets are allowed."
        )
        sum_user = f"DATABASE_RESULTS:\n{facts}\n\nUSER_LATEST:\n{message.strip()}"

        sum_messages: list[dict[str, str]] = [{"role": "system", "content": sum_system}]
        sum_messages.extend(_history_for_summarizer(history_rows))
        sum_messages.append({"role": "user", "content": sum_user})

        full = ""
        try:
            async for token in llm_chat_stream_tokens(sum_messages, temperature=0.35):
                full += token
                yield _sse({"type": "token", "text": token})
        except ValueError as exc:
            if str(exc) == "ai_disabled":
                yield _sse({"type": "error", "code": "AI_DISABLED"})
            elif str(exc) == "llm_misconfigured":
                yield _sse({"type": "error", "code": "LLM_MISCONFIGURED"})
            else:
                yield _sse({"type": "error", "code": "BAD_REQUEST"})
            return

        assistant_msg = await _save_message(db, session.id, "assistant", full or "(no response)")
        session.last_activity_at = datetime.now(UTC)
        await db.commit()
        yield _sse({"type": "done", "assistant_message_id": assistant_msg.id})

    except ValueError as e:
        code = str(e)
        if code == "ai_disabled":
            yield _sse({"type": "error", "code": "AI_DISABLED"})
        elif code == "llm_misconfigured":
            yield _sse({"type": "error", "code": "LLM_MISCONFIGURED"})
        else:
            yield _sse({"type": "error", "code": "BAD_REQUEST"})
    except Exception:
        logger.exception("staff_chat_stream")
        yield _sse({"type": "error", "code": "INTERNAL"})


async def list_sessions(db: AsyncSession, user: CurrentUser) -> list[dict[str, Any]]:
    stmt = (
        select(
            AiChatSession.id,
            AiChatSession.title,
            AiChatSession.last_activity_at,
            func.count(AiChatMessage.id).label("mc"),
        )
        .outerjoin(
            AiChatMessage,
            (AiChatMessage.session_id == AiChatSession.id) & (AiChatMessage.is_deleted.is_(False)),
        )
        .where(
            AiChatSession.tenant_id == user.tenant_id,
            AiChatSession.owner_sub == user.sub,
            AiChatSession.is_deleted.is_(False),
        )
        .group_by(AiChatSession.id, AiChatSession.title, AiChatSession.last_activity_at)
        .order_by(AiChatSession.last_activity_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": r[0],
            "title": r[1],
            "last_activity_at": r[2].isoformat() if r[2] else None,
            "message_count": int(r[3] or 0),
        }
        for r in rows
    ]


async def list_messages(
    db: AsyncSession,
    user: CurrentUser,
    session_id: int,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    session = await _get_session(db, session_id, user)
    if not session:
        return []
    stmt = (
        select(AiChatMessage)
        .where(
            AiChatMessage.session_id == session_id,
            AiChatMessage.is_deleted.is_(False),
            AiChatMessage.role.in_(("user", "assistant")),
        )
        .order_by(AiChatMessage.sent_at.asc())
        .offset(offset)
        .limit(limit)
    )
    rows = list((await db.scalars(stmt)).all())
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "sent_at": m.sent_at.isoformat() if m.sent_at else None,
        }
        for m in rows
    ]


async def delete_session(db: AsyncSession, user: CurrentUser, session_id: int) -> bool:
    session = await _get_session(db, session_id, user)
    if not session:
        return False
    session.is_deleted = True
    session.deleted_at = datetime.now(UTC)
    await db.commit()
    return True


async def rename_session(db: AsyncSession, user: CurrentUser, session_id: int, title: str) -> bool:
    session = await _get_session(db, session_id, user)
    if not session:
        return False
    session.title = title.strip()[:120] or session.title
    await db.commit()
    return True
