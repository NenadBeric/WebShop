from fastapi import APIRouter, HTTPException, status

from app.dependencies import AuthUser, DbSession
from app.i18n import tr
from app.schemas.tenant import TenantOrderRulesOut, TenantProfileOut, TenantProfileUpdate
from app.services import tenant_service

router = APIRouter(prefix="/tenant", tags=["tenant"])


@router.get("/order-rules", response_model=TenantOrderRulesOut)
async def get_order_rules(db: DbSession, user: AuthUser) -> TenantOrderRulesOut:
    if not user.can_shop():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    return await tenant_service.get_order_rules(db, user.tenant_id)


@router.get("/settings", response_model=TenantProfileOut)
async def get_tenant_settings(db: DbSession, user: AuthUser) -> TenantProfileOut:
    if not user.can_manage_catalog():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    return await tenant_service.get_profile_out(db, user.tenant_id)


@router.put("/settings", response_model=TenantProfileOut)
async def put_tenant_settings(
    db: DbSession, user: AuthUser, body: TenantProfileUpdate
) -> TenantProfileOut:
    if not user.can_manage_catalog():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    return await tenant_service.update_profile(db, user, body)
