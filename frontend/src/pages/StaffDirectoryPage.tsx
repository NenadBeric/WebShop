import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth, canManage } from "../auth/AuthContext";
import { InfoButton } from "../components/InfoButton";
import { SearchableSelect } from "../components/SearchableSelect";
import { useI18n } from "../i18n/I18nContext";
import type { TenantStaffRow } from "../types";

function assignableRoleKeys(actorRole: string): string[] {
  if (actorRole === "ADMIN") {
    return ["ADMIN", "WEBSHOP_OWNER", "WEBSHOP_MANAGER", "WEBSHOP_RECEPTION", "WEBSHOP_CUSTOMER"];
  }
  if (actorRole === "WEBSHOP_OWNER") {
    return ["WEBSHOP_MANAGER", "WEBSHOP_RECEPTION", "WEBSHOP_CUSTOMER"];
  }
  if (actorRole === "WEBSHOP_MANAGER") {
    return ["WEBSHOP_RECEPTION", "WEBSHOP_CUSTOMER"];
  }
  return [];
}

function mayEditStaffRow(actorRole: string, targetRowRole: string): boolean {
  if (actorRole === "ADMIN") return true;
  if (actorRole === "WEBSHOP_OWNER") {
    return ["WEBSHOP_MANAGER", "WEBSHOP_RECEPTION", "WEBSHOP_CUSTOMER"].includes(targetRowRole);
  }
  if (actorRole === "WEBSHOP_MANAGER") {
    return ["WEBSHOP_RECEPTION", "WEBSHOP_CUSTOMER"].includes(targetRowRole);
  }
  return false;
}

export function StaffDirectoryPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const role = user?.role || "";
  const [items, setItems] = useState<TenantStaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TenantStaffRow | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [rolePick, setRolePick] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const roleOptions = useMemo(() => assignableRoleKeys(role), [role]);

  const roleSearchOptions = useMemo(() => {
    const tFn = t as (key: string) => string;
    return roleOptions.map((rk) => {
      const k = `staff.role.${rk}`;
      const m = tFn(k);
      const label = m === k ? rk : m;
      return { value: rk, label };
    });
  }, [roleOptions, t]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch<TenantStaffRow[]>("/api/v1/tenant/staff");
      setItems(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canManage(role)) {
    return <Navigate to="/catalog" replace />;
  }

  function openAdd() {
    setEditing(null);
    setEmail("");
    setDisplayName("");
    setRolePick(roleOptions[0] || "");
    setActive(true);
    setModalErr(null);
    setModalOpen(true);
  }

  function openEdit(row: TenantStaffRow) {
    if (!mayEditStaffRow(role, row.role)) return;
    setEditing(row);
    setEmail(row.email);
    setDisplayName(row.display_name || "");
    setRolePick(row.role);
    setActive(row.active);
    setModalErr(null);
    setModalOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setModalErr(null);
    setSaving(true);
    try {
      if (editing) {
        await apiFetch<TenantStaffRow>(`/api/v1/tenant/staff/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            display_name: displayName.trim(),
            role: rolePick,
            active,
          }),
        });
      } else {
        await apiFetch<TenantStaffRow>("/api/v1/tenant/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            display_name: displayName.trim(),
            role: rolePick,
          }),
        });
      }
      setModalOpen(false);
      await load();
    } catch (ex) {
      setModalErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setSaving(false);
    }
  }

  function roleLabel(r: string) {
    const k = `staff.role.${r}`;
    const m = t(k);
    return m === k ? r : m;
  }

  if (loading) return <p>{t("common.loading")}</p>;

  return (
    <div>
      <div className="page-title-row" style={{ marginBottom: "0.75rem" }}>
        <h1 style={{ marginTop: 0 }}>{t("staff.title")}</h1>
        <InfoButton label={t("staff.title")} content={<p style={{ margin: 0 }}>{t("staff.intro")}</p>} />
      </div>
      {err ? <p style={{ color: "var(--danger)" }}>{err}</p> : null}

      <div style={{ marginBottom: "1rem" }}>
        <button type="button" className="btn btn-primary" onClick={openAdd} disabled={!roleOptions.length}>
          {t("staff.add")}
        </button>
      </div>

      <div className="table-wrap card table-wrap--mobile-cards">
        <table>
          <thead>
            <tr>
              <th>{t("staff.email")}</th>
              <th>{t("staff.display_name")}</th>
              <th>{t("staff.role")}</th>
              <th>{t("staff.active")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const canEdit = mayEditStaffRow(role, row.role);
              return (
                <tr key={row.id}>
                  <td data-label={t("staff.email")}>{row.email}</td>
                  <td data-label={t("staff.display_name")}>{row.display_name || "—"}</td>
                  <td data-label={t("staff.role")}>{roleLabel(row.role)}</td>
                  <td data-label={t("staff.active")}>{row.active ? t("staff.active") : t("staff.inactive")}</td>
                  <td className="table-cell--stack-actions" data-label={t("order.col_actions")}>
                    <button type="button" className="btn" disabled={!canEdit} onClick={() => openEdit(row)} title={!canEdit ? t("staff.cannot_edit_row") : undefined}>
                      {t("staff.edit")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{editing ? t("staff.edit") : t("staff.add")}</h2>
            <form onSubmit={(e) => void onSubmit(e)}>
              <div className="field">
                <label>{t("staff.email")}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!!editing} />
                {editing ? <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "0.25rem 0 0" }}>{t("staff.email_readonly_edit")}</p> : null}
              </div>
              <div className="field">
                <label>{t("staff.display_name")}</label>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="staff-modal-role">{t("staff.role")}</label>
                <SearchableSelect
                  id="staff-modal-role"
                  value={rolePick}
                  onChange={setRolePick}
                  options={roleSearchOptions}
                  allowEmpty={false}
                  disabled={saving || !roleSearchOptions.length}
                  portal
                />
              </div>
              {editing ? (
                <label style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginBottom: "0.75rem" }}>
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  {t("staff.active")}
                </label>
              ) : null}
              {modalErr ? <p style={{ color: "var(--danger)" }}>{modalErr}</p> : null}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={() => setModalOpen(false)}>
                  {t("staff.cancel")}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || !rolePick}>
                  {saving ? t("common.loading") : t("staff.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
