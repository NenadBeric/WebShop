/** Isti font kodovi kao Trainify `gymThemeFontOptions.ts` (Google Fonts). */

export type TenantThemeFontCode =
  | "INTER"
  | "DM_SANS"
  | "OPEN_SANS"
  | "LATO"
  | "MONTSERRAT"
  | "ROBOTO"
  | "SOURCE_SANS_3"
  | "WORK_SANS"
  | "NUNITO_SANS"
  | "PLUS_JAKARTA_SANS";

export const TENANT_THEME_FONT_CODES: TenantThemeFontCode[] = [
  "INTER",
  "DM_SANS",
  "OPEN_SANS",
  "LATO",
  "MONTSERRAT",
  "ROBOTO",
  "SOURCE_SANS_3",
  "WORK_SANS",
  "NUNITO_SANS",
  "PLUS_JAKARTA_SANS",
];

export const TENANT_THEME_DEFAULT_BORDER_RADIUS_PX = 14;

const GOOGLE_FAMILIES: Record<TenantThemeFontCode, string> = {
  INTER: "Inter:wght@400;500;600;700",
  DM_SANS: "DM+Sans:wght@400;500;600;700",
  OPEN_SANS: "Open+Sans:wght@400;500;600;700",
  LATO: "Lato:wght@400;700",
  MONTSERRAT: "Montserrat:wght@400;500;600;700",
  ROBOTO: "Roboto:wght@400;500;700",
  SOURCE_SANS_3: "Source+Sans+3:wght@400;500;600;700",
  WORK_SANS: "Work+Sans:wght@400;500;600;700",
  NUNITO_SANS: "Nunito+Sans:wght@400;500;600;700",
  PLUS_JAKARTA_SANS: "Plus+Jakarta+Sans:wght@400;500;600;700",
};

const FONT_STACKS: Record<TenantThemeFontCode, string> = {
  INTER: `'Inter', system-ui, sans-serif`,
  DM_SANS: `'DM Sans', system-ui, sans-serif`,
  OPEN_SANS: `'Open Sans', system-ui, sans-serif`,
  LATO: `'Lato', system-ui, sans-serif`,
  MONTSERRAT: `'Montserrat', system-ui, sans-serif`,
  ROBOTO: `'Roboto', system-ui, sans-serif`,
  SOURCE_SANS_3: `'Source Sans 3', system-ui, sans-serif`,
  WORK_SANS: `'Work Sans', system-ui, sans-serif`,
  NUNITO_SANS: `'Nunito Sans', system-ui, sans-serif`,
  PLUS_JAKARTA_SANS: `'Plus Jakarta Sans', system-ui, sans-serif`,
};

const FONT_LINK_ID = "webshop-tenant-font";

export function tenantThemeGoogleFontsHref(code: string | null | undefined): string | null {
  if (!code || !(code in GOOGLE_FAMILIES)) return null;
  const fam = GOOGLE_FAMILIES[code as TenantThemeFontCode];
  return `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
}

export function tenantThemeFontStack(code: string | null | undefined): string | null {
  if (!code || !(code in FONT_STACKS)) return null;
  return FONT_STACKS[code as TenantThemeFontCode];
}

export function ensureTenantThemeFontLink(href: string | null): void {
  const existing = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!href) {
    existing?.remove();
    return;
  }
  if (existing?.href === href) return;
  existing?.remove();
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export function removeTenantThemeFontLink(): void {
  document.getElementById(FONT_LINK_ID)?.remove();
}

export function autoButtonHoverFromPrimary(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#2563eb";
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = 0.9;
  r = Math.round(r * t);
  g = Math.round(g * t);
  b = Math.round(b * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
