"""Izvršavanje whitelisted agregacija za AI izveštajni chat (samo tenant_id korisnika)."""

from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, UTC
from decimal import Decimal
from typing import Any

from sqlalchemy import Integer, and_, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.order_staff_event import OrderStaffEvent
from app.models.shop_order import Order, OrderLine, QuantityReductionOffer, SubstitutionOffer
from app.models.product import Product
from app.services.product_sale import effective_price_gross
from app.models.tenant_profile import TenantLocation
from app.services import report_service

BAD_STATUSES = ("rejected", "expired")
DONE_STATUSES = ("ready", "picked_up")


def _utc_range(d_from: date, d_to: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d_from, time.min, tzinfo=UTC)
    end = datetime.combine(d_to + timedelta(days=1), time.min, tzinfo=UTC)
    return start, end


def _json_safe(obj: Any) -> Any:
    return json.loads(json.dumps(obj, default=str))


def _validate_range(date_from: date, date_to: date, *, max_days: int = 400) -> None:
    if date_to < date_from:
        raise ValueError("date_range_inverted")
    if (date_to - date_from).days > max_days:
        raise ValueError("date_range_too_long")


def _parse_date(v: Any) -> date:
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    s = str(v).strip()[:10]
    return date.fromisoformat(s)


async def run_staff_tool(
    db: AsyncSession,
    *,
    tenant_id: str,
    name: str,
    args: dict[str, Any],
) -> dict[str, Any]:
    # Alati bez kalendarskog opsega — ne smeju zavisiti od date_from/date_to u args (planer često šalje samo limit).
    if name == "catalog_sale_products":
        limit = int(args.get("limit") or 80)
        limit = max(1, min(limit, 150))
        stmt = (
            select(Product)
            .where(Product.tenant_id == tenant_id, Product.sale_percent > 0, Product.available.is_(True))
            .order_by(Product.sale_percent.desc(), Product.id)
            .limit(limit)
        )
        prows = list((await db.scalars(stmt)).all())
        data = [
            {
                "product_id": int(p.id),
                "name": p.name,
                "sale_percent": int(getattr(p, "sale_percent", 0) or 0),
                "price_gross_catalog_rsd": str(Decimal(str(p.price_gross))),
                "price_gross_effective_rsd": str(effective_price_gross(p)),
            }
            for p in prows
        ]
        return {"tool": name, "ok": True, "data": _json_safe(data)}

    date_from = _parse_date(args.get("date_from"))
    date_to = _parse_date(args.get("date_to"))
    _validate_range(date_from, date_to)
    start, end = _utc_range(date_from, date_to)
    base = (Order.tenant_id == tenant_id) & (Order.created_at >= start) & (Order.created_at < end)
    exclude_lines = Order.status.in_(BAD_STATUSES)

    if name == "shop_report":
        rep = await report_service.build_shop_report(db, tenant_id=tenant_id, date_from=date_from, date_to=date_to)
        return {"tool": name, "ok": True, "data": json.loads(rep.model_dump_json())}

    if name == "orders_by_status_detail":
        rows = (await db.execute(select(Order.status, func.count()).where(base).group_by(Order.status))).all()
        data = [{"status": str(r[0]), "count": int(r[1] or 0)} for r in rows]
        return {"tool": name, "ok": True, "data": _json_safe(data)}

    if name == "top_products_by_location":
        limit = int(args.get("limit") or 20)
        limit = max(1, min(limit, 50))
        line_on_sale = OrderLine.sale_percent_applied > 0
        stmt = (
            select(
                Order.pickup_location_id,
                func.max(TenantLocation.code),
                func.max(TenantLocation.name),
                Product.id,
                Product.name,
                func.coalesce(func.sum(OrderLine.quantity), 0),
                func.coalesce(func.sum(OrderLine.quantity * OrderLine.unit_price), 0),
                func.coalesce(func.sum(case((line_on_sale, OrderLine.quantity), else_=0)), 0),
                func.coalesce(
                    func.sum(case((line_on_sale, OrderLine.quantity * OrderLine.unit_price), else_=Decimal("0"))),
                    0,
                ),
            )
            .select_from(OrderLine)
            .join(Order, Order.id == OrderLine.order_id)
            .join(Product, Product.id == OrderLine.product_id)
            .outerjoin(TenantLocation, TenantLocation.id == Order.pickup_location_id)
            .where(
                Order.tenant_id == tenant_id,
                Order.created_at >= start,
                Order.created_at < end,
                ~exclude_lines,
            )
            .group_by(Order.pickup_location_id, Product.id, Product.name)
            .order_by(func.sum(OrderLine.quantity * OrderLine.unit_price).desc())
            .limit(limit)
        )
        rows = (await db.execute(stmt)).all()
        data = [
            {
                "pickup_location_id": r[0],
                "location_code": (r[1] or "") or None,
                "location_name": (r[2] or "") or "—",
                "product_id": int(r[3]),
                "product_name": str(r[4]),
                "quantity_sold": int(r[5] or 0),
                "revenue_gross": str(Decimal(str(r[6] or 0))),
                "quantity_sold_on_sale": int(r[7] or 0),
                "revenue_gross_on_sale": str(Decimal(str(r[8] or 0))),
            }
            for r in rows
        ]
        return {"tool": name, "ok": True, "data": _json_safe(data)}

    if name == "revenue_by_location":
        rev_settled = case((Order.status.in_(DONE_STATUSES), Order.total), else_=Decimal("0"))
        rev_pipe = case((~Order.status.in_(BAD_STATUSES), Order.total), else_=Decimal("0"))
        stmt = (
            select(
                Order.pickup_location_id,
                func.max(TenantLocation.code),
                func.max(TenantLocation.name),
                func.count(Order.id),
                func.coalesce(func.sum(rev_settled), 0),
                func.coalesce(func.sum(rev_pipe), 0),
            )
            .select_from(Order)
            .outerjoin(TenantLocation, TenantLocation.id == Order.pickup_location_id)
            .where(base)
            .group_by(Order.pickup_location_id)
            .order_by(func.sum(rev_pipe).desc())
        )
        rows = (await db.execute(stmt)).all()
        data = [
            {
                "pickup_location_id": r[0],
                "location_code": (r[1] or "") or None,
                "location_name": (r[2] or "") or "—",
                "orders": int(r[3] or 0),
                "revenue_settled_gross": str(Decimal(str(r[4] or 0))),
                "revenue_non_lost_gross": str(Decimal(str(r[5] or 0))),
            }
            for r in rows
        ]
        return {"tool": name, "ok": True, "data": _json_safe(data)}

    if name == "top_customers":
        limit = int(args.get("limit") or 15)
        limit = max(1, min(limit, 50))
        stmt = (
            select(
                Order.client_zitadel_id,
                func.max(Order.client_email),
                func.max(Order.client_first_name),
                func.max(Order.client_last_name),
                func.count(Order.id),
                func.coalesce(
                    func.sum(case((~Order.status.in_(BAD_STATUSES), Order.total), else_=Decimal("0"))),
                    0,
                ),
            )
            .where(base)
            .group_by(Order.client_zitadel_id)
            .order_by(
                func.sum(case((~Order.status.in_(BAD_STATUSES), Order.total), else_=Decimal("0"))).desc(),
            )
            .limit(limit)
        )
        rows = (await db.execute(stmt)).all()
        data = [
            {
                "client_ref": str(r[0]),
                "email": (r[1] or "") or None,
                "first_name": (r[2] or "") or None,
                "last_name": (r[3] or "") or None,
                "orders": int(r[4] or 0),
                "revenue_gross_non_lost": str(Decimal(str(r[5] or 0))),
            }
            for r in rows
        ]
        return {"tool": name, "ok": True, "data": _json_safe(data)}

    if name == "order_staff_actions":
        """Detaljna lista recepcijskih/sistemskih događaja (order_staff_events), filtrirano po vremenu događaja."""
        limit = int(args.get("limit") or 150)
        limit = max(1, min(limit, 300))
        stmt = (
            select(
                OrderStaffEvent.id,
                OrderStaffEvent.order_id,
                Order.order_number,
                OrderStaffEvent.event_type,
                OrderStaffEvent.from_status,
                OrderStaffEvent.to_status,
                OrderStaffEvent.actor_name,
                OrderStaffEvent.actor_email,
                OrderStaffEvent.actor_sub,
                OrderStaffEvent.created_at,
                OrderStaffEvent.meta,
            )
            .join(Order, Order.id == OrderStaffEvent.order_id)
            .where(
                OrderStaffEvent.tenant_id == tenant_id,
                OrderStaffEvent.created_at >= start,
                OrderStaffEvent.created_at < end,
            )
        )
        oid = args.get("order_id")
        if oid is not None and str(oid).strip().isdigit():
            stmt = stmt.where(OrderStaffEvent.order_id == int(oid))
        onum = args.get("order_number")
        if onum and str(onum).strip():
            stmt = stmt.where(Order.order_number.ilike(f"%{str(onum).strip()[:64]}%"))
        ev = args.get("event_type")
        if ev and str(ev).strip():
            stmt = stmt.where(OrderStaffEvent.event_type == str(ev).strip()[:64])
        em = args.get("actor_email")
        if em and str(em).strip():
            stmt = stmt.where(OrderStaffEvent.actor_email.ilike(f"%{str(em).strip()[:120]}%"))
        an = args.get("actor_name")
        if an and str(an).strip():
            stmt = stmt.where(OrderStaffEvent.actor_name.ilike(f"%{str(an).strip()[:120]}%"))
        stmt = stmt.order_by(OrderStaffEvent.created_at.desc()).limit(limit)
        rows = (await db.execute(stmt)).all()
        data = [
            {
                "id": int(r[0]),
                "order_id": int(r[1]),
                "order_number": str(r[2]),
                "event_type": str(r[3]),
                "from_status": r[4],
                "to_status": r[5],
                "actor_name": str(r[6] or ""),
                "actor_email": str(r[7] or ""),
                "actor_sub": r[8],
                "created_at": r[9].isoformat() if r[9] else None,
                "meta": _json_safe(r[10] or {}),
            }
            for r in rows
        ]
        return {"tool": name, "ok": True, "data": _json_safe(data)}

    if name == "staff_actions_summary":
        """Agregat po izvršiocu i po tipu događaja u periodu (za pitanja tipa „ko je najviše radio“)."""
        base_ev = (OrderStaffEvent.tenant_id == tenant_id) & (
            OrderStaffEvent.created_at >= start
        ) & (OrderStaffEvent.created_at < end)
        total_q = await db.execute(select(func.count(OrderStaffEvent.id)).where(base_ev))
        total = int(total_q.scalar() or 0)

        act_stmt = (
            select(
                OrderStaffEvent.actor_name,
                OrderStaffEvent.actor_email,
                OrderStaffEvent.actor_sub,
                func.count(OrderStaffEvent.id),
            )
            .where(base_ev)
            .group_by(OrderStaffEvent.actor_name, OrderStaffEvent.actor_email, OrderStaffEvent.actor_sub)
            .order_by(func.count(OrderStaffEvent.id).desc())
            .limit(35)
        )
        act_rows = (await db.execute(act_stmt)).all()
        by_actor = [
            {
                "actor_name": str(r[0] or ""),
                "actor_email": str(r[1] or ""),
                "actor_sub": r[2],
                "action_count": int(r[3] or 0),
            }
            for r in act_rows
        ]

        typ_stmt = (
            select(OrderStaffEvent.event_type, func.count(OrderStaffEvent.id))
            .where(base_ev)
            .group_by(OrderStaffEvent.event_type)
            .order_by(func.count(OrderStaffEvent.id).desc())
            .limit(40)
        )
        typ_rows = (await db.execute(typ_stmt)).all()
        by_event_type = [{"event_type": str(r[0]), "count": int(r[1] or 0)} for r in typ_rows]

        sys_stmt = select(func.count(OrderStaffEvent.id)).where(
            base_ev
            & (func.lower(func.coalesce(OrderStaffEvent.actor_name, "")) == "system")
        )
        system_actor_events = int((await db.execute(sys_stmt)).scalar() or 0)

        return {
            "tool": name,
            "ok": True,
            "data": _json_safe(
                {
                    "period_events_total": total,
                    "system_actor_events": system_actor_events,
                    "human_actor_events": max(0, total - system_actor_events),
                    "by_actor": by_actor,
                    "by_event_type": by_event_type,
                }
            ),
        }

    if name == "order_notifications_summary":
        base_nt = and_(
            Notification.tenant_id == tenant_id,
            Order.tenant_id == tenant_id,
            Notification.created_at >= start,
            Notification.created_at < end,
        )
        stmt = (
            select(Notification.audience, Notification.event_type, func.count(Notification.id))
            .select_from(Notification)
            .join(Order, Order.id == Notification.order_id)
            .where(base_nt)
            .group_by(Notification.audience, Notification.event_type)
            .order_by(func.count(Notification.id).desc())
            .limit(100)
        )
        rows = (await db.execute(stmt)).all()
        data = [
            {"audience": str(r[0]), "event_type": str(r[1]), "count": int(r[2] or 0)} for r in rows
        ]
        return {"tool": name, "ok": True, "data": _json_safe(data)}

    if name == "order_notifications_timeline":
        limit = int(args.get("limit") or 200)
        limit = max(1, min(limit, 400))
        base_nt = and_(
            Notification.tenant_id == tenant_id,
            Order.tenant_id == tenant_id,
            Notification.created_at >= start,
            Notification.created_at < end,
        )
        stmt = (
            select(
                Notification.id,
                Notification.order_id,
                Order.order_number,
                Notification.audience,
                Notification.event_type,
                Notification.recipient_sub,
                Notification.meta,
                Notification.created_at,
            )
            .select_from(Notification)
            .join(Order, Order.id == Notification.order_id)
            .where(base_nt)
        )
        aud = str(args.get("audience") or "").strip().lower()
        if aud in ("customer", "reception"):
            stmt = stmt.where(Notification.audience == aud)
        ev = args.get("event_type")
        if ev and str(ev).strip():
            stmt = stmt.where(Notification.event_type == str(ev).strip()[:64])
        else:
            evc = args.get("event_type_contains")
            if evc and str(evc).strip():
                stmt = stmt.where(Notification.event_type.ilike(f"%{str(evc).strip()[:64]}%"))
        oid = args.get("order_id")
        if oid is not None and str(oid).strip().isdigit():
            stmt = stmt.where(Notification.order_id == int(oid))
        onum = args.get("order_number")
        if onum and str(onum).strip():
            stmt = stmt.where(Order.order_number.ilike(f"%{str(onum).strip()[:64]}%"))
        stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
        rows = (await db.execute(stmt)).all()
        data = [
            {
                "id": int(r[0]),
                "order_id": int(r[1]),
                "order_number": str(r[2]),
                "audience": str(r[3]),
                "event_type": str(r[4]),
                "recipient_sub": r[5],
                "meta": _json_safe(r[6] or {}),
                "created_at": r[7].isoformat() if r[7] else None,
            }
            for r in rows
        ]
        return {"tool": name, "ok": True, "data": _json_safe(data)}

    if name == "discount_order_lines":
        """Stavke porudžbina u periodu gde je snimljen popust (sale_percent_applied > 0)."""
        limit = int(args.get("limit") or 200)
        limit = max(1, min(limit, 350))
        line_on_sale = OrderLine.sale_percent_applied > 0
        line_rev = OrderLine.quantity * OrderLine.unit_price
        stmt = (
            select(
                Order.id,
                Order.order_number,
                Order.created_at,
                OrderLine.id,
                Product.id,
                Product.name,
                OrderLine.quantity,
                OrderLine.sale_percent_applied,
                OrderLine.catalog_unit_price_gross,
                OrderLine.unit_price,
                line_rev,
            )
            .select_from(OrderLine)
            .join(Order, Order.id == OrderLine.order_id)
            .join(Product, Product.id == OrderLine.product_id)
            .where(
                Order.tenant_id == tenant_id,
                Order.created_at >= start,
                Order.created_at < end,
                ~exclude_lines,
                line_on_sale,
            )
        )
        oid = args.get("order_id")
        if oid is not None and str(oid).strip().isdigit():
            stmt = stmt.where(Order.id == int(oid))
        pid = args.get("product_id")
        if pid is not None and str(pid).strip().isdigit():
            stmt = stmt.where(OrderLine.product_id == int(pid))
        stmt = stmt.order_by(Order.created_at.desc(), OrderLine.id).limit(limit)
        rows = (await db.execute(stmt)).all()
        data = [
            {
                "order_id": int(r[0]),
                "order_number": str(r[1]),
                "order_created_at": r[2].isoformat() if r[2] else None,
                "line_id": int(r[3]),
                "product_id": int(r[4]),
                "product_name": str(r[5]),
                "quantity": int(r[6] or 0),
                "sale_percent_applied": int(r[7] or 0),
                "catalog_unit_price_gross_rsd": str(Decimal(str(r[8] or 0))),
                "unit_price_paid_gross_rsd": str(Decimal(str(r[9] or 0))),
                "line_revenue_gross_rsd": str(Decimal(str(r[10] or 0))),
            }
            for r in rows
        ]
        return {"tool": name, "ok": True, "data": _json_safe(data)}

    if name == "substitution_stats":
        """Ponude zamene (recepcija): status po ponudi + ko je kreirao ponudu (audit), prihvat/odbijanje kupca."""
        st_rows = (
            await db.execute(
                select(SubstitutionOffer.status, func.count(SubstitutionOffer.id))
                .join(Order, Order.id == SubstitutionOffer.order_id)
                .where(
                    Order.tenant_id == tenant_id,
                    SubstitutionOffer.created_at >= start,
                    SubstitutionOffer.created_at < end,
                )
                .group_by(SubstitutionOffer.status)
            )
        ).all()
        by_offer_status = [{"status": str(r[0]), "count": int(r[1] or 0)} for r in st_rows]

        offer_id_expr = cast(OrderStaffEvent.meta["offer_id"].astext, Integer)
        staff_stmt = (
            select(
                OrderStaffEvent.actor_name,
                OrderStaffEvent.actor_email,
                func.count(SubstitutionOffer.id),
                func.sum(case((SubstitutionOffer.status == "accepted", 1), else_=0)),
                func.sum(case((SubstitutionOffer.status == "rejected", 1), else_=0)),
                func.sum(case((SubstitutionOffer.status == "pending", 1), else_=0)),
            )
            .select_from(OrderStaffEvent)
            .join(SubstitutionOffer, SubstitutionOffer.id == offer_id_expr)
            .join(Order, Order.id == SubstitutionOffer.order_id)
            .where(
                Order.tenant_id == tenant_id,
                OrderStaffEvent.tenant_id == tenant_id,
                OrderStaffEvent.event_type == "substitution_offer_created",
                SubstitutionOffer.created_at >= start,
                SubstitutionOffer.created_at < end,
            )
            .group_by(OrderStaffEvent.actor_name, OrderStaffEvent.actor_email)
            .order_by(func.count(SubstitutionOffer.id).desc())
            .limit(30)
        )
        sr = (await db.execute(staff_stmt)).all()
        by_staff = [
            {
                "actor_name": str(r[0] or ""),
                "actor_email": str(r[1] or ""),
                "substitution_offers_created": int(r[2] or 0),
                "accepted_by_customer": int(r[3] or 0),
                "rejected_by_customer": int(r[4] or 0),
                "still_pending": int(r[5] or 0),
            }
            for r in sr
        ]

        qty_status_rows = (
            await db.execute(
                select(QuantityReductionOffer.status, func.count(QuantityReductionOffer.id))
                .join(Order, Order.id == QuantityReductionOffer.order_id)
                .where(
                    Order.tenant_id == tenant_id,
                    QuantityReductionOffer.created_at >= start,
                    QuantityReductionOffer.created_at < end,
                )
                .group_by(QuantityReductionOffer.status)
            )
        ).all()
        quantity_offers_by_status = [{"status": str(r[0]), "count": int(r[1] or 0)} for r in qty_status_rows]

        qty_offer_id_expr = cast(OrderStaffEvent.meta["offer_id"].astext, Integer)
        qty_staff_stmt = (
            select(
                OrderStaffEvent.actor_name,
                OrderStaffEvent.actor_email,
                func.count(QuantityReductionOffer.id),
                func.sum(case((QuantityReductionOffer.status == "accepted", 1), else_=0)),
                func.sum(case((QuantityReductionOffer.status == "rejected", 1), else_=0)),
                func.sum(case((QuantityReductionOffer.status == "pending", 1), else_=0)),
            )
            .select_from(OrderStaffEvent)
            .join(QuantityReductionOffer, QuantityReductionOffer.id == qty_offer_id_expr)
            .join(Order, Order.id == QuantityReductionOffer.order_id)
            .where(
                Order.tenant_id == tenant_id,
                OrderStaffEvent.tenant_id == tenant_id,
                OrderStaffEvent.event_type == "quantity_reduction_proposed",
                QuantityReductionOffer.created_at >= start,
                QuantityReductionOffer.created_at < end,
            )
            .group_by(OrderStaffEvent.actor_name, OrderStaffEvent.actor_email)
            .order_by(func.count(QuantityReductionOffer.id).desc())
            .limit(30)
        )
        qr = (await db.execute(qty_staff_stmt)).all()
        by_staff_quantity = [
            {
                "actor_name": str(r[0] or ""),
                "actor_email": str(r[1] or ""),
                "quantity_offers_created": int(r[2] or 0),
                "accepted_by_customer": int(r[3] or 0),
                "rejected_by_customer": int(r[4] or 0),
                "still_pending": int(r[5] or 0),
            }
            for r in qr
        ]

        return {
            "tool": name,
            "ok": True,
            "data": _json_safe(
                {
                    "period_note": "Substitution and quantity offers use each table's created_at (UTC). "
                    "Per-staff rows join order_staff_events: substitution_offer_created and "
                    "quantity_reduction_proposed with meta.offer_id matching the offer (includes batch "
                    "proposals logged per offer since backend fix). Customer outcomes are offer.status. "
                    "For the same data as the order screen ('Akcije zaposlenih'), also call order_staff_actions "
                    "(event timeline: status_*, substitution_offer_created, quantity_reduction_proposed, "
                    "reception_batch_proposed, etc.).",
                    "offers_by_status": by_offer_status,
                    "by_staff_who_created_offer": by_staff,
                    "quantity_offers_by_status": quantity_offers_by_status,
                    "by_staff_who_created_quantity_offer": by_staff_quantity,
                }
            ),
        }

    return {"tool": name, "ok": False, "error": "unknown_tool"}
