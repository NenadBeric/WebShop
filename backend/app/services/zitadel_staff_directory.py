"""Provera postojanja korisnika po mejlu u Zitadel-u (Management API)."""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _management_base_url() -> str:
    iss = (settings.OIDC_ISSUER or "").strip().rstrip("/")
    if not iss:
        return ""
    for suf in ("/oauth/v2", "/oauth/v2/"):
        if iss.endswith(suf):
            return iss[: -len(suf)].rstrip("/")
    return iss


def _org_id_for_request(tenant_id: str) -> str:
    oid = (settings.ZITADEL_MANAGEMENT_ORG_ID or "").strip()
    return oid or tenant_id


async def zitadel_email_in_use(*, email: str, tenant_id: str) -> bool:
    """True ako instanca vraća barem jednog korisnika sa tim mejlom."""
    pat = (settings.ZITADEL_MANAGEMENT_PAT or "").strip()
    base = _management_base_url()
    if not pat or not base:
        raise RuntimeError("zitadel_management_not_configured")
    org = _org_id_for_request(tenant_id)
    headers = {
        "Authorization": f"Bearer {pat}",
        "Content-Type": "application/json",
    }
    if org:
        headers["x-zitadel-orgid"] = org
    em = email.strip().lower()
    body = {
        "queries": [
            {
                "email_query": {
                    "email_address": em,
                    "method": "TEXT_QUERY_METHOD_EQUALS",
                }
            }
        ]
    }
    urls = (
        f"{base}/management/v1/users/human/_search",
        f"{base}/management/v1/users/_search",
    )
    async with httpx.AsyncClient(timeout=20.0) as client:
        last_status: int | None = None
        for url in urls:
            try:
                r = await client.post(url, json=body, headers=headers)
                last_status = r.status_code
                if r.status_code in (404, 405):
                    continue
                r.raise_for_status()
                data = r.json()
                details = data.get("details") or data.get("result") or []
                if isinstance(details, list) and len(details) > 0:
                    return True
                return False
            except httpx.HTTPStatusError as e:
                last_status = e.response.status_code
                logger.warning("Zitadel user search HTTP %s %s", url, e.response.status_code)
                continue
            except httpx.RequestError as e:
                logger.warning("Zitadel user search request error %s: %s", url, e)
                continue
        if last_status:
            raise RuntimeError(f"zitadel_http_{last_status}")
        raise RuntimeError("zitadel_unreachable")
