import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { CartProvider } from "./cart/CartContext";
import { NotificationProvider } from "./notifications/NotificationContext";
import { I18nProvider } from "./i18n/I18nContext";
import { initThemeFromStorage } from "./theme";
import { App } from "./App";
import "./index.css";

initThemeFromStorage();

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
