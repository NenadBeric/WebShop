/** Korisnički light/dark — isti ključ kao Trainify (`trainify_theme`) radi uklapanja između aplikacija. */

export type AppTheme = "dark" | "light";

const STORAGE_KEY = "trainify_theme";
const LEGACY_WEBSHOP_KEY = "webshop_theme";

export function getTheme(): AppTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
    const legacy = localStorage.getItem(LEGACY_WEBSHOP_KEY);
    if (legacy === "light") {
      localStorage.setItem(STORAGE_KEY, "light");
      return "light";
    }
    if (legacy === "dark") {
      localStorage.setItem(STORAGE_KEY, "dark");
      return "dark";
    }
  } catch {
    /* ignore */
  }
  return "dark";
}

export function setTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
    localStorage.setItem(LEGACY_WEBSHOP_KEY, theme);
  } catch {
    /* ignore */
  }
  applyThemeToDocument(theme);
}

export function toggleTheme(): AppTheme {
  const next = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

export function applyThemeToDocument(theme: AppTheme): void {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.style.setProperty("color-scheme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.removeProperty("color-scheme");
  }
}

/** Jednokratna sinhronizacija pri staru (posle eventualnog embed URL-a). */
export function initUserThemeFromStorage(): void {
  applyThemeToDocument(getTheme());
}
