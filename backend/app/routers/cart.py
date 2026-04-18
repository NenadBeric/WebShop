from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session
from app.dependencies import AuthUser
from app.i18n import tr
from app.models.cart_line import CartLine
from app.models.product import Product
from app.rbac import CurrentUser
from app.schemas.cart import CartLineItemOut, CartOut, CartPutIn
from app.schemas.products import ProductOut

router = APIRouter(prefix="/cart", tags=["cart"])


def _tenant(u: CurrentUser) -> str:
    return u.tenant_id


def _sub(u: CurrentUser) -> str:
    return u.sub


async def _cart_rows(
    db: AsyncSession,
    tenant: str,
    client_sub: str,
) -> list[CartLine]:
    r = await db.execute(
        select(CartLine)
        .where(CartLine.tenant_id == tenant, CartLine.client_sub == client_sub)
        .options(
            selectinload(CartLine.product).selectinload(Product.type_row),
            selectinload(CartLine.product).selectinload(Product.measure_row),
        )
    )
    return list(r.scalars().all())


def _line_to_out(row: CartLine) -> CartLineItemOut | None:
    pr = row.product
    if pr is None:
        return None
    return CartLineItemOut(
        product=ProductOut.from_product(pr),
        quantity=row.quantity,
        note=row.note or "",
    )


@router.get("", response_model=CartOut)
async def get_cart(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_shop():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    rows = await _cart_rows(db, _tenant(user), _sub(user))
    lines = [x for r in rows if (x := _line_to_out(r)) is not None]
    return CartOut(lines=lines)


@router.put("", response_model=CartOut)
async def replace_cart(
    body: CartPutIn,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_shop():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    t = _tenant(user)
    sub = _sub(user)

    merged: dict[int, tuple[int, str]] = {}
    for ln in body.lines:
        if ln.quantity < 1:
            continue
        if ln.product_id in merged:
            q0, n0 = merged[ln.product_id]
            merged[ln.product_id] = (min(q0 + ln.quantity, 9999), ln.note if ln.note else n0)
        else:
            merged[ln.product_id] = (ln.quantity, ln.note or "")

    if merged:
        pids = list(merged.keys())
        r = await db.execute(select(Product.id).where(Product.tenant_id == t, Product.id.in_(pids)))
        found = {int(x) for x in r.scalars().all()}
        if found != set(pids):
            raise HTTPException(status_code=400, detail=tr("validation_error"))

    await db.execute(delete(CartLine).where(CartLine.tenant_id == t, CartLine.client_sub == sub))
    for pid, (qty, note) in merged.items():
        db.add(
            CartLine(
                tenant_id=t,
                client_sub=sub,
                product_id=pid,
                quantity=qty,
                note=note[:2000] if note else "",
            )
        )
    await db.commit()
    rows = await _cart_rows(db, t, sub)
    lines = [x for r in rows if (x := _line_to_out(r)) is not None]
    return CartOut(lines=lines)


@router.delete("", response_model=CartOut)
async def clear_cart(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_shop():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    t = _tenant(user)
    sub = _sub(user)
    await db.execute(delete(CartLine).where(CartLine.tenant_id == t, CartLine.client_sub == sub))
    await db.commit()
    return CartOut(lines=[])
