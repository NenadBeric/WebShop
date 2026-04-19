import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, useLocation } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../api/client";
import { canManage, useAuth } from "../auth/AuthContext";
import { DatePicker } from "../components/DatePicker";
import { InfoButton } from "../components/InfoButton";
import { MobileCollapsibleFilters } from "../components/MobileCollapsibleFilters";
import { useI18n } from "../i18n/I18nContext";
import type { ShopReport } from "../types";

const CHART_MARGIN = { top: 8, right: 12, left: 4, bottom: 8 };
const STATUS_COLORS: Record<string, string> = {
  pending_confirm: "#f59e0b",
  partial_waiting_swap: "#a78bfa",
  ready: "#22c55e",
  picked_up: "#38bdf8",
  rejected: "#f87171",
  expired: "#64748b",
};

function monthRangeLocal(year: number, monthIndex: number): { from: Date; to: Date } {
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0);
  return { from, to };
}

function thisMonth(): { from: Date; to: Date } {
  const d = new Date();
  return monthRangeLocal(d.getFullYear(), d.getMonth());
}

function lastMonth(): { from: Date; to: Date } {
  const d = new Date();
  const y = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  const m = d.getMonth() === 0 ? 11 : d.getMonth() - 1;
  return monthRangeLocal(y, m);
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function parseMoney(s: string): number {
  const v = Number(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}

function localeFor(lang: string): string {
  if (lang === "sr") return "sr-Latn-RS";
  if (lang === "ru") return "ru-RU";
  if (lang === "zh") return "zh-CN";
  return "en-GB";
}

function fmtMoney(n: number, lang: string): string {
  return n.toLocaleString(localeFor(lang), { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function statusLabel(t: (k: string) => string, status: string) {
  const key = `status.${status}`;
  const m = t(key);
  return m === key ? status : m;
}

export function ReportsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const role = user?.role || "";
  const loc = useLocation();
  const embedUi = new URLSearchParams(loc.search).get("embed")?.toLowerCase();
  const isEmbed = embedUi === "1" || embedUi === "true" || embedUi === "yes";
  const [from, setFrom] = useState(() => toYmd(thisMonth().from));
  const [to, setTo] = useState(() => toYmd(thisMonth().to));
  const [preset, setPreset] = useState<"this" | "last" | null>("this");
  const [data, setData] = useState<ShopReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ date_from: from, date_to: to });
      const r = await apiFetch<ShopReport>(`/api/v1/reports/shop?${qs.toString()}`);
      setData(r);
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const pieData = useMemo(
    () =>
      (data?.by_status ?? []).map((row) => ({
        name: statusLabel(t, row.status),
        value: row.count,
        status: row.status,
      })),
    [data, t],
  );

  const dailyChart = useMemo(() => {
    return (data?.by_day ?? []).map((row) => ({
      day: row.day.slice(5),
      orders: row.orders,
      revenue: parseMoney(row.revenue_gross),
    }));
  }, [data]);

  const topProductsChart = useMemo(() => {
    return (data?.top_products ?? []).map((p) => ({
      name: p.product_name.length > 28 ? `${p.product_name.slice(0, 27)}…` : p.product_name,
      revenue: parseMoney(p.revenue_gross),
      qty: p.quantity_sold,
    }));
  }, [data]);

  const sourceChart = useMemo(() => {
    return (data?.by_source ?? []).map((s) => ({
      name: s.source_code,
      orders: s.orders,
      revenue: parseMoney(s.revenue_gross),
    }));
  }, [data]);

  if (!canManage(role)) {
    return <Navigate to="/catalog" replace />;
  }

  return (
    <div>
      <div className="page-title-row" style={{ marginBottom: "0.75rem" }}>
        <h1 style={{ marginTop: 0 }}>{t("reports.title")}</h1>
        <InfoButton label={t("reports.title")} content={<p style={{ margin: 0 }}>{t("reports.subtitle")}</p>} />
        {!isEmbed ? (
          <InfoButton
            label={t("reports.embed_link")}
            content={
              <div>
                <p style={{ margin: "0 0 0.5rem" }}>{t("reports.embed_hint")}</p>
                <NavLink to={`${loc.pathname}?embed=true`}>{t("reports.embed_link")}</NavLink>
              </div>
            }
          />
        ) : null}
      </div>

      <MobileCollapsibleFilters toggleLabel={t("common.filters_toggle")} className="shop-filters" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>{t("reports.period")}</h3>
        <div className="shop-filters-grid">
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="reports-from">{t("reports.date_from")}</label>
            <DatePicker
              id="reports-from"
              value={from}
              onChange={(v) => {
                setPreset(null);
                setFrom(v);
              }}
              portal
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="reports-to">{t("reports.date_to")}</label>
            <DatePicker
              id="reports-to"
              value={to}
              onChange={(v) => {
                setPreset(null);
                setTo(v);
              }}
              portal
            />
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button
            type="button"
            className={`btn${preset === "this" ? " btn-primary" : ""}`}
            onClick={() => {
              const { from: a, to: b } = thisMonth();
              setFrom(toYmd(a));
              setTo(toYmd(b));
              setPreset("this");
            }}
          >
            {t("reports.preset_this_month")}
          </button>
          <button
            type="button"
            className={`btn${preset === "last" ? " btn-primary" : ""}`}
            onClick={() => {
              const { from: a, to: b } = lastMonth();
              setFrom(toYmd(a));
              setTo(toYmd(b));
              setPreset("last");
            }}
          >
            {t("reports.preset_last_month")}
          </button>
          <button type="button" className="btn" disabled={loading} onClick={() => void load()}>
            {t("reports.refresh")}
          </button>
        </div>
      </MobileCollapsibleFilters>

      {loading && !data && <p>{t("common.loading")}</p>}
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      {data && (
        <>
          <div className="reports-kpi-grid">
            <div className="card reports-kpi">
              <p className="reports-kpi__label">{t("reports.kpi_orders_total")}</p>
              <p className="reports-kpi__value">{data.kpis.orders_total}</p>
            </div>
            <div className="card reports-kpi">
              <p className="reports-kpi__label">{t("reports.kpi_orders_open")}</p>
              <p className="reports-kpi__value">{data.kpis.orders_open}</p>
            </div>
            <div className="card reports-kpi">
              <p className="reports-kpi__label">{t("reports.kpi_orders_done")}</p>
              <p className="reports-kpi__value">{data.kpis.orders_ready_or_picked}</p>
            </div>
            <div className="card reports-kpi">
              <p className="reports-kpi__label">{t("reports.kpi_revenue_settled")}</p>
              <p className="reports-kpi__value">{fmtMoney(parseMoney(data.kpis.revenue_settled), lang)}</p>
            </div>
            <div className="card reports-kpi">
              <p className="reports-kpi__label">{t("reports.kpi_revenue_pipeline")}</p>
              <p className="reports-kpi__value">{fmtMoney(parseMoney(data.kpis.revenue_pipeline), lang)}</p>
            </div>
            <div className="card reports-kpi">
              <p className="reports-kpi__label">{t("reports.kpi_orders_lost")}</p>
              <p className="reports-kpi__value">{data.kpis.orders_rejected_or_expired}</p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>{t("reports.discount_title")}</h3>
            <InfoButton label={t("reports.discount_title")} content={<p style={{ margin: 0 }}>{t("reports.discount_hint")}</p>} />
            <div
              className="reports-kpi-grid"
              style={{ marginTop: "0.75rem", gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))" }}
            >
              <div>
                <p className="reports-kpi__label">{t("reports.discount_revenue")}</p>
                <p className="reports-kpi__value">
                  {fmtMoney(parseMoney(data.discount.revenue_gross_from_discounted_lines), lang)}
                </p>
              </div>
              <div>
                <p className="reports-kpi__label">{t("reports.discount_units")}</p>
                <p className="reports-kpi__value">{data.discount.units_sold_on_discounted_lines}</p>
              </div>
              <div>
                <p className="reports-kpi__label">{t("reports.discount_line_rows")}</p>
                <p className="reports-kpi__value">{data.discount.order_line_rows_on_sale}</p>
              </div>
              <div>
                <p className="reports-kpi__label">{t("reports.discount_catalog_now")}</p>
                <p className="reports-kpi__value">{data.discount.catalog_products_with_active_sale}</p>
              </div>
            </div>
          </div>

          <div className="reports-charts">
            <div className="card report-chart-card">
              <div className="page-title-row" style={{ marginBottom: "0.35rem" }}>
                <h3 style={{ marginTop: 0 }}>{t("reports.chart_status_title")}</h3>
                <InfoButton
                  label={t("reports.chart_status_title")}
                  content={<p style={{ margin: 0 }}>{t("reports.chart_status_hint")}</p>}
                />
              </div>
              <div className="report-chart-wrap">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }: { name?: string; percent?: number }) =>
                        `${name ?? ""} ${percent != null ? (percent * 100).toFixed(0) : 0}%`
                      }
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card report-chart-card">
              <div className="page-title-row" style={{ marginBottom: "0.35rem" }}>
                <h3 style={{ marginTop: 0 }}>{t("reports.chart_daily_title")}</h3>
                <InfoButton
                  label={t("reports.chart_daily_title")}
                  content={<p style={{ margin: 0 }}>{t("reports.chart_daily_hint")}</p>}
                />
              </div>
              <div className="report-chart-wrap">
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={dailyChart} margin={{ ...CHART_MARGIN, bottom: 28, left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" allowDecimals={false} width={36} tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      width={44}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => fmtMoney(Number(v), lang)}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) =>
                        name === t("reports.legend_revenue") ? fmtMoney(Number(value), lang) : String(value)
                      }
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="orders" fill="var(--accent)" name={t("reports.legend_orders")} />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="revenue"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      name={t("reports.legend_revenue")}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card report-chart-card">
              <div className="page-title-row" style={{ marginBottom: "0.35rem" }}>
                <h3 style={{ marginTop: 0 }}>{t("reports.chart_products_title")}</h3>
                <InfoButton
                  label={t("reports.chart_products_title")}
                  content={<p style={{ margin: 0 }}>{t("reports.chart_products_hint")}</p>}
                />
              </div>
              <div className="report-chart-wrap report-chart-wrap--tall">
                <ResponsiveContainer width="100%" height={Math.max(280, topProductsChart.length * 44)}>
                  <BarChart layout="vertical" data={topProductsChart} margin={{ ...CHART_MARGIN, left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => fmtMoney(Number(v), lang)} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fmtMoney(Number(v), lang)} />
                    <Bar dataKey="revenue" fill="var(--accent)" name={t("reports.legend_revenue")} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card report-chart-card">
              <div className="page-title-row" style={{ marginBottom: "0.35rem" }}>
                <h3 style={{ marginTop: 0 }}>{t("reports.chart_source_title")}</h3>
                <InfoButton
                  label={t("reports.chart_source_title")}
                  content={<p style={{ margin: 0 }}>{t("reports.chart_source_hint")}</p>}
                />
              </div>
              <div className="report-chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={sourceChart} margin={{ ...CHART_MARGIN, bottom: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} width={36} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="orders" fill="var(--accent)" name={t("reports.legend_orders")} />
                    <Bar dataKey="revenue" fill="#22c55e" name={t("reports.legend_revenue")} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
