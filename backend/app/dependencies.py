from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.oidc import decode_token
from app.config import settings
from app.database import get_session
from app.i18n import tr
from app.models.tenant_profile import TenantProfile
from app.rbac import CurrentUser

security = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_session)]


def _decode_payload(token: str) -> dict:
    """Decode JWT from WebShop/OIDC first, then fall back to Trainify HS256.

    This supports Trainify-embedded WebShop where the parent app passes its own JWT.
    """
    try:
        return decode_token(
            token,
            oidc_issuer=settings.OIDC_ISSUER,
            oidc_issuer_external=settings.OIDC_ISSUER_EXTERNAL,
            legacy_secret=settings.JWT_SECRET,
            legacy_algorithm=settings.JWT_ALGORITHM,
            oidc_audience=settings.OIDC_AUDIENCE,
        )
    except JWTError:
        pass
    ts = (settings.TRAINIFY_JWT_SECRET or "").strip()
    if ts:
        try:
            alg = (settings.TRAINIFY_JWT_ALGORITHM or "HS256").strip() or "HS256"
            return jwt.decode(token, ts, algorithms=[alg])
        except JWTError:
            pass
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=tr("invalid_token"))


# Backwards-compatible alias (older code referenced this name).
def _try_decode_webshop_or_trainify(token: str) -> dict:
    return _decode_payload(token)


def _payload_to_user(payload: dict) -> CurrentUser:
    sub = str(payload.get("sub", ""))
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=tr("invalid_token"))
    tenant = str(payload.get("tenant_id", ""))
    if not tenant and payload.get("role") != "ADMIN":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=tr("invalid_token"))
    return CurrentUser(
        sub=sub,
        tenant_id=tenant,
        role=str(payload.get("role", "")),
        email=str(payload.get("email", "")),
        name=str(payload.get("name", "")),
    )


async def get_current_user(
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: DbSession,
    x_webshop_tenant_id: Annotated[str | None, Header(alias="X-Webshop-Tenant-Id")] = None,
    x_trainify_tenant_id: Annotated[str | None, Header(alias="X-Trainify-Tenant-Id")] = None,
) -> CurrentUser:
    if cred is None or not cred.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=tr("invalid_token"))
    token_str = cred.credentials
    tenant_header = (x_webshop_tenant_id or x_trainify_tenant_id or "").strip()
    payload = _decode_payload(token_str)

    role_raw = str(payload.get("role", "")).strip()
    if role_raw == "CLIENT" and tenant_header:
        row = await db.get(TenantProfile, tenant_header)
        if row is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=tr("admin_tenant_unknown"))
        uid = str(payload.get("sub", "")).strip()
        if not uid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=tr("invalid_token"))
        email = str(payload.get("email", "")).strip()
        display = email.split("@")[0] if "@" in email else email
        return CurrentUser(
            sub=f"trainify:{uid}",
            tenant_id=tenant_header,
            role="WEBSHOP_CUSTOMER",
            email=email,
            name=display or f"user-{uid}",
        )

    user = _payload_to_user(payload)
    if user.is_admin():
        h = (x_webshop_tenant_id or "").strip()
        if h:
            row = await db.get(TenantProfile, h)
            if row is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=tr("admin_tenant_unknown"))
            return CurrentUser(
                sub=user.sub,
                tenant_id=h,
                role=user.role,
                email=user.email,
                name=user.name,
            )
    return user


AuthUser = Annotated[CurrentUser, Depends(get_current_user)]


def create_legacy_access_token(*, sub: str, tenant_id: str, role: str, email: str, name: str) -> str:
    from datetime import UTC, datetime, timedelta

    exp = datetime.now(UTC) + timedelta(hours=settings.JWT_EXPIRE_HOURS)
    payload = {
        "sub": sub,
        "tenant_id": tenant_id,
        "role": role,
        "email": email,
        "name": name,
        "exp": exp,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
