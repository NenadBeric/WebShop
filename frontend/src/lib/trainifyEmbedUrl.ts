/**
 * Zajednička pravila za Trainify iframe / deep link query (?trainifyEmbed=1, …).
 */

/** 1 | true | yes (case-insensitive). */
export function isQueryTruthy(v: string | null): boolean {
  const x = (v || "").trim().toLowerCase();
  return x === "1" || x === "true" || x === "yes";
}

/**
 * Samo glavni sadržaj (bez shop sidebar-a i top bar-a), kao ?embed=true.
 * - Uvek: ?embed=1|true|yes
 * - Trainify: ?trainifyEmbed=1 i layout "body" (podrazumevano ako layout nedostaje) ili eksplicitno minimal/1.
 * - Pun shell: ?trainifyEmbed=1&trainifyEmbedLayout=full|shell|default
 */
export function isChromelessAppShellSearch(search: string): boolean {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (isQueryTruthy(q.get("embed"))) return true;
  if (!isQueryTruthy(q.get("trainifyEmbed"))) return false;
  const layout = (q.get("trainifyEmbedLayout") || "body").trim().toLowerCase();
  if (layout === "full" || layout === "shell" || layout === "default") return false;
  return layout === "body" || layout === "minimal" || layout === "1" || layout === "";
}

const EMBED_PERSIST_KEY = "webshop_embed_persist_qs";

const PERSIST_KEYS = [
  "embed",
  "trainifyEmbed",
  "trainifyEmbedLayout",
  "tenantTheme",
  "embedTheme",
  "tenantId",
  "tenant",
  "lang",
  "locale",
  "trainifyLocale",
  "appTheme",
  "trainify_theme",
  "trainifyTheme",
  "themePreset",
  "trainifyGymThemePreset",
  "primaryColorHex",
  "trainifyPrimary",
  "themeFont",
  "borderRadiusPx",
  "buttonHoverHex",
] as const;

/** Zapamti embed query parametre za SPA navigaciju (sessionStorage). */
export function persistEmbedQueryFromSearch(search: string): void {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out = new URLSearchParams();
  for (const k of PERSIST_KEYS) {
    const v = q.get(k);
    if (v != null && v !== "") out.set(k, v);
  }
  // Čuvaj samo ako je embed/trenifyEmbed prisutan.
  if (!isQueryTruthy(out.get("embed")) && !isQueryTruthy(out.get("trainifyEmbed"))) return;
  try {
    sessionStorage.setItem(EMBED_PERSIST_KEY, out.toString());
  } catch {
    /* ignore */
  }
}

export function readPersistedEmbedQuery(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(EMBED_PERSIST_KEY) || "";
    if (!raw) return null;
    return new URLSearchParams(raw);
  } catch {
    return null;
  }
}

/** Spoji postojeći search sa zapamćenim embed parametrima (bez prepisivanja postojećih). */
export function mergeSearchWithPersistedEmbed(search: string): string {
  const base = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const persisted = readPersistedEmbedQuery();
  if (!persisted) return search;
  for (const [k, v] of persisted.entries()) {
    if (!base.has(k)) base.set(k, v);
  }
  const qs = base.toString();
  return qs ? `?${qs}` : "";
}

/** #RRGGBB ili RRGGBB iz ?trainifyPrimary= */
export function normalizeTrainifyPrimaryHex(raw: string | null): string | null {
  let s = (raw || "").trim();
  if (!s) return null;
  try {
    s = decodeURIComponent(s);
  } catch {
    /* raw hex */
  }
  s = s.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s;
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s}`;
  return null;
}
