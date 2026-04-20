/**
 * Trainify otvara WebShop u iframe-u sa query parametrima; JWT ne ide u cookie između domena.
 * Jednokratno čitanje `embed_token` + `tenant` iz URL-a, upis tokena i tenanta za API zaglavlja.
 */

import { setToken } from "../api/client";

const EMBED_TENANT_KEY = "webshop_embed_tenant";
const EMBED_TOKEN_KEY = "webshop_embed_token";

export function getEmbedTenantId(): string | null {
  try {
    return sessionStorage.getItem(EMBED_TENANT_KEY);
  } catch {
    return null;
  }
}

export function getEmbedToken(): string | null {
  try {
    return sessionStorage.getItem(EMBED_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearEmbedTenantId(): void {
  try {
    sessionStorage.removeItem(EMBED_TENANT_KEY);
  } catch {
    /* ignore */
  }
}

/** Pozovi pre prvog rendera (npr. u main.tsx) da getToken() u AuthProvider vidi token. */
export function consumeTrainifyEmbedAuthFromUrl(): void {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  const tok = (q.get("embed_token") || q.get("trainify_access_token") || "").trim();
  const tenant = (q.get("tenant") || "").trim();
  if (!tok) return;
  setToken(tok);
  try {
    sessionStorage.setItem(EMBED_TOKEN_KEY, tok);
  } catch {
    /* ignore */
  }
  if (tenant) {
    try {
      sessionStorage.setItem(EMBED_TENANT_KEY, tenant);
    } catch {
      /* ignore */
    }
  }
  q.delete("embed_token");
  q.delete("trainify_access_token");
  const u = new URL(window.location.href);
  const qs = q.toString();
  u.search = qs ? `?${qs}` : "";
  window.history.replaceState({}, "", `${u.pathname}${u.search}${u.hash}`);
}
