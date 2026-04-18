/**
 * Opciono učitavanje prevoda sa Lokalizacija servisa (GET /public/translations).
 * Isti obrazac kao Trainify `src/l10n/remote.ts`.
 */

export type L10nRemoteConfig = {
  baseUrl: string;
  appCode: string;
  appKey: string;
  lang: string;
  fallbackLang?: string;
  signal?: AbortSignal;
};

export async function fetchL10nBundle(cfg: L10nRemoteConfig): Promise<Record<string, string>> {
  const qs = new URLSearchParams({
    appCode: cfg.appCode,
    lang: cfg.lang,
  });
  const groups = (import.meta as ImportMeta & { env: { VITE_L10N_GROUPS?: string } }).env.VITE_L10N_GROUPS?.trim();
  if (groups) qs.set("groups", groups);
  if (cfg.fallbackLang) qs.set("fallbackLang", cfg.fallbackLang);
  const headers: Record<string, string> = { "X-App-Key": cfg.appKey };
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/public/translations?${qs.toString()}`;
  const tr = await fetch(url, {
    headers,
    signal: cfg.signal,
    cache: "no-store",
  });
  if (!tr.ok) {
    throw new Error(`Lokalizacija translations failed: ${tr.status}`);
  }
  const body = (await tr.json()) as { data?: Record<string, string> };
  return body.data ?? {};
}

export function resolveL10nBaseUrl(): string {
  const fromEnv = (import.meta as ImportMeta & { env: { VITE_L10N_BASE_URL?: string } }).env.VITE_L10N_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return `${window.location.origin}/l10n`;
  }
  return "";
}
