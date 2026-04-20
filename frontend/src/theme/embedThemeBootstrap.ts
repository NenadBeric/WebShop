/**
 * Učitavanje teme iz URL-a ili postMessage (embed iz Trainify / druge aplikacije).
 *
 * URL (opciono): ?tenantTheme=1&tenantId=demo-gym&appTheme=light&themePreset=LIGHT_A&primaryColorHex=%233b82f6&themeFont=INTER&borderRadiusPx=12&buttonHoverHex=%232563eb
 *
 * postMessage payload (isti prozor ili iframe roditelj):
 *   { type: "webshop-theme-handoff", version: 1, appTheme?: "light"|"dark", theme: TenantThemeDto }
 * ili Trainify-compat:
 *   { type: "trainify-webshop-theme", theme: { tenantId, themePreset, ... }, appTheme?: "light"|"dark" }
 */

import { isQueryTruthy, normalizeTrainifyPrimaryHex } from "../lib/trainifyEmbedUrl";
import { applyThemeToDocument, type AppTheme } from "../lib/themeToggle";
import { applyTenantThemeToDocument, type TenantThemeDto } from "./applyTenantTheme";
import { cachedToTenantThemeDto, readCachedTenantBranding, writeCachedTenantBranding } from "./tenantBrandingCache";

function parseAppTheme(v: string | null): AppTheme | null {
  const x = (v || "").trim().toLowerCase();
  if (x === "light" || x === "dark") return x;
  return null;
}

function coerceInt(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Čita query string i primenjuje korisničku + tenant temu ako je tenantTheme=1 ili tenantId zadan sa bar jednim brend parametrom. */
export function applyTenantThemeFromCurrentUrl(): void {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  const trainifyEmbed = isQueryTruthy(q.get("trainifyEmbed"));
  const flag = q.get("tenantTheme") === "1" || q.get("embedTheme") === "1" || trainifyEmbed;
  const tenantId = (q.get("tenantId") || q.get("tenant") || "").trim();
  const appTheme = parseAppTheme(q.get("appTheme") || q.get("trainify_theme") || q.get("trainifyTheme"));

  if (appTheme) {
    applyThemeToDocument(appTheme);
    try {
      localStorage.setItem("trainify_theme", appTheme);
      localStorage.setItem("webshop_theme", appTheme);
    } catch {
      /* ignore */
    }
  }

  const themePreset = (q.get("themePreset") || q.get("trainifyGymThemePreset") || "").trim() || null;
  const primaryColorHex =
    (q.get("primaryColorHex") || "").trim() || normalizeTrainifyPrimaryHex(q.get("trainifyPrimary")) || null;
  const themeFont = (q.get("themeFont") || "").trim() || null;
  const borderRadiusPx = coerceInt(q.get("borderRadiusPx"));
  const buttonHoverHex = (q.get("buttonHoverHex") || "").trim() || null;

  const hasBrand = !!(themePreset || primaryColorHex || themeFont || borderRadiusPx != null || buttonHoverHex);
  if (!tenantId || (!flag && !hasBrand)) return;

  const dto: TenantThemeDto = {
    tenantId,
    themePreset,
    primaryColorHex,
    hasLogo: false,
    logoPath: null,
    borderRadiusPx,
    themeFont,
    buttonHoverHex,
  };
  applyTenantThemeToDocument(dto, null);
  writeCachedTenantBranding(dto);
}

const HANDOFF_TYPES = new Set(["webshop-theme-handoff", "trainify-webshop-theme"]);

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function normalizeHandoffPayload(data: unknown): { appTheme?: AppTheme; theme: TenantThemeDto } | null {
  if (!isRecord(data)) return null;
  const t = typeof data.type === "string" ? data.type : "";
  if (!HANDOFF_TYPES.has(t)) return null;
  const appTheme = parseAppTheme(typeof data.appTheme === "string" ? data.appTheme : null);
  const raw = data.theme;
  if (!isRecord(raw)) return null;
  const tenantId = typeof raw.tenantId === "string" ? raw.tenantId : "";
  if (!tenantId.trim()) return null;
  const presetRaw = raw.themePreset;
  const themePreset =
    typeof presetRaw === "string"
      ? presetRaw.trim() || null
      : presetRaw != null
        ? String(presetRaw).trim() || null
        : null;
  const brRaw = raw.borderRadiusPx;
  const borderRadiusPx =
    typeof brRaw === "number" && Number.isFinite(brRaw)
      ? brRaw
      : typeof brRaw === "string"
        ? coerceInt(brRaw)
        : null;

  const theme: TenantThemeDto = {
    tenantId: tenantId.trim(),
    themePreset,
    primaryColorHex: typeof raw.primaryColorHex === "string" ? raw.primaryColorHex : null,
    hasLogo: Boolean(raw.hasLogo),
    logoPath: typeof raw.logoPath === "string" ? raw.logoPath : null,
    themeUpdatedAt: typeof raw.themeUpdatedAt === "string" ? raw.themeUpdatedAt : null,
    borderRadiusPx,
    themeFont: typeof raw.themeFont === "string" ? raw.themeFont : null,
    buttonHoverHex: typeof raw.buttonHoverHex === "string" ? raw.buttonHoverHex : null,
  };
  return { appTheme: appTheme ?? undefined, theme };
}

export function installCrossAppThemeListener(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("message", (ev: MessageEvent) => {
    const parsed = normalizeHandoffPayload(ev.data);
    if (!parsed) return;
    if (parsed.appTheme) {
      applyThemeToDocument(parsed.appTheme);
      try {
        localStorage.setItem("trainify_theme", parsed.appTheme);
        localStorage.setItem("webshop_theme", parsed.appTheme);
      } catch {
        /* ignore */
      }
    }
    applyTenantThemeToDocument(parsed.theme, null);
    writeCachedTenantBranding(parsed.theme);
  });
}

export function applyCachedTenantBrandingIfAny(): void {
  const c = readCachedTenantBranding();
  if (!c) return;
  applyTenantThemeToDocument(cachedToTenantThemeDto(c), null);
}
