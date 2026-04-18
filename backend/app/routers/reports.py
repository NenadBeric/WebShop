from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import AuthUser
from app.i18n import tr
from app.schemas.reports import ShopReportOut
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])

_MAX_RANGE_DAYS = 400


@router.get("/shop", response_model=ShopReportOut)
async def shop_report(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
    date_from: date = Query(..., description="Početak perioda (UTC datum)"),
    date_to: date = Query(..., description="Kraj perioda uključivo (UTC datum)"),
):
    """Izveštaj za menadžera / vlasnika / admina — agregati porudžbina u tenantu."""
    if not user.can_manage_catalog():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    if date_to < date_from:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=tr("validation_error"))
    if (date_to - date_from).days > _MAX_RANGE_DAYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=tr("validation_error"))
    return await report_service.build_shop_report(
        db,
        tenant_id=user.tenant_id,
        date_from=date_from,
        date_to=date_to,
    )
