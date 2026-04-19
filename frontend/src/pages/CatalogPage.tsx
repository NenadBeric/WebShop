import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../api/client";
import { InfoButton } from "../components/InfoButton";
import { MobileCollapsibleFilters } from "../components/MobileCollapsibleFilters";
import { ProductImageZoom } from "../components/ProductImageZoom";
import { SearchableSelect } from "../components/SearchableSelect";
import { useI18n } from "../i18n/I18nContext";
import { useCart } from "../cart/CartContext";
import { effectiveGross, effectiveNet, parseMoney, productOnSale, salePercentValue } from "../lib/productPrices";
import type { AiCatalogSearchOut, Product } from "../types";

type SortKey = "name_asc" | "name_desc" | "price_gross_asc" | "price_gross_desc";

export function CatalogPage() {
  const { t, lang } = useI18n();
  const { lines, add, setQty, ready: cartReady } = useCart();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeId, setTypeId] = useState<string>("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState<SortKey>("name_asc");
  const [onlyOnSale, setOnlyOnSale] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aiQuery, setAiQuery] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiFilterIds, setAiFilterIds] = useState<number[] | null>(null);

  const qtyFor = (id: number) => lines.find((l) => l.product.id === id)?.quantity ?? 0;

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 2800);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const data = await apiFetch<Product[]>("/api/v1/products");
        if (ok) setItems(data);
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  const typeOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of items) m.set(p.product_type_id, p.product_type_name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], lang, { sensitivity: "base" }));
  }, [items, lang]);

  const typeFilterOptions = useMemo(
    () => [{ value: "", label: t("shop.type_all") }, ...typeOptions.map(([id, name]) => ({ value: String(id), label: name }))],
    [t, typeOptions],
  );

  const sortFilterOptions = useMemo(
    () => [
      { value: "name_asc", label: t("shop.sort_name_asc") },
      { value: "name_desc", label: t("shop.sort_name_desc") },
      { value: "price_gross_asc", label: t("shop.sort_price_gross_asc") },
      { value: "price_gross_desc", label: t("shop.sort_price_gross_desc") },
    ],
    [t],
  );

  async function runAiSearch() {
    setAiErr(null);
    setAiBusy(true);
    try {
      const r = await apiFetch<AiCatalogSearchOut>("/api/v1/ai/catalog-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiQuery.trim() }),
      });
      const ids = r.hits.map((h) => h.product_id);
      if (!ids.length) {
        setAiFilterIds(null);
        setAiErr(t("catalog.ai_no_results"));
        return;
      }
      setAiFilterIds(ids);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tid = typeId ? Number(typeId) : null;
    const pMin = priceMin.trim() === "" ? null : parseMoney(priceMin);
    const pMax = priceMax.trim() === "" ? null : parseMoney(priceMax);
    let list = items.filter((p) => p.available);
    if (aiFilterIds && aiFilterIds.length > 0) {
      const idset = new Set(aiFilterIds);
      list = list.filter((p) => idset.has(p.id));
    }
    list = list.filter((p) => {
      /* AI već radi semantički match — ručna pretraga ne sme da isprazni listu posle AI odgovora. */
      if (q && !(aiFilterIds && aiFilterIds.length > 0)) {
        const hay = `${p.name} ${p.description || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tid !== null && !Number.isNaN(tid) && p.product_type_id !== tid) return false;
      if (onlyOnSale && !productOnSale(p)) return false;
      const gross = effectiveGross(p);
      if (pMin !== null && gross < pMin) return false;
      if (pMax !== null && gross > pMax) return false;
      return true;
    });
    const collator = new Intl.Collator(lang, { sensitivity: "base" });
    list = [...list].sort((a, b) => {
      const byPct = salePercentValue(b) - salePercentValue(a);
      if (byPct !== 0) return byPct;
      switch (sort) {
        case "name_desc":
          return collator.compare(b.name, a.name);
        case "price_gross_asc":
          return effectiveGross(a) - effectiveGross(b);
        case "price_gross_desc":
          return effectiveGross(b) - effectiveGross(a);
        case "name_asc":
        default:
          return collator.compare(a.name, b.name);
      }
    });
    return list;
  }, [items, search, typeId, priceMin, priceMax, sort, lang, aiFilterIds, onlyOnSale]);

  if (loading) return <p>{t("common.loading")}</p>;
  if (!cartReady) return <p>{t("common.loading")}</p>;
  if (err) return <p style={{ color: "var(--danger)" }}>{err}</p>;

  return (
    <div>
      <div className="page-title-row" style={{ marginTop: 0 }}>
        <h1 style={{ marginTop: 0 }}>{t("shop.title")}</h1>
        <InfoButton
          label={t("shop.title")}
          content={<p style={{ margin: 0, maxWidth: "min(36rem, 85vw)" }}>{t("shop.promotion_landing_hint")}</p>}
        />
      </div>

      <div className="card" style={{ marginBottom: "1rem", maxWidth: 720 }}>
        <div className="field__label-row" style={{ marginTop: 0 }}>
          <h2 style={{ margin: 0 }}>{t("catalog.ai_search")}</h2>
          <InfoButton
            label={t("catalog.ai_search")}
            content={<p style={{ margin: 0, maxWidth: "min(36rem, 85vw)" }}>{t("catalog.ai_hint")}</p>}
          />
        </div>
        <div className="field">
          <textarea
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            rows={2}
            placeholder={t("catalog.ai_query_placeholder")}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-primary" disabled={aiBusy || !aiQuery.trim()} onClick={() => void runAiSearch()}>
            {aiBusy ? t("common.loading") : t("catalog.ai_run")}
          </button>
          {aiFilterIds !== null ? (
            <button type="button" className="btn" onClick={() => setAiFilterIds(null)}>
              {t("catalog.ai_clear")}
            </button>
          ) : null}
        </div>
        {aiErr ? <p style={{ color: "var(--danger)", marginBottom: 0 }}>{aiErr}</p> : null}
        {aiFilterIds !== null && aiFilterIds.length === 0 && !aiBusy ? <p>{t("catalog.ai_no_results")}</p> : null}
      </div>

      <MobileCollapsibleFilters toggleLabel={t("common.filters_toggle")} className="shop-filters" style={{ marginBottom: "1rem" }}>
        <div className="shop-filters-grid">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t("shop.search")}</label>
            <input
              type="search"
              className="input-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("shop.search")}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t("shop.type")}</label>
            <SearchableSelect value={typeId} onChange={setTypeId} options={typeFilterOptions} allowEmpty portal />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t("shop.sort")}</label>
            <SearchableSelect
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={sortFilterOptions}
              allowEmpty={false}
              portal
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t("shop.price_min")}</label>
            <input type="text" inputMode="decimal" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t("shop.price_max")}</label>
            <input type="text" inputMode="decimal" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
          </div>
          <label
            className="field shop-filter-sale-only"
            style={{
              marginBottom: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "0.35rem",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: "0.9rem", lineHeight: 1.25, width: "100%" }}>{t("shop.sale_only")}</span>
            <input type="checkbox" checked={onlyOnSale} onChange={(e) => setOnlyOnSale(e.target.checked)} />
          </label>
        </div>
      </MobileCollapsibleFilters>

      {items.length === 0 ? (
        <p>{t("shop.empty")}</p>
      ) : filtered.length === 0 ? (
        <p>{t("shop.no_results")}</p>
      ) : (
        <div className="grid">
          {filtered.map((p) => {
            const q = qtyFor(p.id);
            const inCart = q > 0;
            const onSale = productOnSale(p);
            return (
              <div
                key={p.id}
                className={`card product-card${inCart ? " product-card--in-cart" : ""}${onSale ? " product-card--sale" : ""}`}
              >
                {onSale ? (
                  <span className="product-card__sale-badge" aria-hidden>
                    {t("shop.sale_badge", { percent: p.sale_percent })}
                  </span>
                ) : null}
                <ProductImageZoom src={p.image_url} altName={p.name} />
                <h3 style={{ margin: "0.5rem 0 0.25rem" }}>{p.name}</h3>
                <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>{p.product_type_name}</p>
                <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0.15rem 0 0" }}>
                  {t("catalog.product_quantity")}: <strong>{p.quantity}</strong>
                </p>
                <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0.05rem 0 0" }}>
                  {t("catalog.measure_unit")}: <strong>{p.measure_unit_name}</strong>
                </p>
                <p style={{ fontSize: "0.9rem", margin: "0.25rem 0" }}>
                  {t("catalog.price_net")}:{" "}
                  <strong className={onSale ? "price--struck" : undefined}>{p.price_net}</strong>
                  {onSale ? (
                    <>
                      {" → "}
                      <strong>{String(effectiveNet(p))}</strong>
                    </>
                  ) : null}
                </p>
                <p style={{ fontSize: "0.9rem", margin: "0.25rem 0" }}>
                  {t("catalog.price_gross")}:{" "}
                  <strong className={onSale ? "price--struck" : undefined}>{p.price_gross}</strong>
                  {onSale ? (
                    <>
                      {" → "}
                      <strong className="price--sale">{String(effectiveGross(p))}</strong>
                    </>
                  ) : null}{" "}
                  ({t("catalog.vat")} {p.vat_rate_percent}%)
                </p>
                {inCart ? (
                  <div className="qty-stepper" role="group" aria-label={t("cart.qty")}>
                    <button
                      type="button"
                      className="btn btn-qty"
                      onClick={() => setQty(p.id, q - 1)}
                      aria-label="−"
                    >
                      −
                    </button>
                    <span className="qty-stepper__value">{q}</span>
                    <button type="button" className="btn btn-qty" onClick={() => setQty(p.id, q + 1)} aria-label="+">
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      add(p);
                      showToast(t("shop.added"));
                    }}
                  >
                    {t("catalog.add")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
