import { Link } from "react-router-dom";
import { ProductImageZoom } from "../components/ProductImageZoom";
import { useI18n } from "../i18n/I18nContext";
import { useCart } from "../cart/CartContext";
import { effectiveGross, effectiveNet, productOnSale } from "../lib/productPrices";

export function CartPage() {
  const { t } = useI18n();
  const { lines, remove, setQty, ready } = useCart();

  if (!ready) return <p>{t("common.loading")}</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{t("cart.title")}</h1>
      <p className="cart-shop-cta">
        <Link to="/catalog">{t("nav.shop")}</Link>
      </p>
      {lines.length === 0 ? (
        <p>{t("cart.empty")}</p>
      ) : (
        <>
          <div className="table-wrap card">
            <table>
              <thead>
                <tr>
                  <th>{t("order.lines")}</th>
                  <th>{t("cart.qty")}</th>
                  <th>{t("cart.prices")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const src = (l.product.image_url || "").trim();
                  const onSale = productOnSale(l.product);
                  const eg = effectiveGross(l.product);
                  const en = effectiveNet(l.product);
                  return (
                    <tr key={l.product.id}>
                      <td>
                        <div className="cart-line__main">
                          {src ? (
                            <ProductImageZoom
                              src={src}
                              altName={l.product.name}
                              buttonClassName="cart-thumb-btn"
                              thumbClassName="cart-thumb-btn__img"
                            />
                          ) : null}
                          <div className="cart-line__text">
                            <div>{l.product.name}</div>
                            <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                              <div>
                                {t("catalog.product_quantity")}: <strong>{l.product.quantity}</strong>
                              </div>
                              <div>
                                {t("catalog.measure_unit")}: <strong>{l.product.measure_unit_name}</strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={l.quantity}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isFinite(v) || v < 1) remove(l.product.id);
                            else setQty(l.product.id, v);
                          }}
                          style={{ width: "4rem" }}
                        />
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>
                        {t("catalog.price_net")}:{" "}
                        {onSale ? (
                          <>
                            <span className="price--struck">{l.product.price_net}</span> → {en} × {l.quantity} ={" "}
                            {(en * l.quantity).toFixed(2)}
                          </>
                        ) : (
                          <>
                            {l.product.price_net} × {l.quantity} = {(Number(l.product.price_net) * l.quantity).toFixed(2)}
                          </>
                        )}
                        <br />
                        {t("catalog.price_gross")}:{" "}
                        {onSale ? (
                          <>
                            <span className="price--struck">{l.product.price_gross}</span> →{" "}
                            <strong className="price--sale">{eg}</strong> × {l.quantity} ={" "}
                            {(eg * l.quantity).toFixed(2)}
                          </>
                        ) : (
                          <>
                            {l.product.price_gross} × {l.quantity} ={" "}
                            {(Number(l.product.price_gross) * l.quantity).toFixed(2)}
                          </>
                        )}
                        <br />
                        <span style={{ color: "var(--muted)" }}>
                          {t("catalog.vat")} {l.product.vat_rate_percent}%
                          {onSale ? (
                            <>
                              {" · "}
                              {t("shop.sale_badge", { percent: l.product.sale_percent })}
                            </>
                          ) : null}
                        </span>
                      </td>
                      <td>
                        <button type="button" className="btn" onClick={() => remove(l.product.id)}>
                          {t("cart.remove")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="cart-checkout-row">
            <Link to="/checkout" className="btn btn-primary" style={{ display: "inline-flex" }}>
              {t("cart.checkout")}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
