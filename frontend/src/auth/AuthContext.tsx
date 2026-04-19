import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, getToken, parseJwtPayload, setToken } from "../api/client";
import { getAdminTenantId, setAdminTenantIdInStorage } from "../lib/adminTenant";
import type { SessionOut } from "../types";
import { IS_OIDC, userManager } from "./oidc-config";

type JwtUser = {
  sub?: string;
  email?: string;
  role?: string;
  tenant_id?: string;
  name?: string;
};

type AuthState = {
  token: string | null;
  user: JwtUser | null;
  isOidc: boolean;
  /** Izabrana firma za ADMIN (localStorage + sinhronizacija sa API zaglavljem). */
  adminTenantId: string | null;
  setAdminTenantId: (tenantId: string | null) => void;
  refreshMe: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshFromStorage: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

function mergeUser(raw: JwtUser | null, me: SessionOut | null): JwtUser | null {
  if (!raw && !me) return null;
  const base = { ...(raw || {}) };
  if (me) {
    base.sub = me.sub;
    base.email = me.email;
    base.name = me.name;
    base.role = me.role;
    base.tenant_id = me.tenant_id;
  }
  return base;
}

function readJwtUser(token: string | null): JwtUser | null {
  if (!token) return null;
  return parseJwtPayload<JwtUser>(token);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(() => getToken());
  const [me, setMe] = useState<SessionOut | null>(null);
  const [adminTenantId, setAdminTenantIdState] = useState<string | null>(() => getAdminTenantId());

  const rawUser = useMemo(() => readJwtUser(token), [token]);
  const user = useMemo(() => {
    const merged = mergeUser(rawUser, me);
    if (merged?.role === "ADMIN" && adminTenantId) {
      return { ...merged, tenant_id: adminTenantId };
    }
    return merged;
  }, [rawUser, me, adminTenantId]);

  const setAdminTenantId = useCallback((tenantId: string | null) => {
    setAdminTenantIdInStorage(tenantId);
    setAdminTenantIdState(tenantId ? tenantId.trim() : null);
  }, []);

  useEffect(() => {
    setAdminTenantIdState(getAdminTenantId());
  }, [token]);

  const refreshMe = useCallback(async () => {
    const tok = getToken();
    if (!tok) return;
    const raw = readJwtUser(tok);
    if (raw?.role && String(raw.role).trim() && raw.role !== "ADMIN") return;
    try {
      const p = await apiFetch<SessionOut>("/api/v1/auth/me");
      setMe(p);
    } catch {
      setMe(null);
    }
  }, []);

  const refreshFromStorage = useCallback(() => {
    setTok(getToken());
    setAdminTenantIdState(getAdminTenantId());
  }, []);

  useEffect(() => {
    if (!IS_OIDC || !userManager) return;

    let cancelled = false;

    userManager.getUser().then((u) => {
      if (cancelled) return;
      if (u && !u.expired && u.access_token) {
        setToken(u.access_token);
        setTok(u.access_token);
      }
    });

    const onRenew = () => {
      void userManager!.getUser().then((u) => {
        if (u?.access_token) {
          setToken(u.access_token);
          setTok(u.access_token);
        }
      });
    };

    const onExpired = () => {
      setToken(null);
      setTok(null);
      setMe(null);
    };

    userManager.events.addAccessTokenExpired(onExpired);
    userManager.events.addSilentRenewError(onExpired);
    userManager.events.addUserLoaded(onRenew);

    return () => {
      cancelled = true;
      userManager!.events.removeAccessTokenExpired(onExpired);
      userManager!.events.removeSilentRenewError(onExpired);
      userManager!.events.removeUserLoaded(onRenew);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setMe(null);
      return;
    }
    const raw = readJwtUser(token);
    if (raw?.role && String(raw.role).trim() && raw.role !== "ADMIN") {
      setMe(null);
      return;
    }
    let cancelled = false;
    void apiFetch<SessionOut>("/api/v1/auth/me")
      .then((p) => {
        if (!cancelled) setMe(p);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, adminTenantId]);

  const login = useCallback(async (email: string, password: string) => {
    if (IS_OIDC && userManager) {
      await userManager.signinRedirect();
      return;
    }
    const res = await apiFetch<{ access_token: string }>("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setToken(res.access_token);
    setTok(res.access_token);
    setMe(null);
    setAdminTenantIdInStorage(null);
    setAdminTenantIdState(null);
  }, []);

  const logout = useCallback(async () => {
    setToken(null);
    setTok(null);
    setMe(null);
    setAdminTenantIdInStorage(null);
    setAdminTenantIdState(null);
    if (IS_OIDC && userManager) {
      try {
        await userManager.signoutRedirect();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isOidc: IS_OIDC,
      adminTenantId,
      setAdminTenantId,
      refreshMe,
      login,
      logout,
      refreshFromStorage,
    }),
    [token, user, adminTenantId, setAdminTenantId, refreshMe, login, logout, refreshFromStorage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export function useRole() {
  const { user } = useAuth();
  return user?.role || "";
}

export function canReception(role: string) {
  return ["WEBSHOP_RECEPTION", "WEBSHOP_MANAGER", "WEBSHOP_OWNER", "ADMIN"].includes(role);
}

export function canManage(role: string) {
  return ["WEBSHOP_MANAGER", "WEBSHOP_OWNER", "ADMIN"].includes(role);
}

export function canShop(role: string) {
  return [
    "WEBSHOP_CUSTOMER",
    "WEBSHOP_RECEPTION",
    "WEBSHOP_MANAGER",
    "WEBSHOP_OWNER",
    "ADMIN",
  ].includes(role);
}
