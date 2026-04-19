"""Autentifikovano: tema firme (tenant)."""

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.dependencies import AuthUser, DbSession
from app.i18n import tr
from app.rbac import CurrentUser
from app.schemas.tenant_theme import TenantThemeOut, TenantThemePatchDto
from app.services import tenant_service
from app.services import tenant_theme_service

router = APIRouter(prefix="/tenant/theme", tags=["tenant_theme"])


def _tenant(user: CurrentUser) -> str:
    t = (user.tenant_id or "").strip()
    if not t:
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    return t


@router.get("", response_model=TenantThemeOut)
async def get_my_tenant_theme(db: DbSession, user: AuthUser) -> TenantThemeOut:
    if not user.can_shop():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    tid = _tenant(user)
    await tenant_service.ensure_profile(db, tid)
    out = await tenant_theme_service.get_theme_out(db, tid)
    if not out:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    return out


@router.patch("", response_model=TenantThemeOut)
async def patch_my_tenant_theme(
    db: DbSession,
    user: AuthUser,
    body: TenantThemePatchDto,
) -> TenantThemeOut:
    tid = _tenant(user)
    await tenant_service.ensure_profile(db, tid)
    return await tenant_theme_service.patch_tenant_theme(db, tid, body, user)


@router.post("/logo", response_model=TenantThemeOut)
async def upload_my_tenant_logo(
    db: DbSession,
    user: AuthUser,
    file: UploadFile = File(...),
) -> TenantThemeOut:
    tid = _tenant(user)
    await tenant_service.ensure_profile(db, tid)
    return await tenant_theme_service.upload_tenant_logo(db, tid, file, user)


@router.get("/logo")
async def get_my_tenant_logo(db: DbSession, user: AuthUser):
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    tid = _tenant(user)
    return await tenant_theme_service.get_logo_file_response(db, tid)
