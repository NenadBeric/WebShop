import type { Product } from "../types";

export function parseMoney(s: string | number | undefined): number {
  const v = Number(String(s ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}

export function productOnSale(p: Pick<Product, "sale_percent">): boolean {
  const n = Math.floor(Number(p.sale_percent));
  return Number.isFinite(n) && n > 0;
}

/** Procenat akcije (0 = bez akcije), za sortiranje. */
export function salePercentValue(p: Pick<Product, "sale_percent">): number {
  const n = Math.floor(Number(p.sale_percent));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(99, Math.max(0, n));
}

/** Bruto cena koju kupac plaća (posle akcije, ako je definisana). */
export function effectiveGross(p: Product): number {
  if (p.price_gross_effective != null && String(p.price_gross_effective) !== "") {
    return parseMoney(p.price_gross_effective);
  }
  const base = parseMoney(p.price_gross);
  const sp = Math.floor(Number(p.sale_percent));
  if (!Number.isFinite(sp) || sp <= 0) return base;
  const f = (100 - Math.min(99, Math.max(0, sp))) / 100;
  return Math.round(base * f * 100) / 100;
}

/** Neto cena posle akcije (usklađena sa PDV preko servera kada postoji polje). */
export function effectiveNet(p: Product): number {
  if (p.price_net_effective != null && String(p.price_net_effective) !== "") {
    return parseMoney(p.price_net_effective);
  }
  const base = parseMoney(p.price_net);
  const sp = Math.floor(Number(p.sale_percent));
  if (!Number.isFinite(sp) || sp <= 0) return base;
  const f = (100 - Math.min(99, Math.max(0, sp))) / 100;
  return Math.round(base * f * 100) / 100;
}
