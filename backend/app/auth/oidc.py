"""JWT: JWKS (Zitadel) kada je OIDC_ISSUER podešen, inače HS256 legacy (Trainify obrazac)."""

from __future__ import annotations

import threading
import time
from typing import Any

import httpx
from jose import JWTError, jwk, jwt

_jwks_cache: dict[str, Any] = {}
_jwks_lock = threading.Lock()
_CACHE_TTL = 3600

_ZITADEL_ROLES_CLAIM = "urn:zitadel:iam:org:project:roles"
_ZITADEL_ORG_ID_CLAIM = "urn:zitadel:iam:org:id"

_WEBSHOP_ROLE_PRIORITY = (
    "WEBSHOP_OWNER",
    "WEBSHOP_MANAGER",
    "WEBSHOP_RECEPTION",
    "WEBSHOP_CUSTOMER",
)


def _fetch_jwks(jwks_url: str, host_override: str = "") -> list[dict]:
    with _jwks_lock:
        cached = _jwks_cache.get(jwks_url)
        if cached and time.time() - cached["ts"] < _CACHE_TTL:
            return cached["keys"]

        headers = {"Host": host_override} if host_override else {}
        resp = httpx.get(jwks_url, timeout=10, headers=headers)
        resp.raise_for_status()
        keys = resp.json().get("keys", [])
        _jwks_cache[jwks_url] = {"keys": keys, "ts": time.time()}
        return keys


def _find_key(keys: list[dict], kid: str) -> Any:
    for k in keys:
        if k.get("kid") == kid:
            return jwk.construct(k)
    raise JWTError(f"No JWKS key matching kid={kid}")


def normalize_claims(payload: dict) -> dict:
    """Zitadel ugnježđene uloge → polje ``role`` (ADMIN ili prva WEBSHOP_* po prioritetu)."""
    roles_map = payload.get(_ZITADEL_ROLES_CLAIM)
    if not isinstance(roles_map, dict):
        if "role" in payload:
            return payload
        return payload

    out = dict(payload)
    if "ADMIN" in roles_map:
        out["role"] = "ADMIN"
    else:
        role = ""
        for r in _WEBSHOP_ROLE_PRIORITY:
            if r in roles_map:
                role = r
                break
        out["role"] = role

    org = payload.get(_ZITADEL_ORG_ID_CLAIM, "")
    out["tenant_id"] = str(org) if org is not None else ""

    if "name" not in out:
        given = payload.get("given_name", "")
        family = payload.get("family_name", "")
        out["name"] = f"{given} {family}".strip()

    return out


def decode_token(
    token: str,
    *,
    oidc_issuer: str = "",
    oidc_issuer_external: str = "",
    legacy_secret: str = "",
    legacy_algorithm: str = "HS256",
    oidc_audience: str = "",
) -> dict:
    if oidc_issuer:
        try:
            jwks_url = f"{oidc_issuer.rstrip('/')}/oauth/v2/keys"
            host_override = ""
            if oidc_issuer_external and oidc_issuer != oidc_issuer_external:
                from urllib.parse import urlparse

                host_override = urlparse(oidc_issuer_external).netloc
            keys = _fetch_jwks(jwks_url, host_override=host_override)
            header = jwt.get_unverified_header(token)
            kid = header.get("kid", "")
            public_key = _find_key(keys, kid)
            issuer = oidc_issuer_external or oidc_issuer
            auds = [a.strip() for a in (oidc_audience or "").split(",") if a.strip()]
            verify_aud = bool(auds)
            decode_kw: dict = {
                "algorithms": ["RS256"],
                "options": {"verify_aud": verify_aud},
                "issuer": issuer,
            }
            if verify_aud:
                decode_kw["audience"] = auds[0] if len(auds) == 1 else auds
            payload = jwt.decode(token, public_key, **decode_kw)
            return normalize_claims(payload)
        except JWTError:
            if not legacy_secret:
                raise

    if legacy_secret:
        return jwt.decode(token, legacy_secret, algorithms=[legacy_algorithm])

    raise JWTError("No OIDC issuer or legacy secret configured")


def clear_jwks_cache() -> None:
    with _jwks_lock:
        _jwks_cache.clear()
