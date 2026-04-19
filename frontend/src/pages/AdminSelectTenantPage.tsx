import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { InfoButton } from "../components/InfoButton";
import { SearchableSelect } from "../components/SearchableSelect";
import { useI18n } from "../i18n/I18nContext";

type TenantRow = { tenant_id: string; trade_name: string };

export function AdminSelectTenantPage() {
  const { t } = useI18n();
  const { user, adminTenantId, setAdminTenantId, refreshMe } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from;

  const [rows, setRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const role = user?.role || "";

  useEffect(() => {
    if (role !== "ADMIN") return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await apiFetch<TenantRow[]>("/api/v1/admin/tenants");
        if (cancelled) return;
        setRows(data);
        if (data.length === 1) setPick(data[0].tenant_id);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const options = useMemo(
    () => rows.map((r) => ({ value: r.tenant_id, label: r.trade_name ? `${r.trade_name} (${r.tenant_id})` : r.tenant_id })),
    [rows],
  );

  if (role !== "ADMIN") {
    return <Navigate to="/catalog" replace />;
  }

  if (adminTenantId) {
    return <Navigate to={from && from !== "/admin/select-tenant" ? from : "/catalog"} replace />;
  }

  async function onContinue() {
    const tid = pick.trim();
    if (!tid) {
      setErr(t("adminTenant.required"));
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      setAdminTenantId(tid);
      await refreshMe();
      nav(from && from !== "/admin/select-tenant" ? from : "/catalog", { replace: true });
    } catch (e) {
      setAdminTenantId(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="card login-screen__card" style={{ maxWidth: 440 }}>
        <div className="page-title-row" style={{ marginBottom: "0.5rem" }}>
          <h1 style={{ marginTop: 0 }}>{t("adminTenant.title")}</h1>
          <InfoButton label={t("adminTenant.title")} content={<p style={{ margin: 0 }}>{t("adminTenant.intro")}</p>} />
        </div>
        {loading ? <p>{t("common.loading")}</p> : null}
        {err ? <p style={{ color: "var(--danger)" }}>{err}</p> : null}
        {!loading && rows.length === 0 ? <p className="text-muted">{t("adminTenant.empty")}</p> : null}
        {!loading && rows.length > 0 ? (
          <div className="field">
            <label htmlFor="admin-tenant-pick">{t("adminTenant.field_label")}</label>
            <SearchableSelect
              id="admin-tenant-pick"
              value={pick}
              onChange={(v) => setPick(v)}
              options={options}
              allowEmpty={false}
              emptyLabel={t("adminTenant.placeholder")}
              portal
            />
          </div>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: "1rem" }}
          disabled={saving || loading || !rows.length}
          onClick={() => void onContinue()}
        >
          {saving ? t("common.loading") : t("adminTenant.continue")}
        </button>
      </div>
    </div>
  );
}
