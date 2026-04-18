import { useCallback, useEffect, useState } from "react";
import { apiFetch, getSavedLanguage } from "../api/client";
import { ProductModal } from "../components/ProductModal";
import type { MeasureUnitRow } from "../components/MeasureUnitsSection";
import type { ProductTypeRow } from "../components/ProductTypesSection";
import { useI18n } from "../i18n/I18nContext";
import type { Product } from "../types";

export function ProductsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Product[]>([]);
  const [types, setTypes] = useState<ProductTypeRow[]>([]);
  const [units, setUnits] = useState<MeasureUnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [modalNonce, setModalNonce] = useState(0);

  const loadTypes = useCallback(async () => {
    try {
      const data = await apiFetch<ProductTypeRow[]>("/api/v1/product-types");
      setTypes(data);
    } catch {
      setTypes([]);
    }
  }, []);

  const loadUnits = useCallback(async () => {
    try {
      const data = await apiFetch<MeasureUnitRow[]>("/api/v1/measure-units");
      setUnits(data);
    } catch {
      setUnits([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      await loadTypes();
      await loadUnits();
      const data = await apiFetch<Product[]>("/api/v1/products/manage");
      setItems(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [loadTypes, loadUnits]);

  useEffect(() => {
    void load();
  }, [load]);

  function openAdd() {
    setEditProduct(null);
    setModalNonce((n) => n + 1);
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    setModalNonce((n) => n + 1);
    setModalOpen(true);
  }

  async function remove(p: Product) {
    if (!confirm(`${t("manager.delete")} ${p.name}?`)) return;
    await apiFetch(`/api/v1/products/${p.id}`, { method: "DELETE" });
    await load();
  }

  async function exportCsv() {
    const res = await fetch("/api/v1/products/export.csv", {
      headers: { Authorization: `Bearer ${localStorage.getItem("webshop_token")}`, "Accept-Language": getSavedLanguage() },
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(file: File | null) {
    if (!file) return;
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/v1/import/products", {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("webshop_token")}`, "Accept-Language": getSavedLanguage() },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(typeof data.detail === "string" ? data.detail : res.statusText);
      return;
    }
    setMsg(`${t("manager.import_result")}: +${data.created} / ~${data.updated}`);
    await load();
  }

  if (loading) return <p>{t("common.loading")}</p>;
  if (err) return <p style={{ color: "var(--danger)" }}>{err}</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{t("ref.products_title")}</h1>
      {msg && <p style={{ color: "var(--ok)" }}>{msg}</p>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        <button type="button" className="btn btn-primary" onClick={openAdd}>
          {t("manager.add_product")}
        </button>
        <button type="button" className="btn" onClick={() => void exportCsv()}>
          {t("manager.csv_export")}
        </button>
        <label className="btn">
          {t("manager.csv_import")}
          <input type="file" accept=".csv,text/csv" hidden onChange={(e) => void importCsv(e.target.files?.[0] || null)} />
        </label>
      </div>

      <div className="table-wrap card table-wrap--mobile-cards">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>{t("manager.product_name")}</th>
              <th>{t("manager.product_type")}</th>
              <th>{t("manager.measure_unit")}</th>
              <th>{t("manager.product_quantity")}</th>
              <th>{t("manager.vat_rate")}</th>
              <th>{t("manager.price_net")}</th>
              <th>{t("manager.price_gross")}</th>
              <th>{t("manager.sale_percent")}</th>
              <th>{t("manager.available")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td data-label={t("common.id")}>{p.id}</td>
                <td data-label={t("manager.product_name")}>{p.name}</td>
                <td data-label={t("manager.product_type")}>{p.product_type_name}</td>
                <td data-label={t("manager.measure_unit")}>{p.measure_unit_name}</td>
                <td data-label={t("manager.product_quantity")}>{p.quantity}</td>
                <td data-label={t("manager.vat_rate")}>{p.vat_rate_percent}%</td>
                <td data-label={t("manager.price_net")}>{p.price_net}</td>
                <td data-label={t("manager.price_gross")}>{p.price_gross}</td>
                <td data-label={t("manager.sale_percent")}>{p.sale_percent ?? 0}%</td>
                <td data-label={t("manager.available")}>{p.available ? t("common.yes") : t("common.no")}</td>
                <td className="table-cell--stack-actions" data-label={t("order.col_actions")}>
                  <div className="table-cell--actions-row">
                    <button type="button" className="btn btn-primary" onClick={() => openEdit(p)}>
                      {t("manager.edit")}
                    </button>
                    <button type="button" className="btn" onClick={() => void remove(p)}>
                      {t("manager.delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ProductModal
        key={modalNonce}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => void load()}
        types={types}
        units={units}
        product={editProduct}
        replacementCandidates={items}
      />
    </div>
  );
}
