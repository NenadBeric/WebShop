import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, getSavedLanguage, getToken } from "../api/client";
import { InfoButton } from "./InfoButton";
import { ProductImageZoom } from "./ProductImageZoom";
import { SearchableSelect } from "./SearchableSelect";
import { useI18n } from "../i18n/I18nContext";
import { effectiveGross } from "../lib/productPrices";
import { grossFromNet, netFromGross, type VatOption } from "../lib/vat";
import type { Product } from "../types";
import type { MeasureUnitRow } from "./MeasureUnitsSection";
import type { ProductTypeRow } from "./ProductTypesSection";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  types: ProductTypeRow[];
  units: MeasureUnitRow[];
  product: Product | null;
  /** Svi proizvodi iz menadžment liste (za izbor zamena, max 3). */
  replacementCandidates: Product[];
};

function parseMoney(s: string): number {
  const v = Number(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}

export function ProductModal({ open, onClose, onSaved, types, units, product, replacementCandidates }: Props) {
  const { t } = useI18n();
  const [replacementIds, setReplacementIds] = useState<number[]>([]);
  const [measureUnitId, setMeasureUnitId] = useState(0);
  const [quantityStr, setQuantityStr] = useState("1");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [productTypeId, setProductTypeId] = useState<number>(0);
  const [vat, setVat] = useState<VatOption>(20);
  const [netStr, setNetStr] = useState("0");
  const [grossStr, setGrossStr] = useState("0");
  const [lastField, setLastField] = useState<"net" | "gross">("net");
  const [imageUrl, setImageUrl] = useState("");
  const [available, setAvailable] = useState(true);
  const [salePercentStr, setSalePercentStr] = useState("0");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setFile(null);
    setPreview(null);
    const tid = types[0]?.id ?? 0;
    const uid = units[0]?.id ?? 0;
    if (product) {
      setName(String(product.name ?? ""));
      setDescription(String(product.description ?? ""));
      setProductTypeId(Number(product.product_type_id) || tid);
      setMeasureUnitId(Number(product.measure_unit_id) || uid);
      setQuantityStr(String(product.quantity ?? "1"));
      setVat(Number(product.vat_rate_percent) as VatOption);
      setNetStr(String(product.price_net ?? ""));
      setGrossStr(String(product.price_gross ?? ""));
      setLastField("net");
      setImageUrl(product.image_url);
      setAvailable(product.available);
      setSalePercentStr(String(Math.min(99, Math.max(0, Math.floor(Number(product.sale_percent) || 0)))));
      setReplacementIds([...(product.replacement_product_ids || [])].slice(0, 3));
    } else {
      setName("");
      setDescription("");
      setProductTypeId(tid);
      setMeasureUnitId(uid);
      setQuantityStr("1");
      setVat(20);
      setNetStr("100");
      const g = grossFromNet(100, 20);
      setGrossStr(String(g));
      setLastField("net");
      setImageUrl("https://placehold.co/400x300?text=New");
      setAvailable(true);
      setSalePercentStr("0");
      setReplacementIds([]);
    }
  }, [open, product, types, units]);

  const replacementOptions = useMemo(() => {
    const selfId = product?.id;
    return [...replacementCandidates]
      .filter((p) => p.id !== selfId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [replacementCandidates, product?.id]);

  const typeSelectOptions = useMemo(
    () => types.map((tp) => ({ value: String(tp.id), label: tp.name })),
    [types],
  );
  const unitSelectOptions = useMemo(
    () => units.map((u) => ({ value: String(u.id), label: u.name })),
    [units],
  );
  const vatSelectOptions = useMemo(
    () => [
      { value: "0", label: "0%" },
      { value: "10", label: "10%" },
      { value: "20", label: "20%" },
    ],
    [],
  );

  function toggleReplacement(id: number) {
    setReplacementIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function onNetChange(v: string) {
    setLastField("net");
    setNetStr(v);
    const n = parseMoney(v);
    setGrossStr(String(grossFromNet(n, vat)));
  }

  function onGrossChange(v: string) {
    setLastField("gross");
    setGrossStr(v);
    const g = parseMoney(v);
    setNetStr(String(netFromGross(g, vat)));
  }

  function onVatChange(next: VatOption) {
    setVat(next);
    if (lastField === "net") {
      const n = parseMoney(netStr);
      setGrossStr(String(grossFromNet(n, next)));
    } else {
      const g = parseMoney(grossStr);
      setNetStr(String(netFromGross(g, next)));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      let img = imageUrl.trim();
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/v1/uploads/product-image", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getToken() || ""}`,
            "Accept-Language": getSavedLanguage(),
          },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : res.statusText);
        img = data.url as string;
        setImageUrl(img);
      }
      const qty = parseMoney(quantityStr);
      if (!(qty > 0)) {
        setErr(t("manager.quantity_invalid"));
        setSaving(false);
        return;
      }
      const salePct = Math.min(99, Math.max(0, Math.floor(Number(String(salePercentStr).replace(",", ".")) || 0)));
      const body = {
        name: name.trim(),
        description,
        product_type_id: productTypeId,
        measure_unit_id: measureUnitId,
        quantity: qty,
        vat_rate_percent: vat,
        price_net: parseMoney(netStr),
        price_gross: parseMoney(grossStr),
        image_url: img,
        available,
        replacement_product_ids: replacementIds,
        sale_percent: salePct,
      };
      if (product) {
        await apiFetch(`/api/v1/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/api/v1/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      onSaved();
      onClose();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const imgSrc = preview || imageUrl;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{product ? t("product_modal.title_edit") : t("product_modal.title_add")}</h2>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>{t("manager.product_name")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>{t("manager.product_desc")}</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="field">
            <label htmlFor="product-modal-type">{t("manager.product_type")}</label>
            <SearchableSelect
              id="product-modal-type"
              value={String(productTypeId)}
              onChange={(v) => setProductTypeId(Number(v))}
              options={typeSelectOptions}
              allowEmpty={false}
              portal
            />
          </div>
          <div className="field">
            <label htmlFor="product-modal-unit">{t("manager.measure_unit")}</label>
            <SearchableSelect
              id="product-modal-unit"
              value={String(measureUnitId)}
              onChange={(v) => setMeasureUnitId(Number(v))}
              options={unitSelectOptions}
              allowEmpty={false}
              portal
            />
          </div>
          <div className="field">
            <label>{t("manager.product_quantity")}</label>
            <input type="text" inputMode="decimal" value={quantityStr} onChange={(e) => setQuantityStr(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="product-modal-vat">{t("manager.vat_rate")}</label>
            <SearchableSelect
              id="product-modal-vat"
              value={String(vat)}
              onChange={(v) => onVatChange(Number(v) as VatOption)}
              options={vatSelectOptions}
              allowEmpty={false}
              portal
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div className="field">
              <label>{t("manager.price_net")}</label>
              <input type="text" inputMode="decimal" value={netStr} onChange={(e) => onNetChange(e.target.value)} required />
            </div>
            <div className="field">
              <label>{t("manager.price_gross")}</label>
              <input type="text" inputMode="decimal" value={grossStr} onChange={(e) => onGrossChange(e.target.value)} required />
            </div>
          </div>
          <div className="field">
            <div className="field__label-row">
              <label htmlFor="product-modal-sale">{t("manager.sale_percent")}</label>
              <InfoButton
                label={t("manager.sale_percent")}
                content={<p style={{ margin: 0 }}>{t("manager.sale_percent_hint")}</p>}
              />
            </div>
            <input
              id="product-modal-sale"
              type="text"
              inputMode="numeric"
              value={salePercentStr}
              onChange={(e) => setSalePercentStr(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="field">
            <label>{t("product_modal.image_file")}</label>
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="field">
            <label>{t("product_modal.image_url")}</label>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </div>
          <div className="field">
            <div className="field__label-row">
              <label>{t("product_modal.replacements")}</label>
              <InfoButton
                label={t("product_modal.replacements")}
                content={<p style={{ margin: 0 }}>{t("product_modal.replacements_hint")}</p>}
              />
            </div>
            {replacementOptions.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>{t("product_modal.replacements_empty")}</p>
            ) : (
              <div className="replacement-pick-list">
                {replacementOptions.map((p) => (
                  <label key={p.id} className="replacement-pick-row">
                    <input
                      type="checkbox"
                      checked={replacementIds.includes(p.id)}
                      onChange={() => toggleReplacement(p.id)}
                    />
                    <span>
                      {p.name}{" "}
                      <span style={{ color: "var(--muted)" }}>
                        ({p.product_type_name} · {effectiveGross(p)})
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {imgSrc ? (
            <div style={{ marginBottom: "0.75rem" }}>
              <ProductImageZoom
                src={imgSrc}
                altName={name.trim() || product?.name || ""}
                buttonClassName="product-img-zoom-btn product-img-zoom-btn--contain"
                thumbClassName="product-modal-preview-thumb"
              />
            </div>
          ) : null}
          <label style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginBottom: "0.75rem" }}>
            <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
            {t("manager.available")}
          </label>
          {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !types.length || !units.length}>
              {saving ? t("common.loading") : t("manager.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
