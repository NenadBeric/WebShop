import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import type { ProductTypeRow } from "../components/ProductTypesSection";
import { useI18n } from "../i18n/I18nContext";

export function ProductTypesPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<ProductTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addSort, setAddSort] = useState("0");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSort, setEditSort] = useState("0");

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const data = await apiFetch<ProductTypeRow[]>("/api/v1/product-types");
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;
    setErr(null);
    await apiFetch("/api/v1/product-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addName.trim(), sort_order: Number(addSort) || 0 }),
    });
    setAddName("");
    setAddSort("0");
    await load();
  }

  function startEdit(r: ProductTypeRow) {
    setEditingId(r.id);
    setEditName(r.name);
    setEditSort(String(r.sort_order));
  }

  async function saveEdit() {
    if (editingId == null || !editName.trim()) return;
    setErr(null);
    await apiFetch(`/api/v1/product-types/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), sort_order: Number(editSort) || 0 }),
    });
    setEditingId(null);
    await load();
  }

  async function del(r: ProductTypeRow) {
    if (!confirm(`${t("manager.delete")} „${r.name}”?`)) return;
    setErr(null);
    await apiFetch(`/api/v1/product-types/${r.id}`, { method: "DELETE" });
    if (editingId === r.id) setEditingId(null);
    await load();
  }

  if (loading) return <p>{t("common.loading")}</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{t("ref.types_title")}</h1>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      <form className="card" onSubmit={onAdd} style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>{t("ref.add_new")}</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0, minWidth: "12rem" }}>
            <label>{t("manager.type_name")}</label>
            <input value={addName} onChange={(e) => setAddName(e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: 0, width: "6rem" }}>
            <label>{t("ref.sort_order")}</label>
            <input type="text" className="input-narrow" inputMode="numeric" value={addSort} onChange={(e) => setAddSort(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary">
            {t("manager.add_type")}
          </button>
        </div>
      </form>

      <div className="table-wrap card table-wrap--mobile-cards">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>{t("manager.type_name")}</th>
              <th>{t("ref.sort_order")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              editingId === r.id ? (
                <tr key={r.id}>
                  <td data-label={t("common.id")}>{r.id}</td>
                  <td data-label={t("manager.type_name")}>
                    <input className="input-medium" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </td>
                  <td data-label={t("ref.sort_order")}>
                    <input type="text" className="input-narrow" inputMode="numeric" value={editSort} onChange={(e) => setEditSort(e.target.value)} />
                  </td>
                  <td className="table-cell--stack-actions" data-label={t("order.col_actions")}>
                    <div className="table-cell--actions-row">
                      <button type="button" className="btn btn-primary" onClick={() => void saveEdit()}>
                        {t("manager.save")}
                      </button>
                      <button type="button" className="btn" onClick={() => setEditingId(null)}>
                        {t("common.cancel")}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td data-label={t("common.id")}>{r.id}</td>
                  <td data-label={t("manager.type_name")}>{r.name}</td>
                  <td data-label={t("ref.sort_order")}>{r.sort_order}</td>
                  <td className="table-cell--stack-actions" data-label={t("order.col_actions")}>
                    <div className="table-cell--actions-row">
                      <button type="button" className="btn btn-primary" onClick={() => startEdit(r)}>
                        {t("manager.edit")}
                      </button>
                      <button type="button" className="btn" onClick={() => void del(r)}>
                        {t("manager.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
