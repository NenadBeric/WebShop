/**
 * Primena brenda tenanta na document — isti atributi kao Trainify (`data-gym-theme-preset`, …)
 * da CSS ostane deljen/prepisiv iz Trainify index.css.
 */

import {
  autoButtonHoverFromPrimary,
  ensureTenantThemeFontLink,
  removeTenantThemeFontLink,
  tenantThemeFontStack,
  tenantThemeGoogleFontsHref,
} from "./tenantThemeFontOptions";

export type TenantThemeDto = {
  tenantId: string | null;
  /** Trainify polje — ignoriše se za CSS, ali omogućava prosleđivanje istog JSON-a */
  gymId?: number | null;
  themePreset: string | null;
  primaryColorHex: string | null;
  hasLogo: boolean;
  logoPath: string | null;
  themeUpdatedAt?: string | null;
  borderRadiusPx?: number | null;
  themeFont?: string | null;
  buttonHoverHex?: string | null;
};

const RADIUS_VARS = ["--radius", "--radius-sm", "--radius-md", "--radius-xs"] as const;

function effectiveTenantId(t: TenantThemeDto | null): string | null {
  if (!t) return null;
  const s = (t.tenantId || "").trim();
  if (s) return s;
  return null;
}

export function clearTenantThemeFromDocument(): void {
  const root = document.documentElement;
  root.removeAttribute("data-gym-theme-preset");
  root.removeAttribute("data-gym-custom-primary");
  root.style.removeProperty("--primary");
  root.style.removeProperty("--primary-hover");
  root.style.removeProperty("--accent");
  root.style.removeProperty("--font");
  for (const k of RADIUS_VARS) {
    root.style.removeProperty(k);
  }
  removeTenantThemeFontLink();
}

export function applyTenantThemeToDocument(theme: TenantThemeDto | null, _logoObjectUrl: string | null): void {
  if (!effectiveTenantId(theme)) {
    clearTenantThemeFromDocument();
    return;
  }

  const root = document.documentElement;
  const rawPreset = theme!.themePreset;
  const preset = rawPreset && rawPreset !== "TRAINIFY" ? rawPreset : null;

  if (preset === "DARK_B" || preset === "LIGHT_A") {
    root.setAttribute("data-gym-theme-preset", preset);
  } else {
    root.removeAttribute("data-gym-theme-preset");
  }

  const customPrimary = theme!.primaryColorHex && preset ? theme!.primaryColorHex : null;

  if (customPrimary) {
    root.setAttribute("data-gym-custom-primary", "1");
    root.style.setProperty("--primary", customPrimary);
    root.style.setProperty("--accent", customPrimary);
    const hover =
      theme!.buttonHoverHex && /^#[0-9A-Fa-f]{6}$/.test(theme!.buttonHoverHex)
        ? theme!.buttonHoverHex
        : autoButtonHoverFromPrimary(customPrimary);
    root.style.setProperty("--primary-hover", hover);
  } else {
    root.removeAttribute("data-gym-custom-primary");
    root.style.removeProperty("--primary");
    root.style.removeProperty("--accent");
    root.style.removeProperty("--primary-hover");
  }

  const br = theme!.borderRadiusPx;
  if (typeof br === "number" && br >= 0 && br <= 16) {
    const px = `${br}px`;
    for (const k of RADIUS_VARS) {
      root.style.setProperty(k, px);
    }
  } else {
    for (const k of RADIUS_VARS) {
      root.style.removeProperty(k);
    }
  }

  const stack = tenantThemeFontStack(theme!.themeFont ?? null);
  const href = tenantThemeGoogleFontsHref(theme!.themeFont ?? null);
  ensureTenantThemeFontLink(href);
  if (stack) {
    root.style.setProperty("--font", stack);
  } else {
    root.style.removeProperty("--font");
  }
}
