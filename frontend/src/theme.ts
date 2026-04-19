/**
 * @deprecated Koristiti `lib/themeToggle` — ovo ostaje radi kompatibilnosti importa.
 */
import { applyThemeToDocument, getTheme, initUserThemeFromStorage, setTheme, type AppTheme } from "./lib/themeToggle";

export const THEME_KEY = "trainify_theme";

export function initThemeFromStorage() {
  initUserThemeFromStorage();
}

export function readThemeIsLight(): boolean {
  return getTheme() === "light";
}

export function setThemeIsLight(light: boolean) {
  setTheme(light ? "light" : "dark");
}

export function applyLight(light: boolean) {
  applyThemeToDocument(light ? "light" : "dark");
}

export type { AppTheme };
