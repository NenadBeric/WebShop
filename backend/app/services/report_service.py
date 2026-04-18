from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order_source import OrderSource
from app.models.product import Product
from app.models.shop_order import Order, OrderLine
from app.schemas.reports import (
    ShopReportDailyRow,
    ShopReportDiscountSummary,
    ShopReportKpiOut,
    ShopReportOut,
    ShopReportProductRow,
    ShopReportSourceSlice,
    ShopReportStatusSlice,
)


def _utc_range(d_from: date, d_to: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d_from, time.min, tzinfo=UTC)
    end = datetime.combine(d_to + timedelta(days=1), time.min, tzinfo=UTC)
    return start, end


def _fill_days(
    d_from: date,
    d_to: date,
    by_day_map: dict[date, tuple[int, Decimal]],
) -> list[ShopReportDailyRow]:
    out: list[ShopReportDailyRow] = []
    cur = d_from
    while cur <= d_to:
        o, rev = by_day_map.get(cur, (0, Decimal("0")))
        out.append(ShopReportDailyRow(day=cur, orders=o, revenue_gross=rev))
        cur += timedelta(days=1)
    return out


async def build_shop_report(
    db: AsyncSession,
    *,
    tenant_id: str,
    date_from: date,
    date_to: date,
) -> ShopReportOut:
    start, end = _utc_range(date_from, date_to)
    base = (Order.tenant_id == tenant_id) & (Order.created_at >= start) & (Order.created_at < end)

    total_orders = int(
        (await db.execute(select(func.count()).select_from(Order).where(base))).scalar_one() or 0
    )

    open_st = ("pending_confirm", "partial_waiting_swap")
    orders_open = int(
        (
            await db.execute(
                select(func.count()).select_from(Order).where(base & Order.status.in_(open_st))
            )
        ).scalar_one()
        or 0
    )
    done_st = ("ready", "picked_up")
    orders_done = int(
        (
            await db.execute(
                select(func.count()).select_from(Order).where(base & Order.status.in_(done_st))
            )
        ).scalar_one()
        or 0
    )
    bad_st = ("rejected", "expired")
    orders_bad = int(
        (
            await db.execute(
                select(func.count()).select_from(Order).where(base & Order.status.in_(bad_st))
            )
        ).scalar_one()
        or 0
    )

    rev_settled = (
        await db.execute(
            select(func.coalesce(func.sum(Order.total), 0)).where(base & Order.status.in_(done_st))
        )
    ).scalar_one()
    rev_settled_d = Decimal(str(rev_settled)) if rev_settled is not None else Decimal("0")

    rev_pipe = (
        await db.execute(
            select(func.coalesce(func.sum(Order.total), 0)).where(base & ~Order.status.in_(bad_st))
        )
    ).scalar_one()
    rev_pipe_d = Decimal(str(rev_pipe)) if rev_pipe is not None else Decimal("0")

    status_rows = (
        await db.execute(select(Order.status, func.count()).where(base).group_by(Order.status))
    ).all()
    by_status = [ShopReportStatusSlice(status=str(r[0]), count=int(r[1])) for r in status_rows]

    day_col = cast(Order.created_at, Date)
    daily = (
        await db.execute(
            select(
                day_col.label("d"),
                func.count(Order.id),
                func.coalesce(
                    func.sum(case((Order.status.in_(done_st), Order.total), else_=Decimal("0"))),
                    0,
                ),
            )
            .where(base)
            .group_by(day_col)
            .order_by(day_col)
        )
    ).all()
    by_day_map: dict[date, tuple[int, Decimal]] = {}
    for row in daily:
        d = row[0]
        if isinstance(d, datetime):
            d = d.date()
        by_day_map[d] = (int(row[1] or 0), Decimal(str(row[2] or 0)))
    by_day = _fill_days(date_from, date_to, by_day_map)

    exclude_lines = Order.status.in_(bad_st)
    line_on_sale = OrderLine.sale_percent_applied > 0
    top_q = (
        select(
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
        .where(
            Order.tenant_id == tenant_id,
            Order.created_at >= start,
            Order.created_at < end,
            ~exclude_lines,
        )
        .group_by(Product.id, Product.name)
        .order_by(func.sum(OrderLine.quantity * OrderLine.unit_price).desc())
        .limit(12)
    )
    top_rows = (await db.execute(top_q)).all()
    top_products = [
        ShopReportProductRow(
            product_id=int(r[0]),
            product_name=str(r[1]),
            quantity_sold=int(r[2] or 0),
            revenue_gross=Decimal(str(r[3] or 0)),
            quantity_sold_on_sale=int(r[4] or 0),
            revenue_gross_on_sale=Decimal(str(r[5] or 0)),
        )
        for r in top_rows
    ]

    disc_q = (
        select(
            func.coalesce(func.sum(case((line_on_sale, 1), else_=0)), 0),
            func.coalesce(func.sum(case((line_on_sale, OrderLine.quantity), else_=0)), 0),
            func.coalesce(
                func.sum(case((line_on_sale, OrderLine.quantity * OrderLine.unit_price), else_=Decimal("0"))),
                0,
            ),
        )
        .select_from(OrderLine)
        .join(Order, Order.id == OrderLine.order_id)
        .where(
            Order.tenant_id == tenant_id,
            Order.created_at >= start,
            Order.created_at < end,
            ~exclude_lines,
        )
    )
    dr = (await db.execute(disc_q)).one()
    cat_n = (
        await db.execute(
            select(func.count())
            .select_from(Product)
            .where(Product.tenant_id == tenant_id, Product.sale_percent > 0, Product.available.is_(True))
        )
    ).scalar_one()
    discount = ShopReportDiscountSummary(
        revenue_gross_from_discounted_lines=Decimal(str(dr[2] or 0)),
        units_sold_on_discounted_lines=int(dr[1] or 0),
        order_line_rows_on_sale=int(dr[0] or 0),
        catalog_products_with_active_sale=int(cat_n or 0),
    )

    src_q = (
        select(
            OrderSource.code,
            func.count(Order.id),
            func.coalesce(func.sum(Order.total), 0),
        )
        .select_from(Order)
        .join(OrderSource, OrderSource.id == Order.source_id)
        .where(base)
        .group_by(OrderSource.code)
        .order_by(func.count(Order.id).desc())
    )
    src_rows = (await db.execute(src_q)).all()
    by_source = [
        ShopReportSourceSlice(
            source_code=str(r[0]),
            orders=int(r[1] or 0),
            revenue_gross=Decimal(str(r[2] or 0)),
        )
        for r in src_rows
    ]

    return ShopReportOut(
        date_from=date_from,
        date_to=date_to,
        kpis=ShopReportKpiOut(
            orders_total=total_orders,
            orders_open=orders_open,
            orders_ready_or_picked=orders_done,
            orders_rejected_or_expired=orders_bad,
            revenue_settled=rev_settled_d,
            revenue_pipeline=rev_pipe_d,
        ),
        by_status=sorted(by_status, key=lambda x: -x.count),
        by_day=by_day,
        top_products=top_products,
        by_source=by_source,
        discount=discount,
    )
