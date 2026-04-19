from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import AuthUser
from app.i18n import tr
from app.models.dev_user import DevUser
from app.models.tenant_staff import TenantStaff
from app.rbac import CurrentUser, may_modify_staff_row
from app.schemas.tenant_staff import TenantStaffCreate, TenantStaffOut, TenantStaffPatch
from app.config import settings
from app.services import license_service
from app.services.zitadel_staff_directory import zitadel_email_in_use

router = APIRouter(prefix="/tenant/staff", tags=["tenant_staff"])


def _tenant(u: CurrentUser) -> str:
    t = (u.tenant_id or "").strip()
    if not t:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("forbidden"))
    return t


async def _local_email_conflict(db: AsyncSession, tenant_id: str, email_n: str) -> bool:
    r1 = await db.execute(
        select(func.count()).select_from(TenantStaff).where(
            TenantStaff.tenant_id == tenant_id,
            TenantStaff.email_normalized == email_n,
        )
    )
    if int(r1.scalar_one() or 0) > 0:
        return True
    r2 = await db.execute(select(func.count()).select_from(DevUser).where(func.lower(DevUser.email) == email_n))
    return int(r2.scalar_one() or 0) > 0


async def _assert_email_available(db: AsyncSession, user: CurrentUser, email: str) -> None:
    email_n = email.strip().lower()
    if settings.ENVIRONMENT == "production":
        if await _local_email_conflict(db, _tenant(user), email_n):
            raise HTTPException(status_code=400, detail=tr("staff_email_local_exists"))
        try:
            if await zitadel_email_in_use(email=email_n, tenant_id=_tenant(user)):
                raise HTTPException(status_code=400, detail=tr("staff_email_zitadel_exists"))
        except HTTPException:
            raise
        except RuntimeError as e:
            code = str(e)
            if code == "zitadel_management_not_configured":
                raise HTTPException(status_code=503, detail=tr("staff_zitadel_not_configured")) from e
            raise HTTPException(status_code=502, detail=tr("staff_zitadel_check_failed")) from e
    else:
        if await _local_email_conflict(db, _tenant(user), email_n):
            raise HTTPException(status_code=400, detail=tr("staff_email_local_exists"))


@router.get("", response_model=list[TenantStaffOut])
async def list_staff(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_staff():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    r = await db.execute(
        select(TenantStaff).where(TenantStaff.tenant_id == t).order_by(TenantStaff.active.desc(), TenantStaff.email)
    )
    return [TenantStaffOut.model_validate(x) for x in r.scalars().all()]


@router.post("", response_model=TenantStaffOut, status_code=status.HTTP_201_CREATED)
async def create_staff(
    body: TenantStaffCreate,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_staff():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    role = body.role.strip()
    if role not in user.assignable_staff_roles():
        raise HTTPException(status_code=400, detail=tr("staff_invalid_role"))
    await license_service.enforce_tenant_write_allowed(db, user)
    if role in license_service.STAFF_COUNT_ROLES:
        await license_service.enforce_staff_seat_quota(db, _tenant(user))
    await _assert_email_available(db, user, body.email)
    email_n = body.email.strip().lower()
    row = TenantStaff(
        tenant_id=_tenant(user),
        email=str(body.email).strip(),
        email_normalized=email_n,
        display_name=(body.display_name or "").strip()[:500],
        role=role,
        active=True,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail=tr("staff_email_local_exists")) from None
    await db.refresh(row)
    return TenantStaffOut.model_validate(row)


@router.patch("/{staff_id}", response_model=TenantStaffOut)
async def patch_staff(
    staff_id: int,
    body: TenantStaffPatch,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: AuthUser,
):
    if not user.can_manage_staff():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    t = _tenant(user)
    row = (
        await db.execute(select(TenantStaff).where(TenantStaff.id == staff_id, TenantStaff.tenant_id == t))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=tr("not_found"))
    if not may_modify_staff_row(user, row.role):
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    data = body.model_dump(exclude_unset=True)
    if "role" in data and data["role"] is not None:
        nr = str(data["role"]).strip()
        if len(nr) < 4:
            raise HTTPException(status_code=400, detail=tr("validation_error"))
        if nr not in user.assignable_staff_roles():
            raise HTTPException(status_code=400, detail=tr("staff_invalid_role"))
        if not may_modify_staff_row(user, nr):
            raise HTTPException(status_code=403, detail=tr("forbidden"))
        row.role = nr
    if "display_name" in data and data["display_name"] is not None:
        row.display_name = str(data["display_name"]).strip()[:500]
    if "active" in data and data["active"] is not None:
        row.active = bool(data["active"])
    await db.commit()
    await db.refresh(row)
    return TenantStaffOut.model_validate(row)
