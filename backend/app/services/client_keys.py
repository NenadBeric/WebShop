"""Usklađivanje vlasnika porudžbine / notifikacije sa legacy JWT (sub = id) i stabilnim identitetom (email)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dev_user import DevUser
from app.rbac import CurrentUser


async def legacy_client_zitadel_keys(db: AsyncSession, user: CurrentUser) -> list[str]:
    """
    Sve vrednosti `client_zitadel_id` / `recipient_sub` koje tretiramo kao istog korisnika:
    JWT `sub`, email iz tokena, i numerički id dev naloga (stari tokeni i stare porudžbine posle seed-a).
    """
    keys: list[str] = []
    if user.sub:
        keys.append(user.sub)
    if user.email and user.email not in keys:
        keys.append(user.email)
    if user.email:
        r = await db.execute(select(DevUser.id).where(DevUser.email == user.email))
        row = r.scalar_one_or_none()
        if row is not None:
            sid = str(int(row))
            if sid not in keys:
                keys.append(sid)
    return list(dict.fromkeys(keys))
