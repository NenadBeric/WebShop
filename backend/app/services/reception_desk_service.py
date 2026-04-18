from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.i18n import tr
from app.models.reception_desk_selection import ReceptionDeskSelection
from app.models.tenant_profile import TenantLocation
from app.rbac import CurrentUser


async def get_selected_location_id(db: AsyncSession, user: CurrentUser) -> int | None:
    if user.role != "WEBSHOP_RECEPTION":
        return None
    r = await db.execute(
        select(ReceptionDeskSelection.location_id).where(
            ReceptionDeskSelection.tenant_id == user.tenant_id,
            ReceptionDeskSelection.user_sub == user.sub,
        )
    )
    row = r.scalar_one_or_none()
    return int(row) if row is not None else None


async def set_selected_location(db: AsyncSession, user: CurrentUser, location_id: int) -> int:
    if user.role != "WEBSHOP_RECEPTION":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    loc = await db.get(TenantLocation, location_id)
    if (
        loc is None
        or loc.tenant_id != user.tenant_id
        or not loc.is_active
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=tr("reception_invalid_location"))
    r = await db.execute(
        select(ReceptionDeskSelection).where(
            ReceptionDeskSelection.tenant_id == user.tenant_id,
            ReceptionDeskSelection.user_sub == user.sub,
        )
    )
    row = r.scalar_one_or_none()
    if row is None:
        row = ReceptionDeskSelection(
            tenant_id=user.tenant_id,
            user_sub=user.sub,
            location_id=location_id,
        )
        db.add(row)
    else:
        row.location_id = location_id
    await db.commit()
    await db.refresh(row)
    return int(row.location_id)
