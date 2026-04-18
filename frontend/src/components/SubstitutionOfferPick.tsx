import { useMemo } from "react";
import { InfoButton } from "./InfoButton";
import { ProductImageZoom } from "./ProductImageZoom";
import { useI18n } from "../i18n/I18nContext";
import { effectiveGross, effectiveNet, productOnSale } from "../lib/productPrices";
import type { Product } from "../types";

type OfferRow = Product | { id: number; name: string };

function isFullProduct(p: OfferRow): p is Product {
  return "price_gross" in p && typeof (p as Product).price_gross === "string";
}

function mergeOffers(ids: number[], rows?: Record<string, unknown>[]): OfferRow[] {
  return ids.map((id) => {
    const row = rows?.find((r) => Number(r.id) === id);
    if (row && typeof row.price_gross === "string") return row as unknown as Product;
    const name = row && typeof row.name === "string" ? row.name : `#${id}`;
    return { id, name };
  });
}

function ProductFacts({ p }: { p: Product }) {
  const { t } = useI18n();
  const onSale = productOnSale(p);
  return (
    <>
      <ProductImageZoom src={p.image_url} altName={p.name} />
      <h4 style={{ margin: "0.5rem 0 0.25rem", fontSize: "1rem" }}>{p.name}</h4>
      <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: 0 }}>{p.product_type_name}</p>
      {p.description ? (
        <p style={{ fontSize: "0.85rem", margin: "0.35rem 0 0", lineHeight: 1.45 }}>{p.description}</p>
      ) : null}
      <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "0.35rem 0 0" }}>
        {t("catalog.product_quantity")}: <strong>{p.quantity}</strong>
      </p>
      <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "0.1rem 0 0" }}>
        {t("catalog.measure_unit")}: <strong>{p.measure_unit_name}</strong>
      </p>
      <p style={{ fontSize: "0.88rem", margin: "0.35rem 0 0" }}>
        {t("catalog.price_net")}:{" "}
        <strong className={onSale ? "price--struck" : undefined}>{p.price_net}</strong>
        {onSale ? (
          <>
            {" → "}
            <strong>{String(effectiveNet(p))}</strong>
          </>
        ) : null}
      </p>
      <p style={{ fontSize: "0.88rem", margin: "0.2rem 0 0" }}>
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
      <p style={{ fontSize: "0.8rem", margin: "0.35rem 0 0", color: p.available ? "var(--ok)" : "var(--danger)" }}>
        {p.available ? t("order.sub_product_available") : t("order.sub_product_unavailable")}
      </p>
    </>
  );
}

type Props = {
  offerKey: number;
  offeredProductIds: number[];
  offeredProducts?: Record<string, unknown>[];
  selectedId: number | undefined;
  onSelect: (productId: number) => void;
  disabled?: boolean;
};

export function SubstitutionOfferPick({
  offerKey,
  offeredProductIds,
  offeredProducts,
  selectedId,
  onSelect,
  disabled,
}: Props) {
  const { t } = useI18n();
  const items = useMemo(() => mergeOffers(offeredProductIds, offeredProducts), [offeredProductIds, offeredProducts]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.5rem" }}>
        <InfoButton
          label={t("order.sub_customer_pick")}
          content={<p style={{ margin: 0 }}>{t("order.sub_product_compare_intro")}</p>}
        />
      </div>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: "0.75rem",
          marginTop: "0.35rem",
        }}
      >
        {items.map((item) => {
          const chosen = selectedId === item.id;
          return (
            <label
              key={item.id}
              className={`card product-card${chosen ? " product-card--in-cart" : ""}`}
              style={{
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.65 : 1,
                outline: chosen ? "2px solid var(--accent)" : undefined,
                outlineOffset: 0,
              }}
            >
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <input
                  type="radio"
                  name={`substitution-offer-${offerKey}`}
                  value={item.id}
                  checked={chosen}
                  disabled={disabled}
                  onChange={() => onSelect(item.id)}
                  style={{ marginTop: "0.25rem" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isFullProduct(item) ? (
                    <ProductFacts p={item} />
                  ) : (
                    <div>
                      <p style={{ margin: 0, fontWeight: 600 }}>{item.name}</p>
                      <p style={{ margin: "0.35rem 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
                        {t("order.sub_product_partial")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
