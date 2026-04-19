import { getSavedLanguage, setSavedLanguage } from "../i18n/setup";
import { getAdminTenantId } from "../lib/adminTenant";

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
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept-Language", getSavedLanguage());
  if (token) {
    const p = parseJwtPayload<{ role?: string }>(token);
    if (p?.role === "ADMIN") {
      const tid = getAdminTenantId();
      if (tid) headers.set("X-Webshop-Tenant-Id", tid);
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
    throw new Error(msg || "Request failed");
  }
  return data as T;
}
