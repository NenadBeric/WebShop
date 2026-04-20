import { getSavedLanguage, setSavedLanguage } from "../i18n/setup";
import { getAdminTenantId } from "../lib/adminTenant";
import { getEmbedTenantId, getEmbedToken } from "../lib/trainifyEmbedAuth";

export { getSavedLanguage, setSavedLanguage };

const TOKEN_KEY = "webshop_token";

export const API_BASE = "";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function parseJwtPayload<T extends Record<string, unknown>>(token: string): T | null {
  try {
    const p = token.split(".")[1];
    const json = atob(p.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const allowOneRetry = (init as { __embedRetry?: boolean }).__embedRetry !== true;
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept-Language", getSavedLanguage());
  if (token) {
    const p = parseJwtPayload<{ role?: string }>(token);
    if (p?.role === "ADMIN") {
      const tid = getAdminTenantId();
      if (tid) headers.set("X-Webshop-Tenant-Id", tid);
    } else {
      const embedTid = getEmbedTenantId();
      if (embedTid) headers.set("X-Webshop-Tenant-Id", embedTid);
    }
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg =
      typeof data?.detail === "string"
        ? data.detail
        : Array.isArray(data?.detail)
          ? data.detail.map((d: { msg?: string }) => d.msg).join(", ")
          : res.statusText;
    // Trainify embed: if token got overwritten/cleared during navigation/login, restore the original embed token once.
    if (res.status === 401 && allowOneRetry && typeof msg === "string" && msg.toLowerCase().includes("nevažeći token")) {
      const embedTok = (getEmbedToken() || "").trim();
      if (embedTok) {
        setToken(embedTok);
        return apiFetch<T>(path, { ...init, __embedRetry: true } as RequestInit);
      }
    }
    throw new Error(msg || "Request failed");
  }
  return data as T;
}
