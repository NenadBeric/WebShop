import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { InfoButton } from "../components/InfoButton";
import { SearchableSelect } from "../components/SearchableSelect";
import { useI18n } from "../i18n/I18nContext";

type Plan = {
  id: number;
  code: string;
  name: string;
  max_pickup_locations: number | null;
  max_staff_seats: number | null;
  max_products: number | null;
  max_orders_per_month: number | null;
  max_distinct_buyers_30d: number | null;
  price: number | null;
  is_active: boolean;
};

type SubscriptionRow = {
  id: number;
  tenant_id: string;
  plan: Plan;
  status: string;
  billing_cycle: string;
  discount_percent: number;
  valid_from: string | null;
  valid_to: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  auto_renew: boolean;
  addons: { id: number; addon_code: string; quantity: number }[];
};

type Usage = {
  tenant_id: string;
  limits: Record<string, number | null>;
  usage: Record<string, number>;
  remaining: Record<string, number | null>;
};

type TenantBrief = { tenant_id: string; trade_name: string };

function parseOptionalInt(s: string): number | null {
  const x = s.trim();
  if (!x) return null;
  const n = Number(x);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function parseOptionalFloat(s: string): number | null {
  const x = s.trim();
  if (!x) return null;
  const n = Number(x);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

const SUB_STATUSES = ["ACTIVE", "PAST_DUE", "SUSPENDED", "EXPIRED", "CANCELLED"] as const;
const BILLING_CYCLES = ["MONTHLY", "SEMI_ANNUAL", "ANNUAL"] as const;

function toDateInputValue(v: string | null): string {
  if (!v) return "";
  return v.length >= 10 ? v.slice(0, 10) : v;
}

export function LicenseAdminPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [tenants, setTenants] = useState<TenantBrief[]>([]);
  const [tenantId, setTenantId] = useState(user?.tenant_id || "");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [assignPlanId, setAssignPlanId] = useState<number>(0);
  const [assignStatus, setAssignStatus] = useState<string>("ACTIVE");
  const [assignBilling, setAssignBilling] = useState<string>("MONTHLY");
  const [assignDiscount, setAssignDiscount] = useState("0");
  const [assignValidFrom, setAssignValidFrom] = useState("");
  const [assignValidTo, setAssignValidTo] = useState("");
  const [assignAutoRenew, setAssignAutoRenew] = useState(false);

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [pCode, setPCode] = useState("");
  const [pName, setPName] = useState("");
  const [pLoc, setPLoc] = useState("");
  const [pStaff, setPStaff] = useState("");
  const [pProd, setPProd] = useState("");
  const [pOrd, setPOrd] = useState("");
  const [pBuy, setPBuy] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pActive, setPActive] = useState(true);

  const [patchPlanModalOpen, setPatchPlanModalOpen] = useState(false);
  const [patchPlanErr, setPatchPlanErr] = useState<string | null>(null);
  const [patchPlanRowId, setPatchPlanRowId] = useState<number | null>(null);
  const [epCode, setEpCode] = useState("");
  const [epName, setEpName] = useState("");
  const [epLoc, setEpLoc] = useState("");
  const [epStaff, setEpStaff] = useState("");
  const [epProd, setEpProd] = useState("");
  const [epOrd, setEpOrd] = useState("");
  const [epBuy, setEpBuy] = useState("");
  const [epPrice, setEpPrice] = useState("");
  const [epActive, setEpActive] = useState(true);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [bulkFilter, setBulkFilter] = useState("");
  const [bulkPick, setBulkPick] = useState<Record<string, boolean>>({});
  const [bulkPlanId, setBulkPlanId] = useState(0);
  const [bulkStatus, setBulkStatus] = useState("ACTIVE");
  const [bulkBilling, setBulkBilling] = useState("MONTHLY");
  const [bulkDiscount, setBulkDiscount] = useState("0");
  const [bulkValidFrom, setBulkValidFrom] = useState("");
  const [bulkValidTo, setBulkValidTo] = useState("");
  const [bulkAutoRenew, setBulkAutoRenew] = useState(false);
  const [bulkBlockedReason, setBulkBlockedReason] = useState("");

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<SubscriptionRow | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockErr, setBlockErr] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SubscriptionRow | null>(null);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editPlanId, setEditPlanId] = useState(0);
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editBilling, setEditBilling] = useState("MONTHLY");
  const [editDiscount, setEditDiscount] = useState("0");
  const [editValidFrom, setEditValidFrom] = useState("");
  const [editValidTo, setEditValidTo] = useState("");
  const [editAutoRenew, setEditAutoRenew] = useState(false);
  const [editBlockedReason, setEditBlockedReason] = useState("");

  const loadPlans = useCallback(async () => {
    setErr(null);
    const rows = await apiFetch<Plan[]>("/api/v1/admin/licenses/plans");
    setPlans(rows);
    setAssignPlanId((prev) => (prev === 0 && rows[0] ? rows[0].id : prev));
    setBulkPlanId((prev) => (prev === 0 && rows[0] ? rows[0].id : prev));
  }, []);

  const loadSubs = useCallback(async () => {
    const rows = await apiFetch<SubscriptionRow[]>("/api/v1/admin/licenses/subscriptions");
    setSubs(rows);
  }, []);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    void Promise.all([loadPlans(), loadSubs()]).catch((e: Error) => setErr(e.message));
  }, [loadPlans, loadSubs, user?.role]);

  useEffect(() => {
    if (user?.role === "ADMIN" && (user.tenant_id || "").trim()) {
      setTenantId((user.tenant_id || "").trim());
    }
  }, [user?.role, user?.tenant_id]);

  const openPlanModal = () => {
    setPlanErr(null);
    setPCode("");
    setPName("");
    setPLoc("");
    setPStaff("");
    setPProd("");
    setPOrd("");
    setPBuy("");
    setPPrice("");
    setPActive(true);
    setPlanModalOpen(true);
  };

  const submitPlan = async (e: FormEvent) => {
    e.preventDefault();
    setPlanErr(null);
    setBusy(true);
    try {
      await apiFetch<Plan>("/api/v1/admin/licenses/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: pCode.trim(),
          name: pName.trim(),
          max_pickup_locations: parseOptionalInt(pLoc),
          max_staff_seats: parseOptionalInt(pStaff),
          max_products: parseOptionalInt(pProd),
          max_orders_per_month: parseOptionalInt(pOrd),
          max_distinct_buyers_30d: parseOptionalInt(pBuy),
          price: parseOptionalFloat(pPrice),
          is_active: pActive,
        }),
      });
      setPlanModalOpen(false);
      await loadPlans();
    } catch (e2) {
      setPlanErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  const openEditPlanModal = (plan: Plan) => {
    setPatchPlanErr(null);
    setPatchPlanRowId(plan.id);
    setEpCode(plan.code);
    setEpName(plan.name);
    setEpLoc(plan.max_pickup_locations != null ? String(plan.max_pickup_locations) : "");
    setEpStaff(plan.max_staff_seats != null ? String(plan.max_staff_seats) : "");
    setEpProd(plan.max_products != null ? String(plan.max_products) : "");
    setEpOrd(plan.max_orders_per_month != null ? String(plan.max_orders_per_month) : "");
    setEpBuy(plan.max_distinct_buyers_30d != null ? String(plan.max_distinct_buyers_30d) : "");
    setEpPrice(plan.price != null ? String(plan.price) : "");
    setEpActive(plan.is_active);
    setPatchPlanModalOpen(true);
  };

  const submitEditPlan = async (e: FormEvent) => {
    e.preventDefault();
    if (patchPlanRowId == null) return;
    setPatchPlanErr(null);
    setBusy(true);
    try {
      await apiFetch<Plan>(`/api/v1/admin/licenses/plans/${patchPlanRowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: epName.trim(),
          max_pickup_locations: parseOptionalInt(epLoc),
          max_staff_seats: parseOptionalInt(epStaff),
          max_products: parseOptionalInt(epProd),
          max_orders_per_month: parseOptionalInt(epOrd),
          max_distinct_buyers_30d: parseOptionalInt(epBuy),
          price: parseOptionalFloat(epPrice),
          is_active: epActive,
        }),
      });
      setPatchPlanModalOpen(false);
      setPatchPlanRowId(null);
      await Promise.all([loadPlans(), loadSubs()]);
    } catch (e2) {
      setPatchPlanErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  const openBulk = async () => {
    setBulkErr(null);
    setBulkFilter("");
    setBulkPick({});
    setBulkBlockedReason("");
    if (plans[0]) setBulkPlanId(plans[0].id);
    setBulkOpen(true);
    try {
      const list = await apiFetch<TenantBrief[]>("/api/v1/admin/tenants");
      setTenants(list);
    } catch (e2) {
      setBulkErr(e2 instanceof Error ? e2.message : String(e2));
    }
  };

  const filteredTenants = useMemo(() => {
    const q = bulkFilter.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((x) => x.tenant_id.toLowerCase().includes(q) || (x.trade_name || "").toLowerCase().includes(q));
  }, [bulkFilter, tenants]);

  const bulkSelectedIds = useMemo(() => Object.keys(bulkPick).filter((k) => bulkPick[k]), [bulkPick]);

  const licensePlanSearchOptions = useMemo(
    () =>
      plans.map((p) => ({
        value: String(p.id),
        label: `${p.code} — ${p.name}${!p.is_active ? ` (${t("licensesAdmin.inactive_plan")})` : ""}`,
      })),
    [plans, t],
  );
  const licenseSubStatusOptions = useMemo(() => SUB_STATUSES.map((st) => ({ value: st, label: st })), []);
  const licenseBillingOptions = useMemo(() => BILLING_CYCLES.map((bc) => ({ value: bc, label: bc })), []);

  const submitBulk = async (e: FormEvent) => {
    e.preventDefault();
    if (!bulkPlanId || !bulkSelectedIds.length) return;
    setBulkErr(null);
    setBusy(true);
    try {
      await apiFetch<SubscriptionRow[]>("/api/v1/admin/licenses/subscriptions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_ids: bulkSelectedIds,
          plan_id: bulkPlanId,
          status: bulkStatus,
          billing_cycle: bulkBilling,
          discount_percent: Math.min(100, Math.max(0, parseInt(bulkDiscount, 10) || 0)),
          valid_from: bulkValidFrom.trim() || null,
          valid_to: bulkValidTo.trim() || null,
          auto_renew: bulkAutoRenew,
          blocked_reason: bulkBlockedReason.trim() || null,
        }),
      });
      setBulkOpen(false);
      await loadSubs();
    } catch (e2) {
      setBulkErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  const loadUsage = async () => {
    const tid = tenantId.trim();
    if (!tid) {
      setErr(t("licensesAdmin.usage_need_tenant"));
      setUsage(null);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const u = await apiFetch<Usage>(`/api/v1/admin/licenses/usage/${encodeURIComponent(tid)}`);
      setUsage(u);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runSeed = async () => {
    setBusy(true);
    setSeedMsg(null);
    setErr(null);
    try {
      const r = await apiFetch<{ created_plan_codes: string[] }>("/api/v1/admin/licenses/seed-default-plans", {
        method: "POST",
      });
      setSeedMsg(r.created_plan_codes.length ? r.created_plan_codes.join(", ") : "—");
      await loadPlans();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const assignSubscription = async () => {
    if (!assignPlanId) return;
    if (!tenantId.trim()) {
      setErr(t("licensesAdmin.usage_need_tenant"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/api/v1/admin/licenses/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId.trim(),
          plan_id: assignPlanId,
          status: assignStatus,
          billing_cycle: assignBilling,
          discount_percent: Math.min(100, Math.max(0, parseInt(assignDiscount, 10) || 0)),
          valid_from: assignValidFrom.trim() || null,
          valid_to: assignValidTo.trim() || null,
          auto_renew: assignAutoRenew,
        }),
      });
      await loadUsage();
      await loadSubs();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openBlockModal = (s: SubscriptionRow) => {
    setBlockErr(null);
    setBlockTarget(s);
    setBlockReason(t("licensesAdmin.block_reason_default"));
    setBlockOpen(true);
  };

  const submitBlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!blockTarget) return;
    setBlockErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/admin/licenses/subscriptions/${blockTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked_reason: blockReason.trim() || t("licensesAdmin.block_reason_default") }),
      });
      setBlockOpen(false);
      setBlockTarget(null);
      await loadSubs();
    } catch (e2) {
      setBlockErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  const unblockSubscription = async (s: SubscriptionRow) => {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/v1/admin/licenses/subscriptions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked_reason: null }),
      });
      await loadSubs();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openEditModal = (s: SubscriptionRow) => {
    setEditErr(null);
    setEditTarget(s);
    setEditPlanId(s.plan.id);
    setEditStatus(s.status);
    setEditBilling(s.billing_cycle);
    setEditDiscount(String(s.discount_percent ?? 0));
    setEditValidFrom(toDateInputValue(s.valid_from));
    setEditValidTo(toDateInputValue(s.valid_to));
    setEditAutoRenew(Boolean(s.auto_renew));
    setEditBlockedReason((s.blocked_reason || "").trim());
    setEditOpen(true);
  };

  const submitEditSubscription = async (e: FormEvent) => {
    e.preventDefault();
    if (!editTarget || !editPlanId) return;
    const editedTenantId = editTarget.tenant_id;
    setEditErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/admin/licenses/subscriptions/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: editPlanId,
          status: editStatus,
          billing_cycle: editBilling,
          discount_percent: Math.min(100, Math.max(0, parseInt(editDiscount, 10) || 0)),
          valid_from: editValidFrom.trim() || null,
          valid_to: editValidTo.trim() || null,
          auto_renew: editAutoRenew,
          blocked_reason: editBlockedReason.trim() ? editBlockedReason.trim() : null,
        }),
      });
      setEditOpen(false);
      setEditTarget(null);
      await loadSubs();
      if (tenantId.trim() === editedTenantId) {
        const u = await apiFetch<Usage>(`/api/v1/admin/licenses/usage/${encodeURIComponent(tenantId.trim())}`);
        setUsage(u);
      }
    } catch (e2) {
      setEditErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  if (user?.role !== "ADMIN") {
    return <Navigate to="/catalog" replace />;
  }

  const isBlocked = (s: SubscriptionRow) =>
    Boolean(s.blocked_at) || Boolean((s.blocked_reason || "").trim());

  return (
    <div style={{ padding: "1rem", maxWidth: 1100 }}>
      <div className="page-title-row" style={{ marginBottom: "0.75rem" }}>
        <h1>{t("licensesAdmin.title")}</h1>
        <InfoButton label={t("licensesAdmin.title")} content={<p style={{ margin: 0 }}>{t("licensesAdmin.lead")}</p>} />
      </div>

      {err ? (
        <div className="card" style={{ marginBottom: "1rem", color: "var(--danger, #b91c1c)" }}>
          {err}
        </div>
      ) : null}
      {seedMsg ? (
        <div className="card" style={{ marginBottom: "1rem" }}>
          {t("licensesAdmin.seed_created")}: {seedMsg}
        </div>
      ) : null}

      <section className="card" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0, flex: "1 1 auto" }}>{t("licensesAdmin.plans")}</h2>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={openPlanModal}>
            {t("licensesAdmin.add_plan")}
          </button>
          <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => void runSeed()}>
            {t("licensesAdmin.seed_defaults")}
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t("licensesAdmin.code")}</th>
                <th>{t("licensesAdmin.name")}</th>
                <th>{t("licensesAdmin.col_locations")}</th>
                <th>{t("licensesAdmin.col_staff")}</th>
                <th>{t("licensesAdmin.col_products")}</th>
                <th>{t("licensesAdmin.col_orders_mo")}</th>
                <th>{t("licensesAdmin.col_buyers")}</th>
                <th>{t("licensesAdmin.col_price")}</th>
                <th>{t("licensesAdmin.active")}</th>
                <th>{t("order.col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.code}</td>
                  <td>{p.name}</td>
                  <td>{p.max_pickup_locations ?? "∞"}</td>
                  <td>{p.max_staff_seats ?? "∞"}</td>
                  <td>{p.max_products ?? "∞"}</td>
                  <td>{p.max_orders_per_month ?? "∞"}</td>
                  <td>{p.max_distinct_buyers_30d ?? "∞"}</td>
                  <td>{p.price ?? "—"}</td>
                  <td>{p.is_active ? "✓" : "—"}</td>
                  <td className="table-cell--stack-actions">
                    <button type="button" className="btn" disabled={busy} onClick={() => openEditPlanModal(p)}>
                      {t("licensesAdmin.edit_plan")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0, flex: "1 1 auto" }}>{t("licensesAdmin.subscriptions")}</h2>
          <button type="button" className="btn" disabled={busy} onClick={() => void loadSubs().catch((e: Error) => setErr(e.message))}>
            {t("licensesAdmin.reload_subscriptions")}
          </button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void openBulk()}>
            {t("licensesAdmin.bulk_assign")}
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("licensesAdmin.col_tenant")}</th>
                <th>{t("licensesAdmin.plan")}</th>
                <th>{t("licensesAdmin.col_status")}</th>
                <th>{t("licensesAdmin.col_blocked")}</th>
                <th>{t("licensesAdmin.col_id_sub")}</th>
                <th>{t("order.col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td>
                    <code>{s.tenant_id}</code>
                  </td>
                  <td>
                    {s.plan.code} — {s.plan.name}
                  </td>
                  <td>{s.status}</td>
                  <td>{isBlocked(s) ? t("licensesAdmin.blocked_yes") : t("licensesAdmin.blocked_no")}</td>
                  <td>{s.id}</td>
                  <td className="table-cell--stack-actions">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                      <button type="button" className="btn" disabled={busy} onClick={() => openEditModal(s)}>
                        {t("licensesAdmin.edit_subscription")}
                      </button>
                      {isBlocked(s) ? (
                        <button type="button" className="btn" disabled={busy} onClick={() => void unblockSubscription(s)}>
                          {t("licensesAdmin.unblock")}
                        </button>
                      ) : (
                        <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => openBlockModal(s)}>
                          {t("licensesAdmin.block")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>{t("licensesAdmin.tenant_section")}</h2>
        <div className="field">
          <label>tenant_id</label>
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} spellCheck={false} />
        </div>
        <button type="button" className="btn" disabled={busy || !tenantId.trim()} onClick={() => void loadUsage()}>
          {t("licensesAdmin.load_usage")}
        </button>

        {usage ? (
          <div style={{ marginTop: "1rem" }}>
            <h3>{t("licensesAdmin.usage_title")}</h3>
            <pre style={{ fontSize: 12, overflow: "auto" }}>{JSON.stringify(usage, null, 2)}</pre>
          </div>
        ) : null}

        <h3>{t("licensesAdmin.assign")}</h3>
        <div className="field">
          <label htmlFor="licenses-assign-plan">{t("licensesAdmin.plan")}</label>
          <SearchableSelect
            id="licenses-assign-plan"
            value={plans.length ? String(assignPlanId) : ""}
            onChange={(v) => setAssignPlanId(Number(v))}
            options={licensePlanSearchOptions}
            allowEmpty={false}
            disabled={busy || !plans.length}
            portal
          />
        </div>
        <div className="field">
          <label htmlFor="licenses-assign-status">{t("licensesAdmin.col_status")}</label>
          <SearchableSelect
            id="licenses-assign-status"
            value={assignStatus}
            onChange={setAssignStatus}
            options={licenseSubStatusOptions}
            allowEmpty={false}
            disabled={busy}
            portal
          />
        </div>
        <div className="field">
          <label htmlFor="licenses-assign-billing">{t("licensesAdmin.billing_cycle")}</label>
          <SearchableSelect
            id="licenses-assign-billing"
            value={assignBilling}
            onChange={setAssignBilling}
            options={licenseBillingOptions}
            allowEmpty={false}
            disabled={busy}
            portal
          />
        </div>
        <div className="field">
          <label>{t("licensesAdmin.discount")}</label>
          <input type="number" min={0} max={100} value={assignDiscount} onChange={(e) => setAssignDiscount(e.target.value)} />
        </div>
        <div className="field">
          <label>{t("licensesAdmin.valid_from")}</label>
          <input type="date" value={assignValidFrom} onChange={(e) => setAssignValidFrom(e.target.value)} />
        </div>
        <div className="field">
          <label>{t("licensesAdmin.valid_to")}</label>
          <input type="date" value={assignValidTo} onChange={(e) => setAssignValidTo(e.target.value)} />
        </div>
        <label style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginBottom: "0.75rem" }}>
          <input type="checkbox" checked={assignAutoRenew} onChange={(e) => setAssignAutoRenew(e.target.checked)} />
          {t("licensesAdmin.auto_renew")}
        </label>
        <button type="button" className="btn btn--primary" disabled={busy || !plans.length} onClick={() => void assignSubscription()}>
          {t("licensesAdmin.save_subscription")}
        </button>
      </section>

      <section className="card" style={{ padding: "1rem" }}>
        <div className="page-title-row" style={{ marginBottom: "0.5rem" }}>
          <h2 style={{ marginTop: 0 }}>{t("licensesAdmin.addons_title")}</h2>
          <InfoButton label={t("licensesAdmin.addons_title")} content={<p style={{ margin: 0 }}>{t("licensesAdmin.addons_hint")}</p>} />
        </div>
        <ul style={{ fontSize: 14 }}>
          <li>
            <code>ADD_LOCATION</code> — +1 aktivna lokacija
          </li>
          <li>
            <code>ADD_STAFF_SEAT</code> — +1 mesto zaposlenog (recepcija/menadžment)
          </li>
          <li>
            <code>ADD_PRODUCTS_100</code> — +100 × količina proizvoda u katalogu
          </li>
          <li>
            <code>ADD_MONTHLY_ORDERS_500</code> — +500 × količina porudžbina/mesec
          </li>
          <li>
            <code>ADD_DISTINCT_BUYERS_10</code> — +10 × količina jedinstvenih kupaca (30 d)
          </li>
        </ul>
      </section>

      {planModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !busy && setPlanModalOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="page-title-row" style={{ marginTop: 0, marginBottom: "0.5rem" }}>
              <h2 style={{ marginTop: 0 }}>{t("licensesAdmin.modal_plan_title")}</h2>
              <InfoButton label={t("licensesAdmin.modal_plan_title")} content={<p style={{ margin: 0 }}>{t("licensesAdmin.unlimited_hint")}</p>} />
            </div>
            <form onSubmit={(e) => void submitPlan(e)}>
              <div className="field">
                <label>{t("licensesAdmin.field_code")}</label>
                <input value={pCode} onChange={(e) => setPCode(e.target.value)} required minLength={2} spellCheck={false} />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.field_name")}</label>
                <input value={pName} onChange={(e) => setPName(e.target.value)} required />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.col_locations")}</label>
                <input value={pLoc} onChange={(e) => setPLoc(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.col_staff")}</label>
                <input value={pStaff} onChange={(e) => setPStaff(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.col_products")}</label>
                <input value={pProd} onChange={(e) => setPProd(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.col_orders_mo")}</label>
                <input value={pOrd} onChange={(e) => setPOrd(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.col_buyers")}</label>
                <input value={pBuy} onChange={(e) => setPBuy(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.price_optional")}</label>
                <input value={pPrice} onChange={(e) => setPPrice(e.target.value)} inputMode="decimal" />
              </div>
              <label style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginBottom: "0.75rem" }}>
                <input type="checkbox" checked={pActive} onChange={(e) => setPActive(e.target.checked)} />
                {t("licensesAdmin.active")}
              </label>
              {planErr ? <p style={{ color: "var(--danger)" }}>{planErr}</p> : null}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="btn" disabled={busy} onClick={() => setPlanModalOpen(false)}>
                  {t("licensesAdmin.cancel")}
                </button>
                <button type="submit" className="btn btn--primary" disabled={busy}>
                  {t("licensesAdmin.save_plan")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {patchPlanModalOpen && patchPlanRowId != null ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !busy && setPatchPlanModalOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="page-title-row" style={{ marginTop: 0, marginBottom: "0.5rem" }}>
              <h2 style={{ marginTop: 0 }}>{t("licensesAdmin.modal_edit_plan_title")}</h2>
              <InfoButton label={t("licensesAdmin.modal_edit_plan_title")} content={<p style={{ margin: 0 }}>{t("licensesAdmin.unlimited_hint")}</p>} />
            </div>
            <form onSubmit={(e) => void submitEditPlan(e)}>
              <div className="field">
                <div className="field__label-row">
                  <label>{t("licensesAdmin.field_code")}</label>
                  <InfoButton label={t("licensesAdmin.field_code")} content={<p style={{ margin: 0 }}>{t("licensesAdmin.plan_code_readonly")}</p>} />
                </div>
                <input value={epCode} readOnly className="input" style={{ opacity: 0.9 }} spellCheck={false} aria-readonly />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.field_name")}</label>
                <input value={epName} onChange={(e) => setEpName(e.target.value)} required />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.col_locations")}</label>
                <input value={epLoc} onChange={(e) => setEpLoc(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.col_staff")}</label>
                <input value={epStaff} onChange={(e) => setEpStaff(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.col_products")}</label>
                <input value={epProd} onChange={(e) => setEpProd(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.col_orders_mo")}</label>
                <input value={epOrd} onChange={(e) => setEpOrd(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.col_buyers")}</label>
                <input value={epBuy} onChange={(e) => setEpBuy(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.price_optional")}</label>
                <input value={epPrice} onChange={(e) => setEpPrice(e.target.value)} inputMode="decimal" />
              </div>
              <label style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginBottom: "0.75rem" }}>
                <input type="checkbox" checked={epActive} onChange={(e) => setEpActive(e.target.checked)} />
                {t("licensesAdmin.active")}
              </label>
              {patchPlanErr ? <p style={{ color: "var(--danger)" }}>{patchPlanErr}</p> : null}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="btn" disabled={busy} onClick={() => setPatchPlanModalOpen(false)}>
                  {t("licensesAdmin.cancel")}
                </button>
                <button type="submit" className="btn btn--primary" disabled={busy}>
                  {t("licensesAdmin.save_changes")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {bulkOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !busy && setBulkOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: "90vh", overflow: "auto" }}>
            <h2 style={{ marginTop: 0 }}>{t("licensesAdmin.modal_bulk_title")}</h2>
            <form onSubmit={(e) => void submitBulk(e)}>
              <div className="field">
                <label>{t("licensesAdmin.tenant_pick")}</label>
                <input value={bulkFilter} onChange={(e) => setBulkFilter(e.target.value)} placeholder={t("licensesAdmin.tenant_filter_ph")} />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const next: Record<string, boolean> = { ...bulkPick };
                    for (const x of filteredTenants) next[x.tenant_id] = true;
                    setBulkPick(next);
                  }}
                >
                  {t("licensesAdmin.select_all_filtered")}
                </button>
                <button type="button" className="btn" onClick={() => setBulkPick({})}>
                  {t("licensesAdmin.select_none")}
                </button>
              </div>
              <div style={{ border: "1px solid var(--border, #ddd)", borderRadius: 6, padding: "0.5rem", maxHeight: 220, overflow: "auto", marginBottom: "1rem" }}>
                {filteredTenants.map((x) => (
                  <label key={x.tenant_id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.2rem 0" }}>
                    <input
                      type="checkbox"
                      checked={!!bulkPick[x.tenant_id]}
                      onChange={(e) => setBulkPick((prev) => ({ ...prev, [x.tenant_id]: e.target.checked }))}
                    />
                    <span>
                      <code>{x.tenant_id}</code> — {x.trade_name || "—"}
                    </span>
                  </label>
                ))}
              </div>
              <div className="field">
                <label htmlFor="licenses-bulk-plan">{t("licensesAdmin.plan")}</label>
                <SearchableSelect
                  id="licenses-bulk-plan"
                  value={plans.length ? String(bulkPlanId) : ""}
                  onChange={(v) => setBulkPlanId(Number(v))}
                  options={licensePlanSearchOptions}
                  allowEmpty={false}
                  disabled={busy || !plans.length}
                  portal
                />
              </div>
              <div className="field">
                <label htmlFor="licenses-bulk-status">{t("licensesAdmin.col_status")}</label>
                <SearchableSelect
                  id="licenses-bulk-status"
                  value={bulkStatus}
                  onChange={setBulkStatus}
                  options={licenseSubStatusOptions}
                  allowEmpty={false}
                  disabled={busy}
                  portal
                />
              </div>
              <div className="field">
                <label htmlFor="licenses-bulk-billing">{t("licensesAdmin.billing_cycle")}</label>
                <SearchableSelect
                  id="licenses-bulk-billing"
                  value={bulkBilling}
                  onChange={setBulkBilling}
                  options={licenseBillingOptions}
                  allowEmpty={false}
                  disabled={busy}
                  portal
                />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.discount")}</label>
                <input type="number" min={0} max={100} value={bulkDiscount} onChange={(e) => setBulkDiscount(e.target.value)} />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.valid_from")}</label>
                <input type="date" value={bulkValidFrom} onChange={(e) => setBulkValidFrom(e.target.value)} />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.valid_to")}</label>
                <input type="date" value={bulkValidTo} onChange={(e) => setBulkValidTo(e.target.value)} />
              </div>
              <label style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginBottom: "0.75rem" }}>
                <input type="checkbox" checked={bulkAutoRenew} onChange={(e) => setBulkAutoRenew(e.target.checked)} />
                {t("licensesAdmin.auto_renew")}
              </label>
              <div className="field">
                <label>{t("licensesAdmin.bulk_blocked_optional")}</label>
                <input value={bulkBlockedReason} onChange={(e) => setBulkBlockedReason(e.target.value)} placeholder={t("licensesAdmin.block_reason_placeholder")} />
              </div>
              {bulkErr ? <p style={{ color: "var(--danger)" }}>{bulkErr}</p> : null}
              <p className="text-muted" style={{ fontSize: 13 }}>
                {t("licensesAdmin.bulk_selected_count", { n: String(bulkSelectedIds.length) })}
              </p>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="btn" disabled={busy} onClick={() => setBulkOpen(false)}>
                  {t("licensesAdmin.cancel")}
                </button>
                <button type="submit" className="btn btn--primary" disabled={busy || !bulkSelectedIds.length || !bulkPlanId}>
                  {t("licensesAdmin.submit_bulk")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editOpen && editTarget ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !busy && setEditOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h2 style={{ marginTop: 0 }}>{t("licensesAdmin.modal_edit_title")}</h2>
            <p className="text-muted" style={{ fontSize: 14 }}>
              <code>{editTarget.tenant_id}</code>
            </p>
            <form onSubmit={(e) => void submitEditSubscription(e)}>
              <div className="field">
                <label htmlFor="licenses-edit-plan">{t("licensesAdmin.plan")}</label>
                <SearchableSelect
                  id="licenses-edit-plan"
                  value={plans.length ? String(editPlanId) : ""}
                  onChange={(v) => setEditPlanId(Number(v))}
                  options={licensePlanSearchOptions}
                  allowEmpty={false}
                  disabled={busy || !plans.length}
                  portal
                />
              </div>
              <div className="field">
                <label htmlFor="licenses-edit-status">{t("licensesAdmin.col_status")}</label>
                <SearchableSelect
                  id="licenses-edit-status"
                  value={editStatus}
                  onChange={setEditStatus}
                  options={licenseSubStatusOptions}
                  allowEmpty={false}
                  disabled={busy}
                  portal
                />
              </div>
              <div className="field">
                <label htmlFor="licenses-edit-billing">{t("licensesAdmin.billing_cycle")}</label>
                <SearchableSelect
                  id="licenses-edit-billing"
                  value={editBilling}
                  onChange={setEditBilling}
                  options={licenseBillingOptions}
                  allowEmpty={false}
                  disabled={busy}
                  portal
                />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.discount")}</label>
                <input type="number" min={0} max={100} value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.valid_from")}</label>
                <input type="date" value={editValidFrom} onChange={(e) => setEditValidFrom(e.target.value)} />
              </div>
              <div className="field">
                <label>{t("licensesAdmin.valid_to")}</label>
                <input type="date" value={editValidTo} onChange={(e) => setEditValidTo(e.target.value)} />
              </div>
              <label style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginBottom: "0.75rem" }}>
                <input type="checkbox" checked={editAutoRenew} onChange={(e) => setEditAutoRenew(e.target.checked)} />
                {t("licensesAdmin.auto_renew")}
              </label>
              <div className="field">
                <div className="field__label-row">
                  <label>{t("licensesAdmin.block_reason_label")}</label>
                  <InfoButton label={t("licensesAdmin.block_reason_label")} content={<p style={{ margin: 0 }}>{t("licensesAdmin.edit_blocked_hint")}</p>} />
                </div>
                <input value={editBlockedReason} onChange={(e) => setEditBlockedReason(e.target.value)} maxLength={255} placeholder={t("licensesAdmin.edit_blocked_placeholder")} />
              </div>
              {editErr ? <p style={{ color: "var(--danger)" }}>{editErr}</p> : null}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="btn" disabled={busy} onClick={() => setEditOpen(false)}>
                  {t("licensesAdmin.cancel")}
                </button>
                <button type="submit" className="btn btn--primary" disabled={busy || !editPlanId}>
                  {t("licensesAdmin.save_changes")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {blockOpen && blockTarget ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !busy && setBlockOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2 style={{ marginTop: 0 }}>{t("licensesAdmin.modal_block_title")}</h2>
            <p className="text-muted" style={{ fontSize: 14 }}>
              <code>{blockTarget.tenant_id}</code>
            </p>
            <form onSubmit={(e) => void submitBlock(e)}>
              <div className="field">
                <label>{t("licensesAdmin.block_reason_label")}</label>
                <input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} maxLength={255} />
              </div>
              {blockErr ? <p style={{ color: "var(--danger)" }}>{blockErr}</p> : null}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="btn" disabled={busy} onClick={() => setBlockOpen(false)}>
                  {t("licensesAdmin.cancel")}
                </button>
                <button type="submit" className="btn btn--primary" disabled={busy}>
                  {t("licensesAdmin.block")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
