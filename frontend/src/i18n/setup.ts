import { loadTranslations } from "./l10nShim";
import sr from "./sr.json";
import en from "./en.json";
import ru from "./ru.json";
import zh from "./zh.json";

export const LANG_KEY = "webshop_lang";

const APP_FALLBACK: Record<string, Record<string, string>> = {
  sr: sr as Record<string, string>,
  en: en as Record<string, string>,
  ru: ru as Record<string, string>,
  zh: zh as Record<string, string>,
};

export async function initI18n(lang: string = "sr"): Promise<void> {
  const baseUrl = (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_L10N_BASE_URL || "";
  const appKey = (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_L10N_APP_KEY || "";
  await loadTranslations({
    baseUrl,
    appCode: "webshop",
    lang,
    fallbackLang: "sr",
    appKey,
    fallback: APP_FALLBACK,
  });
}

export async function changeLanguage(lang: string): Promise<void> {
  await initI18n(lang);
  localStorage.setItem(LANG_KEY, lang);
}

export function getSavedLanguage(): string {
  try {
    return localStorage.getItem(LANG_KEY) || "sr";
  } catch {
    return "sr";
  }
}

export function setSavedLanguage(lang: string) {
  localStorage.setItem(LANG_KEY, lang);
}
