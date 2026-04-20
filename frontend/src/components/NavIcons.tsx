import type { SVGProps } from "react";

const common: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export function IconShop(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M6 2h12l1 5H5L6 2z" />
      <path d="M5 7h14l-1 13H6L5 7z" />
      <path d="M9 11v6M15 11v6" />
    </svg>
  );
}

export function IconCart(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

export function IconReception(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h10M7 12h6" />
    </svg>
  );
}

export function IconManager(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

/** Šifarnik: proizvodi (paket). */
export function IconRefProducts(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

/** Šifarnik: tipovi proizvoda (slojevi / varijante). */
export function IconRefProductTypes(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

/** Šifarnik: jedinice mere (lenjir). */
export function IconRefMeasureUnits(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M3 15h18v4H3z" />
      <path d="M5 15v-2M8 15v-4M11 15v-2M14 15v-4M17 15v-2M19 15v-3" />
    </svg>
  );
}

export function IconChart(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 17V9M12 17v-5M16 17V7" />
    </svg>
  );
}

export function IconMoon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function IconSun(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function IconBell(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function IconLogout(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

/** Cioda — ista geometrija kao Lucide `Pin` (Trainify). */
export function IconPin(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

/** Otkvačena cioda — Lucide `PinOff`. */
export function IconPinOff(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M12 17v5" />
      <path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89" />
      <path d="m2 2 20 20" />
      <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />
    </svg>
  );
}

export function IconBuilding(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
      <path d="M9 9v.01M9 12v.01M9 15v.01M15 12v.01M15 15v.01" />
    </svg>
  );
}

/** Zvezdica — favorit u mobilnom meniju (Trainify Star). */
export function IconStar(props: SVGProps<SVGSVGElement> & { filled?: boolean }) {
  const { filled, ...rest } = props;
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

export function IconX(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** Kanta (Trainify Trash). */
export function IconTrash(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M6 6l1 16a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-16" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

/** Skeniranje QR porudžbine (recepcija / menadžment). */
export function IconExternalLink(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  );
}

export function IconQrScan(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M21 7V5a2 2 0 0 0-2-2h-2M3 17v2a2 2 0 0 0 2 2h2M21 17v2a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="7" width="3" height="3" rx="0.5" />
      <rect x="14" y="7" width="3" height="3" rx="0.5" />
      <rect x="7" y="14" width="3" height="3" rx="0.5" />
      <rect x="14" y="14" width="3" height="3" rx="0.5" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
    </svg>
  );
}
