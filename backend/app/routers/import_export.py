"""CSV uvoz/izvoz proizvoda i jednostavan prodajni izvještaj."""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session
from app.dependencies import AuthUser
from app.i18n import tr
from app.models.measure_unit import MeasureUnit
from app.models.product import Product
from app.models.product_type import ProductType
from app.models.shop_order import Order, OrderStatus
from app.rbac import CurrentUser
from app.services.vat import prices_consistent

router = APIRouter(tags=["import_export"])


def _tenant(u: CurrentUser) -> str:
    return u.tenant_id


@router.get("/products/export.csv")
async def export_products_csv(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    rows = (await db.execute(select(Product).where(Product.tenant_id == t).order_by(Product.id))).scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "id",
            "name",
            "product_type_id",
            "measure_unit_id",
            "quantity",
            "vat_rate_percent",
            "price_net",
            "price_gross",
            "sale_percent",
            "description",
            "image_url",
            "available",
            "replacement_product_ids",
        ]
    )
    for p in rows:
        w.writerow(
            [
                p.id,
                p.name,
                p.product_type_id,
                p.measure_unit_id,
                str(p.quantity),
                str(p.vat_rate_percent),
                str(p.price_net),
                str(p.price_gross),
                str(int(getattr(p, "sale_percent", 0) or 0)),
                p.description,
                p.image_url,
                "1" if p.available else "0",
                ",".join(str(x) for x in (p.replacement_product_ids or [])),
            ]
        )
    return Response(
        content=buf.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="products.csv"'},
    )


@router.post("/import/products", status_code=status.HTTP_200_OK)
async def import_products_csv(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
    file: UploadFile = File(...),
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    raw = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    t = _tenant(user)
    created = 0
    updated = 0
    for row in reader:
        rid_raw = (row.get("replacement_product_ids") or "").strip()
        repl: list[int] = []
        if rid_raw:
            for part in rid_raw.split(","):
                part = part.strip()
                if part.isdigit():
                    repl.append(int(part))
        repl = repl[:3]
        available = str(row.get("available", "1")).strip() in ("1", "true", "True", "yes", "YES")
        name = (row.get("name") or "").strip()
        if not name:
            continue
        desc = (row.get("description") or "").strip()
        image_url = (row.get("image_url") or "").strip() or "https://placehold.co/400x300?text=Product"
        try:
            ptype_id = int(row.get("product_type_id") or "0")
        except ValueError:
            continue
        pt = (
            await db.execute(select(ProductType).where(ProductType.id == ptype_id, ProductType.tenant_id == t))
        ).scalar_one_or_none()
        if not pt:
            continue
        try:
            muid_raw = int(row.get("measure_unit_id") or "0")
        except ValueError:
            muid_raw = 0
        if muid_raw:
            mu = (
                await db.execute(select(MeasureUnit).where(MeasureUnit.id == muid_raw, MeasureUnit.tenant_id == t))
            ).scalar_one_or_none()
            if not mu:
                continue
            measure_unit_id = muid_raw
        else:
            mu = (
                await db.execute(select(MeasureUnit).where(MeasureUnit.tenant_id == t, MeasureUnit.name == "kom"))
            ).scalar_one_or_none()
            if not mu:
                continue
            measure_unit_id = mu.id
        try:
            qty = Decimal(str(row.get("quantity", "1")).replace(",", "."))
        except Exception:
            qty = Decimal("1")
        if qty <= 0:
            qty = Decimal("1")
        try:
            vat = Decimal(str(row.get("vat_rate_percent", "20")).replace(",", "."))
            pnet = Decimal(str(row.get("price_net", "0")).replace(",", "."))
            pgross = Decimal(str(row.get("price_gross", "0")).replace(",", "."))
        except Exception:
            continue
        if not prices_consistent(pnet, pgross, vat):
            continue
        try:
            sale_pct = int(str(row.get("sale_percent", "0")).strip() or "0")
        except ValueError:
            sale_pct = 0
        sale_pct = max(0, min(99, sale_pct))
        pid = row.get("id")
        if pid and str(pid).isdigit():
            existing = await db.get(Product, int(pid))
            if existing and existing.tenant_id == t:
                existing.name = name
                existing.description = desc
                existing.image_url = image_url
                existing.product_type_id = ptype_id
                existing.measure_unit_id = measure_unit_id
                existing.quantity = qty
                existing.vat_rate_percent = vat
                existing.price_net = pnet
                existing.price_gross = pgross
                existing.sale_percent = sale_pct
                existing.available = available
                existing.replacement_product_ids = repl
                updated += 1
                continue
        db.add(
            Product(
                tenant_id=t,
                product_type_id=ptype_id,
                measure_unit_id=measure_unit_id,
                quantity=qty,
                name=name,
                description=desc,
                image_url=image_url,
                vat_rate_percent=vat,
                price_net=pnet,
                price_gross=pgross,
                sale_percent=sale_pct,
                available=available,
                replacement_product_ids=repl,
            )
        )
        created += 1
    await db.commit()
    return {"created": created, "updated": updated}


@router.get("/reports/sales")
async def sales_report(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
    format: str = "json",
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    stmt = (
        select(Order)
        .where(Order.tenant_id == t, Order.status == OrderStatus.PICKED_UP.value)
        .order_by(Order.created_at.desc())
    )
    orders = (await db.execute(stmt)).scalars().all()
    if format == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["order_id", "order_number", "created_at", "total", "client_email"])
        for o in orders:
            w.writerow([o.id, o.order_number, o.created_at.isoformat(), str(o.total), o.client_email])
        return Response(
            content=buf.getvalue().encode("utf-8-sig"),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="sales.csv"'},
        )
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "orders": [
            {
                "id": o.id,
                "order_number": o.order_number,
                "created_at": o.created_at.isoformat(),
                "total": str(o.total),
                "client_email": o.client_email,
            }
            for o in orders
        ],
    }
