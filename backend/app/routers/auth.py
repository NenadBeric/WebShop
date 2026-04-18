from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import AuthUser
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.dependencies import create_legacy_access_token
from app.i18n import tr
from app.models.dev_user import DevUser
from app.security.passwords import verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=256)


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SessionOut(BaseModel):
    sub: str
    email: str
    name: str
    role: str
    tenant_id: str


@router.get("/me", response_model=SessionOut)
async def session_me(user: AuthUser):
    """Normalizovani podaci iz JWT (posebno Zitadel ugnježđene uloge)."""
    return SessionOut(
        sub=user.sub,
        email=user.email,
        name=user.name,
        role=user.role,
        tenant_id=user.tenant_id,
    )


@router.post("/login", response_model=LoginOut)
async def login(body: LoginBody, db: AsyncSession = Depends(get_session)):
    if not settings.legacy_auth_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=tr("legacy_auth_disabled"))

    r = await db.execute(select(DevUser).where(DevUser.email == body.email))
    user = r.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=tr("bad_credentials"))

    # Stabilan sub (email): porudžbine i notifikacije ne zavise od autoincrement id posle re-seeda.
    token = create_legacy_access_token(
        sub=user.email,
        tenant_id=user.tenant_id,
        role=user.role,
        email=user.email,
        name=user.display_name or user.email,
    )
    return LoginOut(access_token=token)
