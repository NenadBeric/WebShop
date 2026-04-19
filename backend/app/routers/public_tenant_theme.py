"""Javno: brend tenanta (login / embed bez JWT)."""

from fastapi import APIRouter, HTTPException

from app.dependencies import DbSession
from app.i18n import tr
from app.models.tenant_profile import TenantProfile
from app.schemas.tenant_theme import TenantThemeOut
from app.services import tenant_theme_service

router = APIRouter(prefix="/public/tenants", tags=["public_tenant_theme"])


@router.get("/{tenant_id}/theme", response_model=TenantThemeOut)
async def get_public_tenant_theme(tenant_id: str, db: DbSession) -> TenantThemeOut:
    tid = (tenant_id or "").strip()
    if not tid:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    p = await db.get(TenantProfile, tid)
    if not p:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    return tenant_theme_service.profile_to_public_theme_out(p)


@router.get("/{tenant_id}/theme/logo")
async def get_public_tenant_logo(tenant_id: str, db: DbSession):
    tid = (tenant_id or "").strip()
    if not tid:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    p = await db.get(TenantProfile, tid)
    if not p:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    return await tenant_theme_service.get_logo_file_response(db, tid)
