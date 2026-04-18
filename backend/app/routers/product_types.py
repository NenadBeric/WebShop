from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import AuthUser
from app.i18n import tr
from app.models.product import Product
from app.models.product_type import ProductType
from app.schemas.product_types import ProductTypeCreate, ProductTypeOut, ProductTypePatch

router = APIRouter(prefix="/product-types", tags=["product-types"])


def _tenant(u: AuthUser) -> str:
    return u.tenant_id


@router.get("", response_model=list[ProductTypeOut])
async def list_types(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    r = await db.execute(
        select(ProductType).where(ProductType.tenant_id == t).order_by(ProductType.sort_order, ProductType.name)
    )
    return list(r.scalars().all())


@router.post("", response_model=ProductTypeOut, status_code=status.HTTP_201_CREATED)
async def create_type(
    body: ProductTypeCreate,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    exists = (
        await db.execute(select(ProductType).where(ProductType.tenant_id == t, ProductType.name == body.name.strip()))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=400, detail=tr("product_type_duplicate"))
    row = ProductType(tenant_id=t, name=body.name.strip(), sort_order=body.sort_order)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/{type_id}", response_model=ProductTypeOut)
async def patch_type(
    type_id: int,
    body: ProductTypePatch,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    row = (
        await db.execute(select(ProductType).where(ProductType.id == type_id, ProductType.tenant_id == t))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    if body.name is not None:
        nm = body.name.strip()
        dup = (
            await db.execute(
                select(ProductType).where(
                    ProductType.tenant_id == t,
                    ProductType.name == nm,
                    ProductType.id != type_id,
                )
            )
        ).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=400, detail=tr("product_type_duplicate"))
        row.name = nm
    if body.sort_order is not None:
        row.sort_order = body.sort_order
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_type(
    type_id: int,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    row = (
        await db.execute(select(ProductType).where(ProductType.id == type_id, ProductType.tenant_id == t))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    cnt = (
        await db.execute(select(func.count()).select_from(Product).where(Product.product_type_id == type_id))
    ).scalar_one()
    if int(cnt or 0) > 0:
        raise HTTPException(status_code=400, detail=tr("product_type_in_use"))
    await db.execute(delete(ProductType).where(ProductType.id == type_id))
    await db.commit()
    return None
