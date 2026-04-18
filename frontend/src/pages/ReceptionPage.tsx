import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { DatePicker } from "../components/DatePicker";
import { InfoButton } from "../components/InfoButton";
import { MobileCollapsibleFilters } from "../components/MobileCollapsibleFilters";
import { SearchableSelect } from "../components/SearchableSelect";
import { orderStatusBadgeClass } from "../lib/orderStatusBadge";
import { useI18n } from "../i18n/I18nContext";
import type { OrderListItem, ReceptionDeskOut } from "../types";

const ORDER_STATUSES = [
  "pending_confirm",
  "partial_waiting_swap",
  "ready",
  "picked_up",
  "rejected",
  "expired",
] as const;

const FILTER_DEBOUNCE_MS = 350;

function statusLabel(t: (k: string) => string, status: string) {
  const key = `status.${status}`;
  const m = t(key);
  return m === key ? status : m;
}

function localeFor(lang: string): string {
  if (lang === "sr") return "sr-Latn-RS";
  if (lang === "ru") return "ru-RU";
  if (lang === "zh") return "zh-CN";
  return "en-GB";
}

function formatDateTime(iso: string | null | undefined, lang: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(localeFor(lang), {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

function pickupDisplay(o: OrderListItem, lang: string, t: (k: string) => string): string {
  if (o.pickup_at) return formatDateTime(o.pickup_at, lang);
  if (o.pickup_mode === "none") return "—";
  return t("orders.pickup_not_scheduled");
}

type OrdersListVariant = "staff" | "customer";

function OrdersList({
  variant,
  deskRefreshNonce = 0,
}: {
  variant: OrdersListVariant;
  /** Osvežava listu kad recepcija promeni lokaciju pulta. */
  deskRefreshNonce?: number;
}) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [rows, setRows] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const staffView = variant === "staff";

  const [search, setSearch] = useState("");
  const [buyer, setBuyer] = useState("");
  const [statusSel, setStatusSel] = useState<string[]>([]);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [pickupFrom, setPickupFrom] = useState("");
  const [pickupTo, setPickupTo] = useState("");
  const [sort, setSort] = useState("created_desc");
  const [refreshTick, setRefreshTick] = useState(0);

  const filtersRef = useRef({
    search,
    buyer,
    statusSel,
    createdFrom,
    createdTo,
    pickupFrom,
    pickupTo,
    sort,
  });
  filtersRef.current = {
    search,
    buyer,
    statusSel,
    createdFrom,
    createdTo,
    pickupFrom,
    pickupTo,
    sort,
  };

  const isFirstMountRef = useRef(true);
  const forceImmediateRef = useRef(false);

  const sortOptions = useMemo(
    () => [
      { v: "created_desc", k: "orders.sort.created_desc" },
      { v: "created_asc", k: "orders.sort.created_asc" },
      { v: "pickup_desc", k: "orders.sort.pickup_desc" },
      { v: "pickup_asc", k: "orders.sort.pickup_asc" },
      { v: "total_desc", k: "orders.sort.total_desc" },
      { v: "total_asc", k: "orders.sort.total_asc" },
      { v: "number_desc", k: "orders.sort.number_desc" },
      { v: "number_asc", k: "orders.sort.number_asc" },
    ],
    [],
  );

  const sortSearchOptions = useMemo(
    () => sortOptions.map((o) => ({ value: o.v, label: t(o.k) })),
    [sortOptions, t],
  );

  const hasOrderFiltersActive = useMemo(() => {
    if (search.trim()) return true;
    if (staffView && buyer.trim()) return true;
    if (statusSel.length > 0) return true;
    if (createdFrom || createdTo || pickupFrom || pickupTo) return true;
    if (sort !== "created_desc") return true;
    return false;
  }, [search, buyer, statusSel, createdFrom, createdTo, pickupFrom, pickupTo, sort, staffView]);

  const runFetch = useCallback(
    async (signal?: AbortSignal) => {
      const s = filtersRef.current;
      setLoading(true);
      setErr(null);
      try {
        const p = new URLSearchParams();
        if (s.search.trim()) p.set("search", s.search.trim());
        if (staffView && s.buyer.trim()) p.set("buyer", s.buyer.trim());
        if (s.statusSel.length) p.set("status", s.statusSel.join(","));
        if (s.createdFrom) p.set("created_from", s.createdFrom);
        if (s.createdTo) p.set("created_to", s.createdTo);
        if (s.pickupFrom) p.set("pickup_from", s.pickupFrom);
        if (s.pickupTo) p.set("pickup_to", s.pickupTo);
        if (s.sort) p.set("sort", s.sort);
        if (!staffView) p.set("mine", "true");
        const qs = p.toString();
        const data = await apiFetch<OrderListItem[]>(`/api/v1/orders${qs ? `?${qs}` : ""}`, { signal });
        setRows(data);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [staffView],
  );

  useEffect(() => {
    const ac = new AbortController();
    const immediate = isFirstMountRef.current || forceImmediateRef.current;
    isFirstMountRef.current = false;
    forceImmediateRef.current = false;
    const delay = immediate ? 0 : FILTER_DEBOUNCE_MS;
    const tid = window.setTimeout(() => {
      void runFetch(ac.signal);
    }, delay);
    return () => {
      window.clearTimeout(tid);
      ac.abort();
    };
  }, [
    search,
    buyer,
    statusSel,
    createdFrom,
    createdTo,
    pickupFrom,
    pickupTo,
    sort,
    staffView,
    refreshTick,
    deskRefreshNonce,
    runFetch,
  ]);

  function resetFilters() {
    forceImmediateRef.current = true;
    setSearch("");
    setBuyer("");
    setStatusSel([]);
    setCreatedFrom("");
    setCreatedTo("");
    setPickupFrom("");
    setPickupTo("");
    setSort("created_desc");
  }

  function refreshList() {
    forceImmediateRef.current = true;
    setRefreshTick((n) => n + 1);
  }

  function toggleStatus(st: string) {
    setStatusSel((prev) => (prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]));
  }

  function openOrder(id: number) {
    navigate(`/orders/${id}`);
  }

  if (loading && rows.length === 0 && !err) return <p>{t("common.loading")}</p>;
  if (err && rows.length === 0) return <p style={{ color: "var(--danger)" }}>{err}</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <div className="page-title-row" style={{ marginTop: 0 }}>
            <h1 style={{ marginTop: 0 }}>{staffView ? t("reception.title") : t("orders.list_title")}</h1>
            {!staffView ? (
              <InfoButton
                label={t("orders.list_title")}
                content={<p style={{ margin: 0 }}>{t("orders.list_hint")}</p>}
              />
            ) : null}
          </div>
        </div>
        <button type="button" className="btn" onClick={refreshList} disabled={loading}>
          {t("reception.refresh")}
        </button>
      </div>
      {staffView ? (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0 0 1rem", maxWidth: "42rem" }}>
          {t("reception.staff_personal_orders_hint")}{" "}
          <Link to="/catalog">{t("nav.shop")}</Link>
          {" · "}
          <Link to="/orders">{t("nav.my_orders")}</Link>
        </p>
      ) : null}

      <MobileCollapsibleFilters toggleLabel={t("common.filters_toggle")} className="shop-filters" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>{t("orders.filters_title")}</h3>
        <div className="shop-filters-grid">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t("orders.search_label")}</label>
            <input
              type="search"
              className="input-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("orders.search_placeholder")}
            />
          </div>
          {staffView ? (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>{t("orders.buyer_label")}</label>
              <input
                type="search"
                className="input-search"
                value={buyer}
                onChange={(e) => setBuyer(e.target.value)}
                placeholder={t("orders.buyer_placeholder")}
              />
            </div>
          ) : null}
          <div className="field" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
            <label>{t("orders.status_label")}</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              {ORDER_STATUSES.map((st) => (
                <label key={st} className="filter-check">
                  <input type="checkbox" checked={statusSel.includes(st)} onChange={() => toggleStatus(st)} />
                  <span className={orderStatusBadgeClass(st)}>{statusLabel(t, st)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="orders-created-from">{t("orders.created_from")}</label>
            <DatePicker id="orders-created-from" value={createdFrom} onChange={setCreatedFrom} portal />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="orders-created-to">{t("orders.created_to")}</label>
            <DatePicker id="orders-created-to" value={createdTo} onChange={setCreatedTo} portal />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="orders-pickup-from">{t("orders.pickup_from")}</label>
            <DatePicker id="orders-pickup-from" value={pickupFrom} onChange={setPickupFrom} portal />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="orders-pickup-to">{t("orders.pickup_to")}</label>
            <DatePicker id="orders-pickup-to" value={pickupTo} onChange={setPickupTo} portal />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="orders-sort">{t("orders.sort_label")}</label>
            <SearchableSelect
              id="orders-sort"
              value={sort}
              onChange={setSort}
              options={sortSearchOptions}
              allowEmpty={false}
              portal
            />
          </div>
        </div>
        {err && rows.length > 0 ? (
          <p style={{ color: "var(--danger)", marginTop: "0.75rem", marginBottom: 0 }} role="alert">
            {err}
          </p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button type="button" className="btn" onClick={resetFilters} disabled={loading}>
            {t("orders.reset_filters")}
          </button>
        </div>
      </MobileCollapsibleFilters>

      {loading && rows.length > 0 ? <p>{t("common.loading")}</p> : null}

      <div className="table-wrap card table-wrap--mobile-cards">
        <table>
          <thead>
            <tr>
              <th>{t("order.number")}</th>
              <th>{t("orders.col_created")}</th>
              <th>{t("orders.col_pickup")}</th>
              {staffView && <th>{t("reception.pickup_location_col")}</th>}
              <th>{t("order.status")}</th>
              <th>{t("reception.total_net")}</th>
              <th>{t("reception.total_vat")}</th>
              <th>{t("reception.total_gross")}</th>
              {!staffView && <th>{t("orders.action_needed")}</th>}
              {staffView && (
                <>
                  <th>{t("reception.first_name")}</th>
                  <th>{t("reception.last_name")}</th>
                  <th>{t("reception.email")}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 ? (
              <tr className="table-stack-empty">
                <td
                  colSpan={staffView ? 11 : 8}
                  style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem" }}
                >
                  {staffView
                    ? t("orders.empty_staff")
                    : hasOrderFiltersActive
                      ? t("orders.empty_staff")
                      : t("orders.empty_customer")}
                </td>
              </tr>
            ) : (
              rows.map((o) => (
                <tr
                  key={o.id}
                  className="row-order"
                  tabIndex={0}
                  role="button"
                  onClick={() => openOrder(o.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openOrder(o.id);
                    }
                  }}
                >
                  <td data-label={t("order.number")}>{o.order_number}</td>
                  <td data-label={t("orders.col_created")} style={{ fontSize: "0.85rem" }}>
                    {formatDateTime(o.created_at, lang)}
                  </td>
                  <td data-label={t("orders.col_pickup")} style={{ fontSize: "0.85rem" }}>
                    {pickupDisplay(o, lang, t)}
                  </td>
                  {staffView && (
                    <td data-label={t("reception.pickup_location_col")} style={{ fontSize: "0.85rem" }}>
                      {o.pickup_location_name?.trim() || (o.pickup_location_id != null ? `#${o.pickup_location_id}` : "—")}
                    </td>
                  )}
                  <td data-label={t("order.status")}>
                    <span className={orderStatusBadgeClass(o.status)}>{statusLabel(t, o.status)}</span>
                  </td>
                  <td data-label={t("reception.total_net")} style={{ fontSize: "0.85rem" }}>
                    {o.total_net ?? "—"}
                  </td>
                  <td data-label={t("reception.total_vat")} style={{ fontSize: "0.85rem" }}>
                    {o.total_vat ?? "—"}
                  </td>
                  <td data-label={t("reception.total_gross")} style={{ fontSize: "0.85rem" }}>
                    {o.total}
                  </td>
                  {!staffView && (
                    <td data-label={t("orders.action_needed")} style={{ fontSize: "0.85rem" }}>
                      {o.status === "partial_waiting_swap" ? (
                        <span className={orderStatusBadgeClass("partial_waiting_swap")}>{t("orders.badge_substitution")}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {staffView && (
                    <>
                      <td data-label={t("reception.first_name")}>{o.client_first_name || "—"}</td>
                      <td data-label={t("reception.last_name")}>{o.client_last_name || "—"}</td>
                      <td data-label={t("reception.email")}>{o.client_email}</td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReceptionPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isDeskOnly = user?.role === "WEBSHOP_RECEPTION";
  const [desk, setDesk] = useState<ReceptionDeskOut | null>(null);
  const [deskErr, setDeskErr] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [savingDesk, setSavingDesk] = useState(false);
  const [deskGateErr, setDeskGateErr] = useState<string | null>(null);

  const loadDesk = useCallback(async () => {
    const d = await apiFetch<ReceptionDeskOut>("/api/v1/me/reception-desk");
    setDesk(d);
    if (d.location_id != null) {
      setPick(String(d.location_id));
    } else if (d.locations.length === 1) {
      setPick(String(d.locations[0].id));
    } else {
      setPick("");
    }
  }, []);

  useEffect(() => {
    if (!isDeskOnly) return;
    setDeskErr(null);
    void loadDesk().catch((e) => {
      setDeskErr(e instanceof Error ? e.message : String(e));
    });
  }, [isDeskOnly, loadDesk]);

  async function saveDesk() {
    const id = parseInt(pick, 10);
    if (!id) {
      setDeskGateErr(t("checkout.pickup_location_required"));
      return;
    }
    setDeskGateErr(null);
    setSavingDesk(true);
    try {
      const d = await apiFetch<ReceptionDeskOut>("/api/v1/me/reception-desk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: id }),
      });
      setDeskGateErr(null);
      setDesk(d);
      setPick(String(d.location_id ?? id));
    } catch (e) {
      setDeskGateErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingDesk(false);
    }
  }

  if (isDeskOnly) {
    if (deskErr) {
      return (
        <p style={{ color: "var(--danger)" }}>
          {t("reception.desk_load_error")} {deskErr}
        </p>
      );
    }
    if (desk === null) {
      return <p>{t("common.loading")}</p>;
    }
    if (!desk.locations.length) {
      return (
        <div className="card" style={{ maxWidth: "40rem" }}>
          <h1 style={{ marginTop: 0 }}>{t("reception.desk_title")}</h1>
          <p style={{ color: "var(--danger)", marginBottom: 0 }}>{t("reception.desk_no_locations")}</p>
        </div>
      );
    }
    if (desk.location_id == null) {
      return (
        <div className="card" style={{ maxWidth: "40rem" }}>
          <h1 style={{ marginTop: 0 }}>{t("reception.desk_title")}</h1>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>{t("reception.desk_gate_hint")}</p>
          <div className="field">
            <label htmlFor="reception-desk-loc">{t("reception.desk_location_label")}</label>
            <select
              id="reception-desk-loc"
              className="input"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              required
            >
              <option value="">{t("checkout.pickup_location_placeholder")}</option>
              {desk.locations.map((loc) => (
                <option key={loc.id} value={String(loc.id)}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
          {deskGateErr ? (
            <p style={{ color: "var(--danger)" }} role="alert">
              {deskGateErr}
            </p>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => void saveDesk()} disabled={savingDesk || !pick}>
            {savingDesk ? t("reception.desk_saving") : t("reception.desk_save")}
          </button>
        </div>
      );
    }
  }

  return (
    <div>
      {isDeskOnly && desk && desk.location_id != null ? (
        <div className="card" style={{ marginBottom: "1rem", maxWidth: "48rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0, minWidth: "12rem", flex: "1 1 14rem" }}>
              <label htmlFor="reception-desk-loc-bar">{t("reception.desk_current")}</label>
              <select
                id="reception-desk-loc-bar"
                className="input"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
              >
                {desk.locations.map((loc) => (
                  <option key={loc.id} value={String(loc.id)}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => void saveDesk()}
              disabled={savingDesk || pick === String(desk.location_id)}
            >
              {savingDesk ? t("reception.desk_saving") : t("reception.desk_save")}
            </button>
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 0, marginTop: "0.5rem" }}>
            {t("reception.desk_change_hint")}
          </p>
          {deskGateErr ? (
            <p style={{ color: "var(--danger)", marginTop: "0.5rem", marginBottom: 0 }} role="alert">
              {deskGateErr}
            </p>
          ) : null}
        </div>
      ) : null}
      <OrdersList variant="staff" deskRefreshNonce={desk?.location_id ?? 0} />
    </div>
  );
}

export function CustomerOrdersPage() {
  return <OrdersList variant="customer" />;
}
