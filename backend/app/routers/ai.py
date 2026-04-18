import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import AuthUser
from app.i18n import tr
from app.limiter import limiter
from app.schemas.ai import (
    AiCatalogSearchHit,
    AiCatalogSearchIn,
    AiCatalogSearchOut,
    StaffChatIn,
    StaffChatRenameIn,
    StaffChatSessionOut,
)
from app.services import ai_nl_catalog, ai_staff_chat_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


@limiter.limit("20/minute")
@router.post("/catalog-search", response_model=AiCatalogSearchOut)
async def catalog_search(
    request: Request,
    body: AiCatalogSearchIn,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_shop():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    try:
        hits = await ai_nl_catalog.nl_catalog_search(db, tenant_id=user.tenant_id, query=body.query.strip())
    except ValueError as e:
        if str(e) == "ai_disabled":
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=tr("ai_disabled")) from e
        if str(e) == "llm_misconfigured":
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=tr("llm_misconfigured")) from e
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception:
        logger.exception("AI catalog-search")
        raise HTTPException(status_code=500, detail=tr("validation_error")) from None
    return AiCatalogSearchOut(hits=[AiCatalogSearchHit(**h) for h in hits])


@router.get("/health")
async def ai_health():
    from app.config import settings

    ok = bool((settings.LLM_API_KEY or "").strip())
    return {
        "llm_provider": settings.LLM_PROVIDER,
        "llm_configured": ok,
    }


@limiter.limit("12/minute")
@router.post("/staff-chat")
async def staff_chat_stream(
    request: Request,
    body: StaffChatIn,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    """SSE chat za vlasnika/menadžera — alati nad izveštajima (Trainify-style događaji)."""
    if not user.can_manage_catalog():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))

    return StreamingResponse(
        ai_staff_chat_service.staff_chat_stream(
            db,
            user,
            session_id=body.session_id,
            message=body.message.strip(),
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/staff-chat/sessions", response_model=list[StaffChatSessionOut])
async def staff_chat_sessions(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    rows = await ai_staff_chat_service.list_sessions(db, user)
    return [StaffChatSessionOut(**r) for r in rows]


@router.get("/staff-chat/sessions/{session_id}/messages")
async def staff_chat_messages(
    session_id: int,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    return await ai_staff_chat_service.list_messages(db, user, session_id, limit=limit, offset=offset)


@router.delete("/staff-chat/sessions/{session_id}")
async def staff_chat_delete_session(
    session_id: int,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    ok = await ai_staff_chat_service.delete_session(db, user, session_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=tr("validation_error"))
    return {"ok": True}


@router.patch("/staff-chat/sessions/{session_id}")
async def staff_chat_rename_session(
    session_id: int,
    body: StaffChatRenameIn,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    ok = await ai_staff_chat_service.rename_session(db, user, session_id, body.title)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=tr("validation_error"))
    return {"ok": True}
