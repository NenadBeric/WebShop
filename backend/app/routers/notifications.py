from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import AuthUser
from app.schemas.notifications import NotificationDeleteBody, NotificationOut, NotificationReadBody
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
    limit: int = Query(50, ge=1, le=100),
    unread_only: bool = Query(False),
):
    return await notification_service.list_notifications(db, user, limit=limit, unread_only=unread_only)


@router.post("/read", response_model=dict)
async def mark_read(
    body: NotificationReadBody,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    n = await notification_service.mark_notifications_read(db, user, body.ids)
    return {"marked": n}


@router.post("/delete", response_model=dict)
async def delete_many(
    body: NotificationDeleteBody,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    n = await notification_service.delete_notifications(db, user, body.ids)
    return {"deleted": n}


@router.post("/clear", response_model=dict)
async def clear_all(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    n = await notification_service.clear_notifications(db, user)
    return {"deleted": n}


@router.post("/clear-read", response_model=dict)
async def clear_read(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    n = await notification_service.clear_read_notifications(db, user)
    return {"deleted": n}
