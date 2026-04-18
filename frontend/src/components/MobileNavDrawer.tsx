import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { IconExternalLink, IconLogout, IconSearch, IconStar, IconX } from "./NavIcons";
import { TRAINIFY_APP_URL } from "../lib/externalLinks";
import { isExcludedFromQuickNav } from "../lib/mobileQuickNav";
import { navLinkNeedsEndFlag } from "../lib/navActive";
import type { MobileShellTab } from "./MobileFooterBar";

export type MobileShellGroup = { label: string; tabs: MobileShellTab[] };

function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(" ");
}

export interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  brandTitle: string;
  sidebarGroups: MobileShellGroup[];
  pinnedPaths: Set<string>;
  onTogglePin: (path: string) => void;
  name: string;
  email: string;
  role: string;
  fabPaths: readonly string[];
  onLogout: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Jezik + tema (samo mobilni drawer, ispod korisnika). */
  preferences?: ReactNode;
}

function tabSearchText(t: (key: string) => string, tab: MobileShellTab): string {
  return `${t(tab.label)} ${tab.to}`.toLowerCase();
}

export function MobileNavDrawer({
  open,
  onClose,
  brandTitle,
  sidebarGroups,
  pinnedPaths,
  onTogglePin,
  name,
  email,
  role,
  fabPaths,
  onLogout,
  t,
  preferences,
}: MobileNavDrawerProps) {
  const [q, setQ] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filterMatch = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (tab: MobileShellTab) => {
      if (!needle) return true;
      return tabSearchText(t, tab).includes(needle);
    };
  }, [q, t]);

  const allTabPaths = useMemo(() => sidebarGroups.flatMap((g) => g.tabs.map((x) => x.to)), [sidebarGroups]);

  const renderRow = (tab: MobileShellTab) => {
    if (fabPaths.includes(tab.to)) return null;
    if (!filterMatch(tab)) return null;
    const pinned = pinnedPaths.has(tab.to);
    const canPin = !isExcludedFromQuickNav(tab.to, fabPaths);
    return (
      <div key={tab.to} className="mobile-nav-drawer__row">
        <NavLink
          to={tab.to}
          end={navLinkNeedsEndFlag(tab.to, allTabPaths)}
          className={({ isActive }) => cx("mobile-nav-drawer__link", isActive && "mobile-nav-drawer__link--active")}
          onClick={onClose}
        >
          <span className="mobile-nav-drawer__link-icon">{tab.icon}</span>
          <span className="mobile-nav-drawer__link-label">{t(tab.label)}</span>
        </NavLink>
        {canPin ? (
          <button
            type="button"
            className={cx("mobile-nav-drawer__pin", pinned && "mobile-nav-drawer__pin--active")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTogglePin(tab.to);
            }}
            title={pinned ? t("nav.mobileNav.unpin") : t("nav.mobileNav.pin")}
            aria-label={pinned ? t("nav.mobileNav.unpin") : t("nav.mobileNav.pin")}
            aria-pressed={pinned}
          >
            <IconStar filled={pinned} width={18} height={18} />
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className={cx("mobile-nav-drawer", open && "mobile-nav-drawer--open")} aria-hidden={!open}>
      <button type="button" className="mobile-nav-drawer__backdrop" aria-label={t("nav.close_menu")} onClick={onClose} />
      <div ref={panelRef} className="mobile-nav-drawer__panel" role="dialog" aria-modal="true">
        <div className="mobile-nav-drawer__header">
          <div className="mobile-nav-drawer__brand">
            <span className="mobile-nav-drawer__brand-name">{brandTitle}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("nav.close_menu")}>
            <IconX width={22} height={22} />
          </button>
        </div>

        <div className="mobile-nav-drawer__search-wrap">
          <div className="mobile-nav-drawer__search-field">
            <IconSearch width={18} height={18} className="mobile-nav-drawer__search-icon" />
            <input
              type="search"
              className="mobile-nav-drawer__search"
              placeholder={t("nav.mobileNav.searchPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <nav className="mobile-nav-drawer__nav">
          {sidebarGroups.map((group) => (
            <div key={group.label} className="mobile-nav-drawer__group">
              <div className="mobile-nav-drawer__group-label">{t(group.label)}</div>
              {group.tabs.map((tab) => renderRow(tab))}
            </div>
          ))}
        </nav>

        <div className="mobile-nav-drawer__footer">
          <div className="mobile-nav-drawer__user">
            <div className="mobile-nav-drawer__user-name">{name || "—"}</div>
            {email ? <div className="mobile-nav-drawer__user-email">{email}</div> : null}
            <div className="mobile-nav-drawer__user-role">{role}</div>
          </div>
          {preferences ? <div className="mobile-nav-drawer__prefs">{preferences}</div> : null}
          <a
            href={TRAINIFY_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mobile-nav-drawer__trainify"
            title={t("nav.trainify_title")}
            onClick={onClose}
          >
            <IconExternalLink width={18} height={18} />
            <span>{t("nav.trainify_link")}</span>
          </a>
          <button
            type="button"
            className="mobile-nav-drawer__logout"
            onClick={() => {
              onLogout();
              onClose();
            }}
          >
            <IconLogout width={18} height={18} />
            <span>{t("nav.logout")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
