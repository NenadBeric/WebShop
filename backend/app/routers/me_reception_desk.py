from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import AuthUser
from app.i18n import tr
from app.schemas.reception_desk import ReceptionDeskOut, ReceptionDeskPut
from app.services import reception_desk_service, tenant_service

router = APIRouter(prefix="/me/reception-desk", tags=["reception-desk"])


@router.get("", response_model=ReceptionDeskOut)
async def get_reception_desk(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_reception():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    rules = await tenant_service.get_order_rules(db, user.tenant_id)
    loc_id: int | None = None
    if user.role == "WEBSHOP_RECEPTION":
        loc_id = await reception_desk_service.get_selected_location_id(db, user)
    return ReceptionDeskOut(location_id=loc_id, locations=list(rules.locations))


@router.put("", response_model=ReceptionDeskOut)
async def put_reception_desk(
    body: ReceptionDeskPut,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_reception():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    await reception_desk_service.set_selected_location(db, user, body.location_id)
    rules = await tenant_service.get_order_rules(db, user.tenant_id)
    loc_id = await reception_desk_service.get_selected_location_id(db, user)
    return ReceptionDeskOut(location_id=loc_id, locations=list(rules.locations))
