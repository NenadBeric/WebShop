"""Lista firmi za ADMIN izbor konteksta (bez X-Webshop-Tenant-Id)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import AuthUser
from app.i18n import tr
from app.models.tenant_profile import TenantProfile
from app.rbac import CurrentUser
from app.schemas.admin_tenant import AdminTenantBriefOut

router = APIRouter(prefix="/admin/tenants", tags=["admin_tenants"])


def _require_admin(user: AuthUser) -> CurrentUser:
    if not user.is_admin():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    return user


@router.get("", response_model=list[AdminTenantBriefOut])
async def list_tenants_for_admin(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    """Svi tenant profili (za padajući izbor firme) — samo ADMIN, bez obaveznog konteksta firme."""
    _require_admin(user)
    rows = (
        await db.execute(select(TenantProfile).order_by(TenantProfile.trade_name.asc(), TenantProfile.tenant_id.asc()))
    ).scalars().all()
    return [
        AdminTenantBriefOut(tenant_id=p.tenant_id, trade_name=(p.trade_name or p.tenant_id or "").strip() or p.tenant_id)
        for p in rows
    ]
