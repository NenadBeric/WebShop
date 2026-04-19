import type { TenantThemeDto } from "./applyTenantTheme";

/** localStorage — isti oblik kao Trainify CachedGymBranding, sa tenantId umesto gymId */
const STORAGE_KEY = ["webshop", "tenant", "branding", "v1"].join("_");

export type CachedTenantBranding = {
  tenantId: string;
  themePreset: string | null;
  primaryColorHex: string | null;
  hasLogo: boolean;
  themeUpdatedAt: string | null;
  borderRadiusPx?: number | null;
  themeFont?: string | null;
  buttonHoverHex?: string | null;
};

export function clearCachedTenantBranding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readCachedTenantBranding(): CachedTenantBranding | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as CachedTenantBranding;
    if (!o || typeof o.tenantId !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

export function writeCachedTenantBranding(theme: TenantThemeDto): void {
  const tid = (theme.tenantId || "").trim();
  if (!tid) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const c: CachedTenantBranding = {
    tenantId: tid,
    themePreset: theme.themePreset ?? null,
    primaryColorHex: theme.primaryColorHex ?? null,
    hasLogo: theme.hasLogo,
    themeUpdatedAt: theme.themeUpdatedAt ?? null,
    borderRadiusPx: theme.borderRadiusPx ?? null,
    themeFont: theme.themeFont ?? null,
    buttonHoverHex: theme.buttonHoverHex ?? null,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* quota */
  }
}

export function cachedToTenantThemeDto(c: CachedTenantBranding): TenantThemeDto {
  return {
    tenantId: c.tenantId,
    themePreset: c.themePreset,
    primaryColorHex: c.primaryColorHex,
    hasLogo: c.hasLogo,
    logoPath: null,
    themeUpdatedAt: c.themeUpdatedAt,
    borderRadiusPx: c.borderRadiusPx ?? null,
    themeFont: c.themeFont ?? null,
    buttonHoverHex: c.buttonHoverHex ?? null,
  };
}
