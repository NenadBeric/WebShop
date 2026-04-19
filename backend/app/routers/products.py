from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session
from app.dependencies import AuthUser
from app.i18n import tr
from app.models.measure_unit import MeasureUnit
from app.models.product import Product
from app.models.product_type import ProductType
from app.schemas.products import ProductCreate, ProductOut, ProductPatch, product_out_list
from app.services import license_service
from app.services.vat import prices_consistent

router = APIRouter(prefix="/products", tags=["products"])


def _tenant(u: AuthUser) -> str:
    return u.tenant_id


def _product_load_options():
    return (selectinload(Product.type_row), selectinload(Product.measure_row))


async def _validate_replacement_product_ids(
    db: AsyncSession,
    tenant: str,
    ids: list[int] | None,
    self_product_id: int | None,
) -> list[int]:
    if not ids:
        return []
    seen: list[int] = []
    for i in ids:
        if self_product_id is not None and i == self_product_id:
            continue
        if i in seen:
            continue
        seen.append(i)
        if len(seen) >= 3:
            break
    if not seen:
        return []
    cnt = (
        await db.execute(
            select(func.count()).select_from(Product).where(Product.tenant_id == tenant, Product.id.in_(seen))
        )
    ).scalar_one()
    if int(cnt or 0) != len(seen):
        raise HTTPException(status_code=400, detail=tr("validation_error"))
    return seen


@router.get("/for-training-type", response_model=list[ProductOut])
async def products_for_training_type(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
    training_type: str = Query("", alias="type"),
):
    if not user.can_shop():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    q = (
        select(Product)
        .join(ProductType, Product.product_type_id == ProductType.id)
        .where(Product.tenant_id == t, Product.available.is_(True))
        .options(*_product_load_options())
    )
    if training_type.strip():
        q = q.where(ProductType.name.ilike(f"%{training_type.strip()}%"))
    q = q.order_by(Product.name)
    r = await db.execute(q)
    return product_out_list(list(r.unique().scalars().all()))


@router.get("", response_model=list[ProductOut])
async def list_catalog_products(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_shop():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    r = await db.execute(
        select(Product)
        .where(Product.tenant_id == t, Product.available.is_(True))
        .options(*_product_load_options())
        .order_by(Product.name)
    )
    return product_out_list(list(r.scalars().all()))


@router.get("/manage", response_model=list[ProductOut])
async def list_all_products(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    r = await db.execute(
        select(Product).where(Product.tenant_id == t).options(*_product_load_options()).order_by(Product.id)
    )
    return product_out_list(list(r.scalars().all()))


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    await license_service.enforce_tenant_write_allowed(db, user)
    await license_service.enforce_product_quota(db, t)
    pt = (
        await db.execute(select(ProductType).where(ProductType.id == body.product_type_id, ProductType.tenant_id == t))
    ).scalar_one_or_none()
    if not pt:
        raise HTTPException(status_code=400, detail=tr("validation_error"))
    mu = (
        await db.execute(select(MeasureUnit).where(MeasureUnit.id == body.measure_unit_id, MeasureUnit.tenant_id == t))
    ).scalar_one_or_none()
    if not mu:
        raise HTTPException(status_code=400, detail=tr("validation_error"))
    rids = await _validate_replacement_product_ids(db, t, body.replacement_product_ids, None)
    p = Product(
        tenant_id=t,
        product_type_id=body.product_type_id,
        measure_unit_id=body.measure_unit_id,
        quantity=body.quantity,
        name=body.name,
        description=body.description,
        vat_rate_percent=body.vat_rate_percent,
        price_net=body.price_net,
        price_gross=body.price_gross,
        image_url=body.image_url,
        available=body.available,
        replacement_product_ids=rids,
        sale_percent=body.sale_percent,
    )
    db.add(p)
    await db.commit()
    pr = (
        await db.execute(select(Product).where(Product.id == p.id).options(*_product_load_options()))
    ).scalar_one()
    return ProductOut.from_product(pr)


@router.patch("/{product_id}", response_model=ProductOut)
async def patch_product(
    product_id: int,
    body: ProductPatch,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    p = (
        await db.execute(
            select(Product)
            .where(Product.id == product_id, Product.tenant_id == t)
            .options(*_product_load_options())
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    data = body.model_dump(exclude_unset=True)
    if "replacement_product_ids" in data and data["replacement_product_ids"] is not None:
        data["replacement_product_ids"] = await _validate_replacement_product_ids(
            db, t, data["replacement_product_ids"], product_id
        )
    if any(k in data for k in ("price_net", "price_gross", "vat_rate_percent")):
        net = data.get("price_net", p.price_net)
        gross = data.get("price_gross", p.price_gross)
        vat = data.get("vat_rate_percent", p.vat_rate_percent)
        if not prices_consistent(net, gross, vat):
            raise HTTPException(status_code=400, detail=tr("price_vat_mismatch"))
        data["price_net"] = net
        data["price_gross"] = gross
        data["vat_rate_percent"] = vat
    if "product_type_id" in data and data["product_type_id"] is not None:
        pt = (
            await db.execute(
                select(ProductType).where(ProductType.id == data["product_type_id"], ProductType.tenant_id == t)
            )
        ).scalar_one_or_none()
        if not pt:
            raise HTTPException(status_code=400, detail=tr("validation_error"))
    if "measure_unit_id" in data and data["measure_unit_id"] is not None:
        mu = (
            await db.execute(
                select(MeasureUnit).where(MeasureUnit.id == data["measure_unit_id"], MeasureUnit.tenant_id == t)
            )
        ).scalar_one_or_none()
        if not mu:
            raise HTTPException(status_code=400, detail=tr("validation_error"))
    for k, v in data.items():
        setattr(p, k, v)
    await db.commit()
    pr = (
        await db.execute(select(Product).where(Product.id == p.id).options(*_product_load_options()))
    ).scalar_one()
    return ProductOut.from_product(pr)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: int,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    p = (
        await db.execute(select(Product).where(Product.id == product_id, Product.tenant_id == t))
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    await db.execute(delete(Product).where(Product.id == product_id, Product.tenant_id == t))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
