import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth, canManage, canReception, canShop } from "../auth/AuthContext";
import { useCart } from "../cart/CartContext";
import { useI18n } from "../i18n/I18nContext";
import { TRAINIFY_APP_URL } from "../lib/externalLinks";
import { isChromelessAppShellSearch, persistEmbedQueryFromSearch } from "../lib/trainifyEmbedUrl";
import {
  MOBILE_FAB_PATHS,
  MOBILE_QUICK_MIN,
  computeDefaultPinnedPaths,
  computeMobileQuickMaxSlots,
  isExcludedFromQuickNav,
  loadPinnedPaths,
  normalizePinnedOrder,
  savePinnedPaths,
} from "../lib/mobileQuickNav";
import {
  IconBuilding,
  IconCart,
  IconChart,
  IconExternalLink,
  IconLogout,
  IconMenu,
  IconRefMeasureUnits,
  IconRefProductTypes,
  IconManager,
  IconRefProducts,
  IconPin,
  IconPinOff,
  IconQrScan,
  IconReception,
  IconShop,
} from "./NavIcons";
import type { MobileShellTab } from "./MobileFooterBar";
import { MobileFooterBar } from "./MobileFooterBar";
import { LanguagePickerBar } from "./LanguagePickerBar";
import { MobileNavDrawer, type MobileShellGroup } from "./MobileNavDrawer";
import { NotificationBell } from "./NotificationBell";
import { OrderQrScannerModal } from "./OrderQrScannerModal";
import { SearchableSelect } from "./SearchableSelect";
import { ThemeSwitch } from "./ThemeSwitch";
import { applyTenantThemeToDocument, clearTenantThemeFromDocument, type TenantThemeDto } from "../theme/applyTenantTheme";
import { clearCachedTenantBranding, writeCachedTenantBranding } from "../theme/tenantBrandingCache";

const STORAGE_PIN = "webshop_sidebar_pin";

function readPinned(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_PIN);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

function itemClass(active: boolean) {
  return ["sidebar__item", active ? "sidebar__item--active" : ""].filter(Boolean).join(" ");
}

function afterNav(closeMobileMenu: () => void, blurRail: () => void) {
  blurRail();
  closeMobileMenu();
}

const LANG_OPTIONS = [
  { value: "sr", label: "SR" },
  { value: "en", label: "EN" },
  { value: "ru", label: "RU" },
  { value: "zh", label: "ZH" },
];

export function Layout() {
  const { user, logout, token, adminTenantId, setAdminTenantId } = useAuth();
  const { lines } = useCart();
  const { t, lang, setLang } = useI18n();
  const loc = useLocation();
  const navigate = useNavigate();
  const embedMode = useMemo(() => isChromelessAppShellSearch(loc.search), [loc.search]);
  const role = user?.role || "";
  // Badge should show number of distinct cart lines (items), not total quantity.
  const cartCount = lines.filter((l) => l.quantity > 0).length;

  const [pinned, setPinned] = useState(readPinned);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tabletUp, setTabletUp] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 641px)").matches,
  );

  const userKey = user?.sub || user?.email || "anon";
  const hadAuthToken = useRef(false);

  // U embed/Trainify režimu: zapamti parametre kako SPA navigacija ne bi "pojela" embed flagove.
  useEffect(() => {
    persistEmbedQueryFromSearch(loc.search);
  }, [loc.search]);

  useEffect(() => {
    const tid = (user?.tenant_id || "").trim();
    if (!token || !tid) return;
    let cancelled = false;
    void apiFetch<TenantThemeDto>("/api/v1/tenant/theme")
      .then((data) => {
        if (cancelled) return;
        applyTenantThemeToDocument(data, null);
        writeCachedTenantBranding(data);
      })
      .catch(() => {
        /* npr. ADMIN bez tenanta — ignoriši */
      });
    return () => {
      cancelled = true;
    };
  }, [token, user?.tenant_id]);

  useEffect(() => {
    if (!token) {
      if (hadAuthToken.current) {
        hadAuthToken.current = false;
        clearCachedTenantBranding();
        clearTenantThemeFromDocument();
      }
      return;
    }
    hadAuthToken.current = true;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const onRefresh = () => {
      void apiFetch<TenantThemeDto>("/api/v1/tenant/theme")
        .then((data) => {
          applyTenantThemeToDocument(data, null);
          writeCachedTenantBranding(data);
        })
        .catch(() => {});
    };
    window.addEventListener("webshop-tenant-theme", onRefresh as EventListener);
    return () => window.removeEventListener("webshop-tenant-theme", onRefresh as EventListener);
  }, [token]);
  const [pinnedPaths, setPinnedPaths] = useState<string[]>([]);
  const [quickMaxSlots, setQuickMaxSlots] = useState(() =>
    typeof window !== "undefined" ? computeMobileQuickMaxSlots(window.innerWidth) : MOBILE_QUICK_MIN,
  );
  const [navFlash, setNavFlash] = useState<string | null>(null);
  const navFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qrScanOpen, setQrScanOpen] = useState(false);

  const flashNav = useCallback((msg: string) => {
    if (navFlashTimer.current) clearTimeout(navFlashTimer.current);
    setNavFlash(msg);
    navFlashTimer.current = setTimeout(() => {
      setNavFlash(null);
      navFlashTimer.current = null;
    }, 2400);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PIN, pinned ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [pinned]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 641px)");
    const fn = () => setTabletUp(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [loc.pathname]);

  useLayoutEffect(() => {
    const upd = () => setQuickMaxSlots(computeMobileQuickMaxSlots(window.innerWidth));
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);

  const { mobileSidebarGroups, allMobileTabPaths } = useMemo(() => {
    const groups: MobileShellGroup[] = [];
    if (canShop(role)) {
      groups.push({
        label: "nav.group_shop",
        tabs: [
          { to: "/catalog", label: "nav.shop", icon: <IconShop /> },
          { to: "/orders", label: "nav.my_orders", icon: <IconReception /> },
        ],
      });
    }
    if (canReception(role)) {
      groups.push({
        label: "nav.group_desk",
        tabs: [{ to: "/reception", label: "nav.reception", icon: <IconReception /> }],
      });
    }
    if (canManage(role)) {
      groups.push({
        label: "nav.group_manage",
        tabs: [
          { to: "/reports", label: "nav.reports", icon: <IconChart /> },
          { to: "/reports/ai", label: "nav.reports_ai", icon: <IconChart /> },
          { to: "/tenant-settings", label: "nav.tenant_settings", icon: <IconBuilding /> },
          { to: "/reference/staff", label: "nav.staff_directory", icon: <IconManager /> },
        ],
      });
      groups.push({
        label: "nav.group_reference",
        tabs: [
          { to: "/reference/products", label: "nav.ref_products", icon: <IconRefProducts /> },
          { to: "/reference/product-types", label: "nav.ref_product_types", icon: <IconRefProductTypes /> },
          { to: "/reference/measure-units", label: "nav.ref_measure_units", icon: <IconRefMeasureUnits /> },
        ],
      });
    }
    if (role === "ADMIN") {
      groups.push({
        label: "nav.group_admin",
        tabs: [{ to: "/admin/licenses", label: "nav.admin_licenses", icon: <IconBuilding /> }],
      });
    }
    const paths = groups.flatMap((g) => g.tabs.map((x) => x.to));
    return { mobileSidebarGroups: groups, allMobileTabPaths: paths };
  }, [role]);

  const tabPathsKey = allMobileTabPaths.join("|");
  const isMobileQuickNav = !tabletUp && allMobileTabPaths.length > 0;

  useEffect(() => {
    if (!isMobileQuickNav) return;
    const valid = new Set(allMobileTabPaths);
    const loaded = loadPinnedPaths(userKey);
    const normalized = loaded ? normalizePinnedOrder(loaded, valid) : [];
    let next: string[];
    if (normalized.length >= MOBILE_QUICK_MIN) {
      next = normalized.slice(0, quickMaxSlots);
      if (next.length < normalized.length) {
        savePinnedPaths(userKey, next);
      }
    } else {
      next = computeDefaultPinnedPaths(allMobileTabPaths, MOBILE_FAB_PATHS, quickMaxSlots);
      savePinnedPaths(userKey, next);
    }
    setPinnedPaths((prev) => {
      if (prev.length === next.length && prev.every((p, i) => p === next[i])) return prev;
      return next;
    });
  }, [isMobileQuickNav, userKey, tabPathsKey, quickMaxSlots, allMobileTabPaths]);

  const togglePin = useCallback(
    (path: string) => {
      if (isExcludedFromQuickNav(path, MOBILE_FAB_PATHS)) return;
      setPinnedPaths((prev) => {
        if (prev.includes(path)) {
          if (prev.length <= MOBILE_QUICK_MIN) {
            queueMicrotask(() => flashNav(t("nav.mobileNav.minPins")));
            return prev;
          }
          const next = prev.filter((p) => p !== path);
          savePinnedPaths(userKey, next);
          return next;
        }
        if (prev.length >= quickMaxSlots) {
          queueMicrotask(() => flashNav(t("nav.mobileNav.maxPins", { max: quickMaxSlots })));
          return prev;
        }
        const next = [...prev, path];
        savePinnedPaths(userKey, next);
        return next;
      });
    },
    [flashNav, t, userKey, quickMaxSlots],
  );

  const onReorderPinnedPaths = useCallback(
    (paths: string[]) => {
      setPinnedPaths(paths);
      savePinnedPaths(userKey, paths);
    },
    [userKey],
  );

  const pinnedPathsSet = useMemo(() => new Set(pinnedPaths), [pinnedPaths]);

  const mobileFooterTabs = useMemo(() => {
    const map = new Map(mobileSidebarGroups.flatMap((g) => g.tabs).map((tab) => [tab.to, tab]));
    return pinnedPaths.map((p) => map.get(p)).filter(Boolean) as MobileShellTab[];
  }, [pinnedPaths, mobileSidebarGroups]);

  useEffect(() => {
    if (!isMobileQuickNav || !mobileMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isMobileQuickNav, mobileMenuOpen]);

  const useRail = tabletUp && !pinned;

  const shellClass = useMemo(() => {
    const parts = ["app-shell"];
    if (useRail) parts.push("app-shell--sidebar-rail");
    return parts.join(" ");
  }, [useRail]);

  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  const blurRailFocus = useCallback(() => {
    if (!useRail) return;
    requestAnimationFrame(() => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.closest(".sidebar")) el.blur();
    });
  }, [useRail]);

  const asideClass = ["sidebar", useRail ? "sidebar--rail" : ""].filter(Boolean).join(" ");

  const displayUserName = user?.email ? user.email.split("@")[0] ?? "" : "";

  /** Jezik/tema u draweru da header na telefonu ne bude prenatrpan (korpa vs hamburger). */
  const prefsInDrawer = !tabletUp && isMobileQuickNav;

  const drawerPreferences = prefsInDrawer ? (
    <>
      <div className="mobile-nav-drawer__lang-block">
        <span className="field-inline__label mobile-nav-drawer__lang-heading">{t("lang.label")}</span>
        <LanguagePickerBar
          value={lang}
          onChange={(v) => {
            void setLang(v);
          }}
          options={LANG_OPTIONS}
          ariaLabel={t("lang.label")}
        />
      </div>
      <div className="mobile-nav-drawer__theme">
        <ThemeSwitch />
      </div>
    </>
  ) : undefined;

  if (role === "ADMIN" && !adminTenantId) {
    return <Navigate to="/admin/select-tenant" replace state={{ from: loc.pathname }} />;
  }

  if (embedMode) {
    return (
      <div className="app-shell app-shell--embed">
        <main className="app-main app-main--embed">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <header className="app-header">
        <div className="header-left">
          {!tabletUp ? (
            <button
              type="button"
              className="icon-btn app-header__menu-btn"
              onClick={openMobileMenu}
              aria-label={t("nav.open_menu")}
            >
              <IconMenu />
            </button>
          ) : null}
          <span className="brand">{t("app.title")}</span>
          {role === "ADMIN" && adminTenantId ? (
            <div className="app-header__admin-tenant" style={{ marginLeft: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span className="text-muted" style={{ fontSize: "0.82rem" }}>
                {t("adminTenant.context_label")}: <strong>{user?.tenant_id}</strong>
              </span>
              <button
                type="button"
                className="btn"
                style={{ padding: "0.2rem 0.55rem", fontSize: "0.82rem" }}
                onClick={() => {
                  setAdminTenantId(null);
                  navigate("/admin/select-tenant", { replace: false, state: { from: loc.pathname } });
                }}
              >
                {t("adminTenant.change")}
              </button>
            </div>
          ) : null}
        </div>
        <div className="app-header__actions">
          {canShop(role) ? (
            <NavLink
              to="/cart"
              className={({ isActive }) =>
                ["icon-btn", "app-header__cart", isActive ? "app-header__cart--active" : ""].filter(Boolean).join(" ")
              }
              onClick={() => afterNav(closeMobileMenu, blurRailFocus)}
              title={t("nav.cart")}
              aria-label={t("nav.cart")}
            >
              <IconCart />
              {cartCount > 0 ? <span className="sidebar__badge app-header__cart-badge">{cartCount > 99 ? "99+" : cartCount}</span> : null}
            </NavLink>
          ) : null}
          {!prefsInDrawer ? (
            <>
              <label className="field-inline app-header__lang" htmlFor="header-lang">
                <span className="field-inline__label">{t("lang.label")}</span>
                <SearchableSelect
                  id="header-lang"
                  className="searchable-select--compact"
                  value={lang}
                  onChange={(v) => {
                    void setLang(v);
                  }}
                  options={LANG_OPTIONS}
                  allowEmpty={false}
                  portal
                />
              </label>
              <ThemeSwitch />
            </>
          ) : null}
          <NotificationBell />
          {canReception(role) ? (
            <button
              type="button"
              className="icon-btn"
              title={t("nav.scan_order_qr")}
              aria-label={t("nav.scan_order_qr")}
              onClick={() => setQrScanOpen(true)}
            >
              <IconQrScan />
            </button>
          ) : null}
          <button type="button" className="icon-btn" onClick={logout} title={t("nav.logout")} aria-label={t("nav.logout")}>
            <IconLogout />
          </button>
        </div>
      </header>

      {qrScanOpen ? (
        <OrderQrScannerModal
          onClose={() => setQrScanOpen(false)}
          onResolved={(orderId) => {
            setQrScanOpen(false);
            navigate(`/orders/${orderId}`);
          }}
        />
      ) : null}

      <div className="app-shell__body">
        {tabletUp ? (
          <aside className={asideClass} aria-label={t("nav.sidebar_label")}>
            <div className="sidebar__brand">
              <div className="sidebar__brand-row sidebar__brand-row--with-pin">
                <span className="sidebar__brand-sub sidebar__brand-sub--solo">{user?.email}</span>
                <button
                  type="button"
                  className="sidebar__pin-btn icon-btn"
                  onClick={() => {
                    setPinned((p) => !p);
                    setMobileMenuOpen(false);
                  }}
                  aria-pressed={pinned}
                  title={pinned ? t("nav.sidebar_unpin") : t("nav.sidebar_pin")}
                  aria-label={pinned ? t("nav.sidebar_unpin") : t("nav.sidebar_pin")}
                >
                  {pinned ? <IconPin /> : <IconPinOff />}
                </button>
              </div>
            </div>

            <nav className="sidebar__nav">
              {canShop(role) && (
                <div className="sidebar__group">
                  <div className="sidebar__group-label">{t("nav.group_shop")}</div>
                  <NavLink to="/catalog" className={({ isActive }) => itemClass(isActive)} onClick={() => blurRailFocus()}>
                    <IconShop />
                    <span>{t("nav.shop")}</span>
                  </NavLink>
                  <NavLink to="/orders" className={({ isActive }) => itemClass(isActive)} onClick={() => blurRailFocus()}>
                    <IconReception />
                    <span>{t("nav.my_orders")}</span>
                  </NavLink>
                </div>
              )}

              {canReception(role) && (
                <div className="sidebar__group">
                  <div className="sidebar__group-label">{t("nav.group_desk")}</div>
                  <NavLink to="/reception" className={({ isActive }) => itemClass(isActive)} onClick={() => blurRailFocus()}>
                    <IconReception />
                    <span>{t("nav.reception")}</span>
                  </NavLink>
                </div>
              )}

              {canManage(role) && (
                <div className="sidebar__group">
                  <div className="sidebar__group-label">{t("nav.group_manage")}</div>
                  <NavLink
                    to="/reports"
                    end
                    className={({ isActive }) => itemClass(isActive)}
                    onClick={() => blurRailFocus()}
                  >
                    <IconChart />
                    <span>{t("nav.reports")}</span>
                  </NavLink>
                  <NavLink to="/reports/ai" className={({ isActive }) => itemClass(isActive)} onClick={() => blurRailFocus()}>
                    <IconChart />
                    <span>{t("nav.reports_ai")}</span>
                  </NavLink>
                  <NavLink to="/tenant-settings" className={({ isActive }) => itemClass(isActive)} onClick={() => blurRailFocus()}>
                    <IconBuilding />
                    <span>{t("nav.tenant_settings")}</span>
                  </NavLink>
                  <NavLink to="/reference/staff" className={({ isActive }) => itemClass(isActive)} onClick={() => blurRailFocus()}>
                    <IconManager />
                    <span>{t("nav.staff_directory")}</span>
                  </NavLink>
                </div>
              )}

              {canManage(role) && (
                <div className="sidebar__group">
                  <div className="sidebar__group-label">{t("nav.group_reference")}</div>
                  <NavLink to="/reference/products" className={({ isActive }) => itemClass(isActive)} onClick={() => blurRailFocus()}>
                    <IconRefProducts />
                    <span>{t("nav.ref_products")}</span>
                  </NavLink>
                  <NavLink to="/reference/product-types" className={({ isActive }) => itemClass(isActive)} onClick={() => blurRailFocus()}>
                    <IconRefProductTypes />
                    <span>{t("nav.ref_product_types")}</span>
                  </NavLink>
                  <NavLink to="/reference/measure-units" className={({ isActive }) => itemClass(isActive)} onClick={() => blurRailFocus()}>
                    <IconRefMeasureUnits />
                    <span>{t("nav.ref_measure_units")}</span>
                  </NavLink>
                </div>
              )}

              {role === "ADMIN" && (
                <div className="sidebar__group">
                  <div className="sidebar__group-label">{t("nav.group_admin")}</div>
                  <NavLink to="/admin/licenses" className={({ isActive }) => itemClass(isActive)} onClick={() => blurRailFocus()}>
                    <IconBuilding />
                    <span>{t("nav.admin_licenses")}</span>
                  </NavLink>
                </div>
              )}
            </nav>
            <div className="sidebar__external">
              <a
                href={TRAINIFY_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="sidebar__item sidebar__item--external"
                title={t("nav.trainify_title")}
                onClick={() => blurRailFocus()}
              >
                <IconExternalLink />
                <span>{t("nav.trainify_link")}</span>
              </a>
            </div>
          </aside>
        ) : null}

        <div className="app-shell__main">
          <main className="app-main">
            <Outlet />
          </main>
        </div>
      </div>

      {isMobileQuickNav ? (
        <>
          <MobileNavDrawer
            open={mobileMenuOpen}
            onClose={closeMobileMenu}
            brandTitle={t("app.title")}
            sidebarGroups={mobileSidebarGroups}
            pinnedPaths={pinnedPathsSet}
            onTogglePin={togglePin}
            name={displayUserName}
            email={user?.email ?? ""}
            role={role}
            fabPaths={MOBILE_FAB_PATHS}
            onLogout={logout}
            t={t}
            preferences={drawerPreferences}
          />
          {mobileFooterTabs.length >= MOBILE_QUICK_MIN ? (
            <MobileFooterBar
              allTabPathsForNav={allMobileTabPaths}
              orderedTabs={mobileFooterTabs}
              onReorderPaths={onReorderPinnedPaths}
              reorderHint={t("nav.mobileNav.reorderHint")}
              doneLabel={t("nav.mobileNav.done")}
              t={t}
            />
          ) : null}
          {navFlash ? (
            <div className="toast toast--layout-flash" role="status">
              {navFlash}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
