export const THEME_KEY = "webshop_theme";

export function initThemeFromStorage() {
  if (localStorage.getItem(THEME_KEY) === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  }
}

export function readThemeIsLight(): boolean {
  return document.documentElement.getAttribute("data-theme") === "light";
}

export function setThemeIsLight(light: boolean) {
  const root = document.documentElement;
  if (light) {
    root.setAttribute("data-theme", "light");
    localStorage.setItem(THEME_KEY, "light");
  } else {
    root.removeAttribute("data-theme");
    localStorage.setItem(THEME_KEY, "dark");
  }
}
