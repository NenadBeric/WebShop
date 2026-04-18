/** Brzi meni (donja traka) — samo mobilni; per-user localStorage. */

export const MOBILE_QUICK_MIN = 2;

const TAB_BAR_H_PAD_PX = 20;
const TAB_ITEM_MIN_WIDTH_PX = 52;
const TAB_BAR_GAP_PX = 2;

export function computeMobileQuickMaxSlots(innerWidth: number): number {
  const usable = Math.max(0, innerWidth - TAB_BAR_H_PAD_PX);
  const slot = TAB_ITEM_MIN_WIDTH_PX + TAB_BAR_GAP_PX;
  const n = Math.floor((usable + TAB_BAR_GAP_PX) / slot);
  return Math.max(MOBILE_QUICK_MIN, n);
}

const STORAGE_PREFIX = "webshop.mobileQuickNav.v1";

export function mobileQuickNavStorageKey(userKey: string): string {
  return `${STORAGE_PREFIX}.${userKey}`;
}

export function loadPinnedPaths(userKey: string): string[] | null {
  try {
    const raw = localStorage.getItem(mobileQuickNavStorageKey(userKey));
    if (!raw) return null;
    const j = JSON.parse(raw) as { order?: unknown };
    if (!Array.isArray(j.order)) return null;
    return j.order.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

export function savePinnedPaths(userKey: string, order: string[]): void {
  try {
    localStorage.setItem(mobileQuickNavStorageKey(userKey), JSON.stringify({ order }));
  } catch {
    /* quota / private mode */
  }
}

/** Putanje koje ne idu u brzi meni (npr. korpa u headeru). */
export function isExcludedFromQuickNav(path: string, fabPaths: readonly string[]): boolean {
  if (path === "/profile") return true;
  return fabPaths.includes(path);
}

export function normalizePinnedOrder(pinned: string[], validPaths: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of pinned) {
    if (validPaths.has(p) && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

export function computeDefaultPinnedPaths(
  allTabPathsInOrder: string[],
  fabPaths: readonly string[],
  maxSlots: number,
): string[] {
  const candidates = allTabPathsInOrder.filter((p) => !isExcludedFromQuickNav(p, fabPaths));
  const cap = Math.max(MOBILE_QUICK_MIN, maxSlots);
  return candidates.slice(0, Math.min(cap, candidates.length));
}

/** Korpa ostaje u headeru — ne pinuje se u donju traku. */
export const MOBILE_FAB_PATHS: readonly string[] = ["/cart"];
