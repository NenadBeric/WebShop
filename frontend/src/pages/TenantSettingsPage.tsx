import { FormEvent, useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { canManage, useAuth } from "../auth/AuthContext";
import { InfoButton } from "../components/InfoButton";
import { useI18n } from "../i18n/I18nContext";
import type { TenantLocationInForm, TenantProfileOut } from "../types";

function emptyLocation(): TenantLocationInForm {
  return { code: "", name: "", address_line: "", sort_order: 0, is_active: true };
}

export function TenantSettingsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const role = user?.role || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [legal_name, setLegal_name] = useState("");
  const [trade_name, setTrade_name] = useState("");
  const [pib, setPib] = useState("");
  const [mb, setMb] = useState("");
  const [address_line, setAddress_line] = useState("");
  const [city, setCity] = useState("");
  const [postal_code, setPostal_code] = useState("");
  const [country, setCountry] = useState("RS");
  const [phone, setPhone] = useState("");
  const [contact_email, setContact_email] = useState("");
  const [website, setWebsite] = useState("");
  const [timezone, setTimezone] = useState("Europe/Belgrade");
  const [terms_note, setTerms_note] = useState("");
  const [max_schedule_days_ahead, setMax_schedule_days_ahead] = useState(14);
  const [min_notice_hours_before_pickup, setMin_notice_hours_before_pickup] = useState(0);
  const [pickup_grace_hours_after_slot, setPickup_grace_hours_after_slot] = useState(24);
  const [telegram_chat_id, setTelegram_chat_id] = useState("");
  const [telegram_bot_token, setTelegram_bot_token] = useState("");
  const [telegram_bot_token_dirty, setTelegram_bot_token_dirty] = useState(false);
  const [telegram_notify_new_order, setTelegram_notify_new_order] = useState(true);
  const [notify_before_pickup_minutes, setNotify_before_pickup_minutes] = useState(10);
  const [day_reminder_hour_local, setDay_reminder_hour_local] = useState(8);
  const [smtp_host, setSmtp_host] = useState("");
  const [smtp_port, setSmtp_port] = useState(587);
  const [smtp_user, setSmtp_user] = useState("");
  const [smtp_password, setSmtp_password] = useState("");
  const [smtp_from, setSmtp_from] = useState("");
  const [smtp_use_tls, setSmtp_use_tls] = useState(true);
  const [locations, setLocations] = useState<TenantLocationInForm[]>([emptyLocation()]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const p = await apiFetch<TenantProfileOut>("/api/v1/tenant/settings");
      setLegal_name(p.legal_name);
      setTrade_name(p.trade_name);
      setPib(p.pib);
      setMb(p.mb);
      setAddress_line(p.address_line);
      setCity(p.city);
      setPostal_code(p.postal_code);
      setCountry(p.country || "RS");
      setPhone(p.phone);
      setContact_email(p.contact_email);
      setWebsite(p.website);
      setTimezone(p.timezone || "Europe/Belgrade");
      setTerms_note(p.terms_note);
      setMax_schedule_days_ahead(p.max_schedule_days_ahead);
      setMin_notice_hours_before_pickup(p.min_notice_hours_before_pickup);
      setPickup_grace_hours_after_slot(p.pickup_grace_hours_after_slot);
      setTelegram_chat_id(p.telegram_chat_id || "");
      setTelegram_bot_token("");
      setTelegram_bot_token_dirty(false);
      setTelegram_notify_new_order(p.telegram_notify_new_order !== false);
      setNotify_before_pickup_minutes(p.notify_before_pickup_minutes ?? 10);
      setDay_reminder_hour_local(p.day_reminder_hour_local ?? 8);
      setSmtp_host(p.smtp_host || "");
      setSmtp_port(p.smtp_port ?? 587);
      setSmtp_user(p.smtp_user || "");
      setSmtp_password("");
      setSmtp_from(p.smtp_from || "");
      setSmtp_use_tls(p.smtp_use_tls !== false);
      setLocations(
        p.locations.length > 0
          ? p.locations.map((l) => ({
              code: l.code,
              name: l.name,
              address_line: l.address_line,
              sort_order: l.sort_order,
              is_active: l.is_active,
            }))
          : [emptyLocation()],
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
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

  function updateLoc(i: number, patch: Partial<TenantLocationInForm>) {
    setLocations((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  function addLoc() {
    setLocations((prev) => [...prev, emptyLocation()]);
  }

  function removeLoc(i: number) {
    setLocations((prev) => (prev.length <= 1 ? [emptyLocation()] : prev.filter((_, j) => j !== i)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    setSaving(true);
    try {
      const locPayload = locations
        .filter((l) => l.code.trim() || l.name.trim())
        .map((l, idx) => ({
          code: l.code.trim(),
          name: l.name.trim() || l.code.trim(),
          address_line: l.address_line.trim(),
          sort_order: l.sort_order || idx,
          is_active: l.is_active,
        }));
      const payload: Record<string, unknown> = {
        legal_name,
        trade_name,
        pib,
        mb,
        address_line,
        city,
        postal_code,
        country,
        phone,
        contact_email,
        website,
        timezone,
        terms_note,
        max_schedule_days_ahead,
        min_notice_hours_before_pickup,
        pickup_grace_hours_after_slot,
        locations: locPayload,
        telegram_chat_id,
        telegram_notify_new_order,
        notify_before_pickup_minutes,
        day_reminder_hour_local,
        smtp_host,
        smtp_port,
        smtp_user,
        smtp_from,
        smtp_use_tls,
      };
      if (smtp_password.trim()) payload.smtp_password = smtp_password.trim();
      if (telegram_bot_token_dirty) payload.telegram_bot_token = telegram_bot_token.trim();
      await apiFetch<TenantProfileOut>("/api/v1/tenant/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setOk(t("tenant.saved"));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h1>{t("tenant.title")}</h1>
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-title-row" style={{ marginBottom: "0.75rem" }}>
        <h1 style={{ marginTop: 0 }}>{t("tenant.title")}</h1>
        <InfoButton label={t("tenant.title")} content={<p style={{ margin: 0 }}>{t("tenant.subtitle")}</p>} />
      </div>

      <form className="card" onSubmit={onSubmit} style={{ maxWidth: 720 }}>
        <h2 style={{ marginTop: 0 }}>{t("tenant.section_company")}</h2>
        <div className="field">
          <label>{t("tenant.legal_name")}</label>
          <input value={legal_name} onChange={(e) => setLegal_name(e.target.value)} maxLength={255} />
        </div>
        <div className="field">
          <label>{t("tenant.trade_name")}</label>
          <input value={trade_name} onChange={(e) => setTrade_name(e.target.value)} maxLength={255} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div className="field">
            <label>{t("tenant.pib")}</label>
            <input value={pib} onChange={(e) => setPib(e.target.value)} maxLength={32} />
          </div>
          <div className="field">
            <label>{t("tenant.mb")}</label>
            <input value={mb} onChange={(e) => setMb(e.target.value)} maxLength={32} />
          </div>
        </div>
        <div className="field">
          <label>{t("tenant.address_line")}</label>
          <input value={address_line} onChange={(e) => setAddress_line(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0.75rem" }}>
          <div className="field">
            <label>{t("tenant.city")}</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={128} />
          </div>
          <div className="field">
            <label>{t("tenant.postal_code")}</label>
            <input value={postal_code} onChange={(e) => setPostal_code(e.target.value)} maxLength={16} />
          </div>
          <div className="field">
            <label>{t("tenant.country")}</label>
            <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div className="field">
            <label>{t("tenant.phone")}</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={64} />
          </div>
          <div className="field">
            <label>{t("tenant.contact_email")}</label>
            <input type="email" value={contact_email} onChange={(e) => setContact_email(e.target.value)} maxLength={255} />
          </div>
        </div>
        <div className="field">
          <label>{t("tenant.website")}</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={255} />
        </div>
        <div className="field">
          <label>{t("tenant.timezone")}</label>
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} maxLength={64} />
        </div>
        <div className="field">
          <label>{t("tenant.terms_note")}</label>
          <textarea value={terms_note} onChange={(e) => setTerms_note(e.target.value)} rows={4} />
        </div>

        <h2>{t("tenant.section_orders")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
          <div className="field">
            <div className="field__label-row">
              <label>{t("tenant.max_schedule_days")}</label>
              <InfoButton
                label={t("tenant.max_schedule_days")}
                content={<p style={{ margin: 0 }}>{t("tenant.max_schedule_days_hint")}</p>}
              />
            </div>
            <input
              type="number"
              min={0}
              max={365}
              value={max_schedule_days_ahead}
              onChange={(e) => setMax_schedule_days_ahead(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <div className="field__label-row">
              <label>{t("tenant.min_notice_hours")}</label>
              <InfoButton
                label={t("tenant.min_notice_hours")}
                content={<p style={{ margin: 0 }}>{t("tenant.min_notice_hours_hint")}</p>}
              />
            </div>
            <input
              type="number"
              min={0}
              max={168}
              value={min_notice_hours_before_pickup}
              onChange={(e) => setMin_notice_hours_before_pickup(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <div className="field__label-row">
              <label>{t("tenant.pickup_grace_hours")}</label>
              <InfoButton
                label={t("tenant.pickup_grace_hours")}
                content={<p style={{ margin: 0 }}>{t("tenant.pickup_grace_hours_hint")}</p>}
              />
            </div>
            <input
              type="number"
              min={1}
              max={720}
              value={pickup_grace_hours_after_slot}
              onChange={(e) => setPickup_grace_hours_after_slot(Number(e.target.value))}
            />
          </div>
        </div>

        <h2>{t("tenant.section_integrations")}</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", maxWidth: 640 }}>{t("tenant.telegram_chat_hint")}</p>
        <div className="field">
          <label>{t("tenant.telegram_bot_token")}</label>
          <input
            type="password"
            autoComplete="new-password"
            value={telegram_bot_token}
            onChange={(e) => {
              setTelegram_bot_token(e.target.value);
              setTelegram_bot_token_dirty(true);
            }}
            maxLength={128}
            placeholder={t("tenant.telegram_bot_token_placeholder")}
          />
        </div>
        <div className="field">
          <label>{t("tenant.telegram_chat_id")}</label>
          <input value={telegram_chat_id} onChange={(e) => setTelegram_chat_id(e.target.value)} maxLength={64} />
        </div>
        <label className="filter-check" style={{ display: "block", marginBottom: "0.75rem" }}>
          <input
            type="checkbox"
            checked={telegram_notify_new_order}
            onChange={(e) => setTelegram_notify_new_order(e.target.checked)}
          />
          {t("tenant.telegram_notify_new")}
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div className="field">
            <label>{t("tenant.notify_before_pickup")}</label>
            <input
              type="number"
              min={0}
              max={720}
              value={notify_before_pickup_minutes}
              onChange={(e) => setNotify_before_pickup_minutes(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>{t("tenant.day_reminder_hour")}</label>
            <input
              type="number"
              min={0}
              max={23}
              value={day_reminder_hour_local}
              onChange={(e) => setDay_reminder_hour_local(Number(e.target.value))}
            />
          </div>
        </div>

        <h3 style={{ marginTop: "1.25rem" }}>{t("tenant.smtp_section")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
          <div className="field">
            <label>{t("tenant.smtp_host")}</label>
            <input value={smtp_host} onChange={(e) => setSmtp_host(e.target.value)} maxLength={255} />
          </div>
          <div className="field">
            <label>{t("tenant.smtp_port")}</label>
            <input type="number" min={1} max={65535} value={smtp_port} onChange={(e) => setSmtp_port(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label>{t("tenant.smtp_user")}</label>
          <input value={smtp_user} onChange={(e) => setSmtp_user(e.target.value)} maxLength={255} />
        </div>
        <div className="field">
          <label>{t("tenant.smtp_password")}</label>
          <input
            type="password"
            autoComplete="new-password"
            value={smtp_password}
            onChange={(e) => setSmtp_password(e.target.value)}
            maxLength={255}
          />
        </div>
        <div className="field">
          <label>{t("tenant.smtp_from")}</label>
          <input type="email" value={smtp_from} onChange={(e) => setSmtp_from(e.target.value)} maxLength={255} />
        </div>
        <label className="filter-check" style={{ display: "block", marginBottom: "1rem" }}>
          <input type="checkbox" checked={smtp_use_tls} onChange={(e) => setSmtp_use_tls(e.target.checked)} />
          {t("tenant.smtp_tls")}
        </label>

        <div className="page-title-row" style={{ marginBottom: "0.5rem" }}>
          <h2>{t("tenant.section_locations")}</h2>
          <InfoButton
            label={t("tenant.section_locations")}
            content={<p style={{ margin: 0 }}>{t("tenant.locations_hint")}</p>}
          />
        </div>
        {locations.map((row, i) => (
          <div
            key={i}
            className="card"
            style={{ marginBottom: "0.75rem", padding: "0.75rem", background: "var(--panel-2, rgba(0,0,0,0.04))" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0.5rem" }}>
              <div className="field">
                <label>{t("tenant.loc_code")}</label>
                <input value={row.code} onChange={(e) => updateLoc(i, { code: e.target.value })} maxLength={64} />
              </div>
              <div className="field">
                <label>{t("tenant.loc_name")}</label>
                <input value={row.name} onChange={(e) => updateLoc(i, { name: e.target.value })} maxLength={255} />
              </div>
            </div>
            <div className="field">
              <label>{t("tenant.loc_address")}</label>
              <input value={row.address_line} onChange={(e) => updateLoc(i, { address_line: e.target.value })} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
              <div className="field" style={{ width: 120 }}>
                <label>{t("tenant.loc_sort")}</label>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={row.sort_order}
                  onChange={(e) => updateLoc(i, { sort_order: Number(e.target.value) })}
                />
              </div>
              <label className="filter-check">
                <input type="checkbox" checked={row.is_active} onChange={(e) => updateLoc(i, { is_active: e.target.checked })} />
                {t("tenant.loc_active")}
              </label>
              <button type="button" className="btn" onClick={() => removeLoc(i)}>
                {t("tenant.loc_remove")}
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="btn" onClick={addLoc} style={{ marginBottom: "1rem" }}>
          {t("tenant.loc_add")}
        </button>

        {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
        {ok && <p style={{ color: "var(--success, #1a7f37)" }}>{ok}</p>}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? t("common.loading") : t("tenant.save")}
        </button>
      </form>
    </div>
  );
}
