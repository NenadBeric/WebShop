import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Product } from "../types";

/** Stari zajednički ključ (migracija u server korpu pri prvom učitavanju). */
const LEGACY_CART_KEY = "webshop_cart";

export type CartLine = { product: Product; quantity: number; note: string };

type CartCtx = {
  lines: CartLine[];
  /** Prvi GET sa servera završen (ili greška) — spreči „prazna korpa“ pre sinhronizacije. */
  ready: boolean;
  add: (p: Product, qty?: number) => void;
  remove: (productId: number) => void;
  setQty: (productId: number, qty: number) => void;
  setNote: (productId: number, note: string) => void;
  clear: () => Promise<void>;
};

const Ctx = createContext<CartCtx | null>(null);

function storageKeyForUser(user: { tenant_id?: string; sub?: string; email?: string } | null): string | null {
  if (!user) return null;
  const tid = user.tenant_id || "default";
  const sid = user.sub || user.email;
  if (!sid) return null;
  return `webshop_cart_v2_${tid}_${sid}`;
}

function loadFromKey(key: string): CartLine[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as CartLine[];
    const legacy = localStorage.getItem(LEGACY_CART_KEY);
    if (legacy) {
      localStorage.setItem(key, legacy);
      localStorage.removeItem(LEGACY_CART_KEY);
      return JSON.parse(legacy) as CartLine[];
    }
    return [];
  } catch {
    return [];
  }
}

function ServerCartState({ storageKey, children }: { storageKey: string; children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async (): Promise<CartLine[]> => {
    const data = await apiFetch<{ lines: Array<{ product: Product; quantity: number; note?: string }> }>("/api/v1/cart");
    return data.lines.map((x) => ({ product: x.product, quantity: x.quantity, note: x.note ?? "" }));
  }, []);

  const persist = useCallback(async (next: CartLine[]) => {
    await apiFetch("/api/v1/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: next.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          note: l.note,
        })),
      }),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        let next = await reload();
        if (cancelled) return;
        if (next.length === 0) {
          const local = loadFromKey(storageKey);
          if (local.length > 0) {
            try {
              await persist(local);
              localStorage.removeItem(storageKey);
              localStorage.removeItem(LEGACY_CART_KEY);
              next = await reload();
            } catch {
              /* ostavi prazno ako migracija ne uspe */
            }
          }
        }
        if (!cancelled) setLines(next);
      } catch {
        if (!cancelled) setLines([]);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey, reload, persist]);

  const add = useCallback(
    (p: Product, qty = 1) => {
      setLines((prev) => {
        const i = prev.findIndex((l) => l.product.id === p.id);
        let next: CartLine[];
        if (i >= 0) {
          next = [...prev];
          next[i] = { ...next[i], quantity: next[i].quantity + qty };
        } else {
          next = [...prev, { product: p, quantity: qty, note: "" }];
        }
        queueMicrotask(() => {
          void persist(next).catch(async () => {
            setLines(await reload());
          });
        });
        return next;
      });
    },
    [persist, reload],
  );

  const remove = useCallback(
    (productId: number) => {
      setLines((prev) => {
        const next = prev.filter((l) => l.product.id !== productId);
        queueMicrotask(() => {
          void persist(next).catch(async () => {
            setLines(await reload());
          });
        });
        return next;
      });
    },
    [persist, reload],
  );

  const setQty = useCallback(
    (productId: number, qty: number) => {
      setLines((prev) => {
        let next: CartLine[];
        if (qty <= 0) next = prev.filter((l) => l.product.id !== productId);
        else next = prev.map((l) => (l.product.id === productId ? { ...l, quantity: qty } : l));
        queueMicrotask(() => {
          void persist(next).catch(async () => {
            setLines(await reload());
          });
        });
        return next;
      });
    },
    [persist, reload],
  );

  const setNote = useCallback(
    (productId: number, note: string) => {
      setLines((prev) => {
        const next = prev.map((l) => (l.product.id === productId ? { ...l, note } : l));
        queueMicrotask(() => {
          void persist(next).catch(async () => {
            setLines(await reload());
          });
        });
        return next;
      });
    },
    [persist, reload],
  );

  const clear = useCallback(async () => {
    try {
      await apiFetch("/api/v1/cart", { method: "DELETE" });
      setLines([]);
    } catch {
      setLines(await reload());
    }
  }, [reload]);

  const value = useMemo(
    () => ({ lines, ready, add, remove, setQty, setNote, clear }),
    [lines, ready, add, remove, setQty, setNote, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function EmptyCartProvider({ children }: { children: ReactNode }) {
  const add = useCallback(() => {}, []);
  const remove = useCallback(() => {}, []);
  const setQty = useCallback(() => {}, []);
  const setNote = useCallback(() => {}, []);
  const clear = useCallback(async () => {}, []);
  const value = useMemo(
    () => ({ lines: [] as CartLine[], ready: true, add, remove, setQty, setNote, clear }),
    [add, remove, setQty, setNote, clear],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const storageKey = useMemo(() => storageKeyForUser(user), [user?.tenant_id, user?.sub, user?.email]);

  if (!storageKey) {
    return <EmptyCartProvider>{children}</EmptyCartProvider>;
  }

  return (
    <ServerCartState key={storageKey} storageKey={storageKey}>
      {children}
    </ServerCartState>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}
