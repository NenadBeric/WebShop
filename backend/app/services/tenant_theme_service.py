"""Tema / brend po tenant_id (Trainify-paritet: preset, boja, font, radius, logo)."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.i18n import tr
from app.models.tenant_profile import TenantProfile
from app.rbac import CurrentUser
from app.schemas.tenant_theme import THEME_PRESET_VALUES, TenantThemeOut, TenantThemePatchDto

_PRESET_BG_HEX = {
    "TRAINIFY": "#020617",
    "DARK_A": "#020617",
    "DARK_B": "#0b1120",
    "LIGHT_A": "#f1f5f9",
}

_MAX_LOGO_BYTES = 800 * 1024
_LOGO_MIME = frozenset({"image/png", "image/jpeg", "image/webp", "image/svg+xml"})

_SAFE_TENANT_RE = re.compile(r"^[a-zA-Z0-9._-]{1,64}$")


def _safe_tenant_dir(tenant_id: str) -> str:
    if _SAFE_TENANT_RE.match(tenant_id or ""):
        return tenant_id
    return "tenant_misc"


def _hex_to_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def _relative_luminance(r: float, g: float, b: float) -> float:
    def f(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast_ratio(hex_a: str, hex_b: str) -> float:
    r1, g1, b1 = _hex_to_rgb(hex_a)
    r2, g2, b2 = _hex_to_rgb(hex_b)
    l1 = _relative_luminance(r1, g1, b1)
    l2 = _relative_luminance(r2, g2, b2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def validate_primary_for_preset(preset: str, primary_hex: str) -> None:
    bg = _PRESET_BG_HEX.get(preset) or _PRESET_BG_HEX["DARK_A"]
    ratio = contrast_ratio(primary_hex, bg)
    if ratio < 2.8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=tr("theme_low_contrast"))


def profile_to_theme_out(p: TenantProfile) -> TenantThemeOut:
    has_logo = bool((p.theme_logo_path or "").strip())
    tid = p.tenant_id
    return TenantThemeOut(
        tenantId=tid,
        themePreset=p.theme_preset,
        primaryColorHex=p.primary_color_hex,
        hasLogo=has_logo,
        logoPath="/api/v1/tenant/theme/logo" if has_logo else None,
        themeUpdatedAt=p.theme_updated_at.isoformat() if p.theme_updated_at else None,
        borderRadiusPx=p.theme_border_radius_px,
        themeFont=p.theme_font,
        buttonHoverHex=p.theme_button_hover_hex,
    )


def public_logo_path(tenant_id: str) -> str:
    return f"/api/v1/public/tenants/{tenant_id}/theme/logo"


def profile_to_public_theme_out(p: TenantProfile) -> TenantThemeOut:
    has_logo = bool((p.theme_logo_path or "").strip())
    tid = p.tenant_id
    return TenantThemeOut(
        tenantId=tid,
        themePreset=p.theme_preset,
        primaryColorHex=p.primary_color_hex,
        hasLogo=has_logo,
        logoPath=public_logo_path(tid) if has_logo else None,
        themeUpdatedAt=p.theme_updated_at.isoformat() if p.theme_updated_at else None,
        borderRadiusPx=p.theme_border_radius_px,
        themeFont=p.theme_font,
        buttonHoverHex=p.theme_button_hover_hex,
    )


async def get_theme_out(db: AsyncSession, tenant_id: str) -> TenantThemeOut | None:
    p = await db.get(TenantProfile, tenant_id)
    if not p:
        return None
    return profile_to_theme_out(p)


async def assert_can_edit_theme(user: CurrentUser, tenant_id: str) -> None:
    if not user.can_manage_catalog():
        raise HTTPException(status_code=403, detail=tr("forbidden"))
    if (user.tenant_id or "").strip() != (tenant_id or "").strip():
        raise HTTPException(status_code=403, detail=tr("forbidden"))


async def _remove_logo_file(p: TenantProfile) -> None:
    rel = (p.theme_logo_path or "").strip().replace("\\", "/").lstrip("/")
    if not rel:
        return
    base = Path(settings.UPLOAD_DIR).resolve()
    path = (base / rel).resolve()
    try:
        path.relative_to(base)
    except ValueError:
        p.theme_logo_path = None
        return
    path.unlink(missing_ok=True)
    p.theme_logo_path = None


async def patch_tenant_theme(db: AsyncSession, tenant_id: str, body: TenantThemePatchDto, user: CurrentUser) -> TenantThemeOut:
    await assert_can_edit_theme(user, tenant_id)
    p = await db.get(TenantProfile, tenant_id)
    if not p:
        raise HTTPException(status_code=404, detail=tr("not_found"))

    if body.resetToTrainifyDefaults:
        p.theme_preset = None
        p.primary_color_hex = None
        p.theme_border_radius_px = None
        p.theme_font = None
        p.theme_button_hover_hex = None
        await _remove_logo_file(p)
        p.theme_updated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(p)
        return profile_to_theme_out(p)

    fs = body.model_fields_set
    if "themePreset" in fs and body.themePreset is not None:
        if body.themePreset not in THEME_PRESET_VALUES:
            raise HTTPException(status_code=400, detail=tr("theme_unknown_preset"))
        if body.themePreset == "TRAINIFY":
            p.theme_preset = None
            p.primary_color_hex = None
        else:
            p.theme_preset = body.themePreset
    if "primaryColorHex" in fs:
        p.primary_color_hex = body.primaryColorHex

    preset = p.theme_preset or "TRAINIFY"
    if preset == "TRAINIFY":
        p.primary_color_hex = None
    elif p.primary_color_hex:
        validate_primary_for_preset(preset, p.primary_color_hex)

    if "borderRadiusPx" in fs:
        p.theme_border_radius_px = body.borderRadiusPx
    if "themeFont" in fs:
        p.theme_font = body.themeFont
    if "buttonHoverHex" in fs:
        p.theme_button_hover_hex = body.buttonHoverHex

    p.theme_updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(p)
    return profile_to_theme_out(p)


async def upload_tenant_logo(db: AsyncSession, tenant_id: str, file: UploadFile, user: CurrentUser) -> TenantThemeOut:
    await assert_can_edit_theme(user, tenant_id)
    p = await db.get(TenantProfile, tenant_id)
    if not p:
        raise HTTPException(status_code=404, detail=tr("not_found"))

    content = await file.read()
    if len(content) > _MAX_LOGO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=tr("theme_logo_too_large"))

    mime = (file.content_type or "").split(";")[0].strip().lower()
    if mime not in _LOGO_MIME:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=tr("theme_logo_bad_type"))

    root = Path(settings.UPLOAD_DIR) / "tenant_themes" / _safe_tenant_dir(tenant_id)
    root.mkdir(parents=True, exist_ok=True)
    fid = uuid.uuid4().hex[:16]
    ext = Path(file.filename or "f").suffix.lower()[:12] or ".bin"
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".svg"):
        ext = ".png"
    fname = f"logo_{fid}{ext}"
    path = root / fname
    path.write_bytes(content)

    await _remove_logo_file(p)

    rel = str(path.relative_to(Path(settings.UPLOAD_DIR).resolve()))
    p.theme_logo_path = rel.replace("\\", "/")
    p.theme_updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(p)
    return profile_to_theme_out(p)


async def get_logo_file_response(db: AsyncSession, tenant_id: str):
    from fastapi.responses import FileResponse

    p = await db.get(TenantProfile, tenant_id)
    if not p or not (p.theme_logo_path or "").strip():
        raise HTTPException(status_code=404, detail=tr("not_found"))
    base = Path(settings.UPLOAD_DIR).resolve()
    raw = (p.theme_logo_path or "").strip().replace("\\", "/").lstrip("/")
    path = (base / raw).resolve()
    try:
        path.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=404, detail=tr("not_found")) from None
    if not path.is_file():
        raise HTTPException(status_code=404, detail=tr("not_found"))
    mime = "image/png"
    if path.suffix.lower() in (".jpg", ".jpeg"):
        mime = "image/jpeg"
    elif path.suffix.lower() == ".webp":
        mime = "image/webp"
    elif path.suffix.lower() == ".svg":
        mime = "image/svg+xml"
    return FileResponse(path, media_type=mime)
