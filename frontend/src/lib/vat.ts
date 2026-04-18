/** Usklađeno sa backend `app/services/vat.py` */

export const VAT_OPTIONS = [0, 10, 20] as const;
export type VatOption = (typeof VAT_OPTIONS)[number];

export function grossFromNet(net: number, vatPercent: number): number {
  if (!Number.isFinite(net) || net < 0) return 0;
  const g = net * (1 + vatPercent / 100);
  return Math.round(g * 100) / 100;
}

export function netFromGross(gross: number, vatPercent: number): number {
  if (!Number.isFinite(gross) || gross < 0) return 0;
  if (vatPercent === 0) return Math.round(gross * 100) / 100;
  const n = gross / (1 + vatPercent / 100);
  return Math.round(n * 100) / 100;
}
