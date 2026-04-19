import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { CartProvider } from "./cart/CartContext";
import { NotificationProvider } from "./notifications/NotificationContext";
import { I18nProvider } from "./i18n/I18nContext";
import { LANG_KEY } from "./i18n/setup";
import { initThemeFromStorage } from "./theme";
import {
  applyCachedTenantBrandingIfAny,
  applyTenantThemeFromCurrentUrl,
  installCrossAppThemeListener,
} from "./theme/embedThemeBootstrap";
import { App } from "./App";
import "./index.css";

/** Trainify / embed: ?lang=en ili ?locale=sr upisuje jezik pre I18nProvider-a (isti ključ kao ostatak aplikacije). */
function bootstrapLangFromUrl(): void {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  const raw = (q.get("lang") || q.get("locale") || "").trim().toLowerCase();
  if (raw === "en" || raw === "sr" || raw === "ru" || raw === "zh") {
    try {
      localStorage.setItem(LANG_KEY, raw);
    } catch {
      /* ignore */
    }
  }
}

bootstrapLangFromUrl();
applyTenantThemeFromCurrentUrl();
const _sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
const _urlApp = (_sp.get("appTheme") || _sp.get("trainify_theme") || "").trim().toLowerCase();
if (_urlApp !== "light" && _urlApp !== "dark") {
  initThemeFromStorage();
}
applyCachedTenantBrandingIfAny();
installCrossAppThemeListener();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <I18nProvider>
        <AuthProvider>
          <NotificationProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </NotificationProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
