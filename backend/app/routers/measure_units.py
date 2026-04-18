from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import AuthUser
from app.i18n import tr
from app.models.measure_unit import MeasureUnit
from app.models.product import Product
from app.schemas.measure_units import MeasureUnitCreate, MeasureUnitOut, MeasureUnitPatch

router = APIRouter(prefix="/measure-units", tags=["measure-units"])


def _tenant(u: AuthUser) -> str:
    return u.tenant_id


@router.get("", response_model=list[MeasureUnitOut])
async def list_units(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    r = await db.execute(
        select(MeasureUnit).where(MeasureUnit.tenant_id == t).order_by(MeasureUnit.sort_order, MeasureUnit.name)
    )
    return list(r.scalars().all())


@router.post("", response_model=MeasureUnitOut, status_code=status.HTTP_201_CREATED)
async def create_unit(
    body: MeasureUnitCreate,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    exists = (
        await db.execute(select(MeasureUnit).where(MeasureUnit.tenant_id == t, MeasureUnit.name == body.name.strip()))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=400, detail=tr("measure_unit_duplicate"))
    row = MeasureUnit(tenant_id=t, name=body.name.strip(), sort_order=body.sort_order)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/{unit_id}", response_model=MeasureUnitOut)
async def patch_unit(
    unit_id: int,
    body: MeasureUnitPatch,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    row = (
        await db.execute(select(MeasureUnit).where(MeasureUnit.id == unit_id, MeasureUnit.tenant_id == t))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    if body.name is not None:
        nm = body.name.strip()
        dup = (
            await db.execute(
                select(MeasureUnit).where(
                    MeasureUnit.tenant_id == t,
                    MeasureUnit.name == nm,
                    MeasureUnit.id != unit_id,
                )
            )
        ).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=400, detail=tr("measure_unit_duplicate"))
        row.name = nm
    if body.sort_order is not None:
        row.sort_order = body.sort_order
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_unit(
    unit_id: int,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    row = (
        await db.execute(select(MeasureUnit).where(MeasureUnit.id == unit_id, MeasureUnit.tenant_id == t))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    cnt = (
        await db.execute(select(func.count()).select_from(Product).where(Product.measure_unit_id == unit_id))
    ).scalar_one()
    if int(cnt or 0) > 0:
        raise HTTPException(status_code=400, detail=tr("measure_unit_in_use"))
    await db.execute(delete(MeasureUnit).where(MeasureUnit.id == unit_id))
    await db.commit()
    return None
