"""Jedan bot token po firmi (TenantProfile) ili globalni iz settings."""

from __future__ import annotations

import httpx

from app.config import settings
from app.models.tenant_profile import TenantProfile


def resolve_telegram_bot_token(profile: TenantProfile | None) -> str:
    if profile is not None and (profile.telegram_bot_token or "").strip():
        return profile.telegram_bot_token.strip()
    return (settings.TELEGRAM_BOT_TOKEN or "").strip()


async def send_telegram_message(text: str, chat_id: str, *, token: str) -> None:
    if not token or not (chat_id or "").strip():
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(url, json={"chat_id": chat_id.strip(), "text": text[:4000]})
        r.raise_for_status()
