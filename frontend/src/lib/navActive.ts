/** Pomoć za aktivno stanje NavLink-a kada jedna putanja prefiksuje drugu. */

export function normalizePathname(p: string): string {
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

/**
 * React Router `NavLink` `end`: treba kada postoji druga stavka čija putanja počinje ovom + `/`.
 */
export function navLinkNeedsEndFlag(tabTo: string, allTabPaths: readonly string[]): boolean {
  const t = normalizePathname(tabTo);
  return allTabPaths.some((other) => {
    if (other === tabTo) return false;
    const o = normalizePathname(other);
    return o.startsWith(`${t}/`);
  });
}

/**
 * Koja tab putanja je „aktivna” za pathname — bira se najduže poklapanje.
 */
export function resolveActiveNavPath(pathname: string, tabPaths: readonly string[]): string | null {
  const path = normalizePathname(pathname);
  const sorted = [...new Set(tabPaths)].sort((a, b) => normalizePathname(b).length - normalizePathname(a).length);
  for (const p of sorted) {
    const t = normalizePathname(p);
    if (path === t || path.startsWith(`${t}/`)) {
      return p;
    }
  }
  return null;
}
