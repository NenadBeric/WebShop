import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { useI18n } from "../i18n/I18nContext";

export type ProductTypeRow = { id: number; tenant_id: string; name: string; sort_order: number };

export function ProductTypesSection({ onChanged }: { onChanged?: () => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ProductTypeRow[]>([]);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await apiFetch<ProductTypeRow[]>("/api/v1/product-types");
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErr(null);
    try {
      await apiFetch("/api/v1/product-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), sort_order: 0 }),
      });
      setName("");
      await load();
      onChanged?.();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  async function del(id: number, nm: string) {
    if (!confirm(`${t("manager.delete")} „${nm}”?`)) return;
    setErr(null);
    try {
      await apiFetch(`/api/v1/product-types/${id}`, { method: "DELETE" });
      await load();
      onChanged?.();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>{t("manager.types_title")}</h3>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
      <form onSubmit={onAdd} style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0, minWidth: "200px" }}>
          <label>{t("manager.type_name")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary">
          {t("manager.add_type")}
        </button>
      </form>
      <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.25rem" }}>
        {rows.map((r) => (
          <li key={r.id} style={{ marginBottom: "0.35rem" }}>
            {r.name}{" "}
            <button type="button" className="btn" style={{ padding: "0.15rem 0.45rem", fontSize: "0.8rem" }} onClick={() => void del(r.id, r.name)}>
              {t("manager.delete")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
