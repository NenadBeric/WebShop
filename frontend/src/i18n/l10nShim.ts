/**
 * Lokalni modul iste uloge kao @lokalizacija/client (bez privatnog npm paketa).
 */
import { fetchL10nBundle, resolveL10nBaseUrl } from "../l10n/remote";

export type LoadTranslationsOpts = {
  baseUrl: string;
  appCode: string;
  lang: string;
  fallbackLang: string;
  appKey: string;
  fallback: Record<string, Record<string, string>>;
};

let bundle: Record<string, string> = {};

function mergeFallbacks(
  fallback: Record<string, Record<string, string>>,
  lang: string,
  fallbackLang: string,
): Record<string, string> {
  const fb = fallback[fallbackLang] ?? {};
  const loc = fallback[lang] ?? {};
  return { ...fb, ...loc };
}

export async function loadTranslations(opts: LoadTranslationsOpts): Promise<void> {
  const { lang, fallbackLang, fallback, appCode, appKey } = opts;
  const localOnly = mergeFallbacks(fallback, lang, fallbackLang);

  const configured = opts.baseUrl?.trim();
  const base = configured ? configured.replace(/\/$/, "") : resolveL10nBaseUrl();
  const key = appKey?.trim();

  if (!base || !key) {
    bundle = localOnly;
    return;
  }

  try {
    const remote = await fetchL10nBundle({
      baseUrl: base,
      appCode,
      appKey: key,
      lang,
      fallbackLang,
    });
    bundle = { ...localOnly, ...remote };
  } catch {
    bundle = localOnly;
  }
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = bundle[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}
