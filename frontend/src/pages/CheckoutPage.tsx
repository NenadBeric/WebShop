import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, getSavedLanguage } from "../api/client";
import { DatetimeLocalPicker } from "../components/DatetimeLocalPicker";
import { InfoButton } from "../components/InfoButton";
import { SearchableSelect } from "../components/SearchableSelect";
import { useI18n } from "../i18n/I18nContext";
import { useCart } from "../cart/CartContext";
import type { OrderDetail, TenantOrderRules } from "../types";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function pickupPickerBounds(maxDaysAhead: number, minNoticeHours: number): { min: string; max: string } {
  const min = new Date(Date.now() + minNoticeHours * 3600 * 1000);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + maxDaysAhead);
  end.setHours(23, 59, 0, 0);
  return { min: toDatetimeLocalValue(min), max: toDatetimeLocalValue(end) };
}

export function CheckoutPage() {
  const { t, lang } = useI18n();
  const { lines, clear, ready } = useCart();
  const nav = useNavigate();
  const [pickupMode, setPickupMode] = useState<"exact" | "day">("day");
  const [pickupAt, setPickupAt] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [pickupLocationId, setPickupLocationId] = useState<number | "">("");
  const [rules, setRules] = useState<TenantOrderRules | null>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await apiFetch<TenantOrderRules>("/api/v1/tenant/order-rules");
        if (cancelled) return;
        setRules(r);
        if (r.locations.length === 1) {
          setPickupLocationId(r.locations[0].id);
        }
      } catch {
        if (!cancelled) setRules(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bounds = useMemo(() => {
    if (!rules) return null;
    return pickupPickerBounds(rules.max_schedule_days_ahead, rules.min_notice_hours_before_pickup);
  }, [rules]);

  const pickupLocationOptions = useMemo(() => {
    if (!rules?.locations.length) return [];
    return [
      { value: "", label: t("checkout.pickup_location_placeholder") },
      ...rules.locations.map((loc) => ({
        value: String(loc.id),
        label: `${loc.code} — ${loc.name}`,
      })),
    ];
  }, [rules, t]);

  const pickupModeOptions = useMemo(
    () => [
      { value: "day", label: t("pickup.day") },
      { value: "exact", label: t("pickup.exact") },
    ],
    [t],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!ready) return;
    if (lines.length === 0) {
      setErr(t("cart.empty"));
      return;
    }
    if (!pickupAt.trim()) {
      setErr(t("pickup.at"));
      return;
    }
    if (rules && rules.locations.length > 0 && pickupLocationId === "") {
      setErr(t("checkout.pickup_location_required"));
      return;
    }
    setLoading(true);
    try {
      const atIso = new Date(pickupAt).toISOString();
      const order = await apiFetch<OrderDetail>("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({
            product_id: l.product.id,
            quantity: l.quantity,
            note: l.note,
          })),
          pickup: { mode: pickupMode, at: atIso, note: pickupNote },
          preferred_lang: lang || getSavedLanguage(),
          pickup_location_id: pickupLocationId === "" ? null : pickupLocationId,
        }),
      });
      await clear();
      nav(`/orders/${order.id}`, { replace: true });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div>
        <h1>{t("checkout.title")}</h1>
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div>
        <h1>{t("checkout.title")}</h1>
        <p>{t("cart.empty")}</p>
      </div>
    );
  }

  if (rules === undefined) {
    return (
      <div>
        <h1>{t("checkout.title")}</h1>
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{t("checkout.title")}</h1>
      <p>{t("checkout.pay_note")}</p>
      {rules && (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", maxWidth: 560 }}>
          {t("checkout.rules_hint", {
            max_days: rules.max_schedule_days_ahead,
            min_hours: rules.min_notice_hours_before_pickup,
            grace: rules.pickup_grace_hours_after_slot,
            tz: rules.timezone,
          })}
        </p>
      )}
      <form className="card" onSubmit={onSubmit} style={{ maxWidth: 520 }}>
        {rules && rules.locations.length > 0 && (
          <div className="field">
            <label htmlFor="checkout-pickup-loc">{t("checkout.pickup_location")}</label>
            <SearchableSelect
              id="checkout-pickup-loc"
              value={pickupLocationId === "" ? "" : String(pickupLocationId)}
              onChange={(v) => setPickupLocationId(v === "" ? "" : Number(v))}
              options={pickupLocationOptions}
              allowEmpty
              portal
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="checkout-pickup-mode">{t("pickup.label")}</label>
          <SearchableSelect
            id="checkout-pickup-mode"
            value={pickupMode}
            onChange={(v) => setPickupMode((v || "day") as "exact" | "day")}
            options={pickupModeOptions}
            allowEmpty={false}
            portal
          />
        </div>
        <div className="field">
          <div className="field__label-row">
            <label htmlFor="checkout-pickup-at">{t("pickup.at")}</label>
            {bounds ? (
              <InfoButton
                label={t("pickup.at")}
                content={
                  <p style={{ margin: 0 }}>
                    {t("checkout.datetime_bounds", { min: bounds.min, max: bounds.max })}
                  </p>
                }
              />
            ) : null}
          </div>
          <DatetimeLocalPicker
            id="checkout-pickup-at"
            value={pickupAt}
            onChange={setPickupAt}
            min={bounds?.min}
            max={bounds?.max}
          />
        </div>
        <div className="field">
          <label>{t("pickup.note")}</label>
          <textarea value={pickupNote} onChange={(e) => setPickupNote(e.target.value)} rows={3} />
        </div>
        {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? t("common.loading") : t("checkout.submit")}
        </button>
      </form>
    </div>
  );
}
