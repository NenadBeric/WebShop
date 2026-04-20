import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../api/client";
import type { AppNotification } from "../types";

type NotificationCtx = {
  items: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (ids: number[]) => Promise<void>;
  deleteIds: (ids: number[]) => Promise<void>;
  clearAll: () => Promise<void>;
  clearRead: () => Promise<void>;
};

const POLL_MS = 25_000;

const Ctx = createContext<NotificationCtx | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!token) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<AppNotification[]>("/api/v1/notifications?limit=50");
      if (mounted.current) setItems(data);
    } catch {
      /* keep previous items on transient errors */
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [token]);

  const markRead = useCallback(
    async (ids: number[]) => {
      if (!token || !ids.length) return;
      try {
        await apiFetch("/api/v1/notifications/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const now = new Date().toISOString();
        setItems((prev) =>
          prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)),
        );
      } catch {
        void refresh();
      }
    },
    [token, refresh],
  );

  const deleteIds = useCallback(
    async (ids: number[]) => {
      if (!token || !ids.length) return;
      try {
        await apiFetch("/api/v1/notifications/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        setItems((prev) => prev.filter((n) => !ids.includes(n.id)));
      } catch {
        void refresh();
      }
    },
    [token, refresh],
  );

  const clearAll = useCallback(async () => {
    if (!token) return;
    try {
      await apiFetch("/api/v1/notifications/clear", { method: "POST" });
      setItems([]);
    } catch {
      void refresh();
    }
  }, [token, refresh]);

  const clearRead = useCallback(async () => {
    if (!token) return;
    try {
      await apiFetch("/api/v1/notifications/clear-read", { method: "POST" });
      setItems((prev) => prev.filter((n) => !n.read_at));
    } catch {
      void refresh();
    }
  }, [token, refresh]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [token, refresh]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read_at).length, [items]);

  const value = useMemo(
    () => ({ items, unreadCount, loading, refresh, markRead, deleteIds, clearAll, clearRead }),
    [items, unreadCount, loading, refresh, markRead, deleteIds, clearAll, clearRead],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNotifications outside NotificationProvider");
  return c;
}
