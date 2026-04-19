"""Tema firme (tenant) — JSON kao Trainify GymTheme (camelCase polja)."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

THEME_PRESET_VALUES = ("TRAINIFY", "DARK_A", "DARK_B", "LIGHT_A")
ThemePreset = Literal["TRAINIFY", "DARK_A", "DARK_B", "LIGHT_A"]

THEME_FONT_CODES = (
    "INTER",
    "DM_SANS",
    "OPEN_SANS",
    "LATO",
    "MONTSERRAT",
    "ROBOTO",
    "SOURCE_SANS_3",
    "WORK_SANS",
    "NUNITO_SANS",
    "PLUS_JAKARTA_SANS",
)

_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


class TenantThemeOut(BaseModel):
    tenantId: str
    themePreset: str | None = None
    primaryColorHex: str | None = None
    hasLogo: bool = False
    logoPath: str | None = None
    themeUpdatedAt: str | None = None
    borderRadiusPx: int | None = None
    themeFont: str | None = None
    buttonHoverHex: str | None = None


class TenantThemePatchDto(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True, str_strip_whitespace=True)

    themePreset: ThemePreset | None = None
    primaryColorHex: str | None = None
    resetToTrainifyDefaults: bool = False
    borderRadiusPx: int | None = Field(default=None, ge=0, le=16)
    themeFont: str | None = None
    buttonHoverHex: str | None = None

    @field_validator("primaryColorHex", mode="before")
    @classmethod
    def _hex_primary(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        if not _HEX_RE.match(v):
            raise ValueError("primaryColorHex must be #RRGGBB")
        return v.upper()

    @field_validator("buttonHoverHex", mode="before")
    @classmethod
    def _hex_hover(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        if not _HEX_RE.match(v):
            raise ValueError("buttonHoverHex must be #RRGGBB")
        return v.upper()

    @field_validator("themeFont", mode="before")
    @classmethod
    def _font_code(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        u = str(v).strip().upper()
        if u not in THEME_FONT_CODES:
            raise ValueError("unknown themeFont")
        return u
