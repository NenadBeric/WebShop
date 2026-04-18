from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.oidc import decode_token
from app.config import settings
from app.database import get_session
from app.i18n import tr
from app.rbac import CurrentUser

security = HTTPBearer(auto_error=False)


def _decode_payload(token: str) -> dict:
    try:
        return decode_token(
            token,
            oidc_issuer=settings.OIDC_ISSUER,
            oidc_issuer_external=settings.OIDC_ISSUER_EXTERNAL,
            legacy_secret=settings.JWT_SECRET,
            legacy_algorithm=settings.JWT_ALGORITHM,
            oidc_audience=settings.OIDC_AUDIENCE,
        )
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=tr("invalid_token")) from exc


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
) -> CurrentUser:
    if cred is None or not cred.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=tr("invalid_token"))
    payload = _decode_payload(cred.credentials)
    return _payload_to_user(payload)


DbSession = Annotated[AsyncSession, Depends(get_session)]
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
