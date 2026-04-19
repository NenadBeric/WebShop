import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client";
import { applyTenantThemeToDocument, type TenantThemeDto } from "../theme/applyTenantTheme";
import {
  autoButtonHoverFromPrimary,
  TENANT_THEME_DEFAULT_BORDER_RADIUS_PX,
  TENANT_THEME_FONT_CODES,
} from "../theme/tenantThemeFontOptions";
import { SearchableSelect } from "./SearchableSelect";
import { useI18n } from "../i18n/I18nContext";

const PRESETS = ["TRAINIFY", "DARK_A", "DARK_B", "LIGHT_A"] as const;

type Props = {
  onClose: () => void;
};

export function TenantThemeBrandingModal({ onClose }: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [themePreset, setThemePreset] = useState<string>("TRAINIFY");
  const [primaryColorHex, setPrimaryColorHex] = useState("#3b82f6");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [server, setServer] = useState<TenantThemeDto | null>(null);
  const [borderRadiusPx, setBorderRadiusPx] = useState(TENANT_THEME_DEFAULT_BORDER_RADIUS_PX);
  const [radiusDirty, setRadiusDirty] = useState(false);
  const [themeFont, setThemeFont] = useState("");
  const [fontDirty, setFontDirty] = useState(false);
  const [hoverManual, setHoverManual] = useState(false);
  const [buttonHoverHex, setButtonHoverHex] = useState("#2563eb");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setErr(null);
      setLoading(true);
      try {
        const data = await apiFetch<TenantThemeDto>("/api/v1/tenant/theme");
        if (cancelled) return;
        setServer(data);
        setThemePreset(data.themePreset ? String(data.themePreset) : "TRAINIFY");
        setPrimaryColorHex(data.primaryColorHex || "#3b82f6");
        setBorderRadiusPx(data.borderRadiusPx ?? TENANT_THEME_DEFAULT_BORDER_RADIUS_PX);
        setRadiusDirty(false);
        setThemeFont(data.themeFont ?? "");
        setFontDirty(false);
        const hasHover = !!data.buttonHoverHex;
        setHoverManual(hasHover);
        const base = data.primaryColorHex || "#3b82f6";
        setButtonHoverHex(hasHover ? (data.buttonHoverHex as string) : autoButtonHoverFromPrimary(base));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveBorderRadiusPx = useMemo(() => {
    if (radiusDirty) return borderRadiusPx;
    if (server?.borderRadiusPx != null) return server.borderRadiusPx;
    return null;
  }, [radiusDirty, borderRadiusPx, server?.borderRadiusPx]);

  const effectiveThemeFont = useMemo(() => {
    if (fontDirty) return themeFont || null;
    return server?.themeFont ?? null;
  }, [fontDirty, themeFont, server?.themeFont]);

  useEffect(() => {
    if (hoverManual) return;
    const base = primaryColorHex.startsWith("#") && primaryColorHex.length >= 7 ? primaryColorHex : "#3b82f6";
    setButtonHoverHex(autoButtonHoverFromPrimary(base));
  }, [primaryColorHex, hoverManual]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent("webshop-tenant-theme"));
    };
  }, []);

  const tid = (server?.tenantId || "").trim();

  const previewTheme = (): TenantThemeDto => {
    const presetOk = themePreset && themePreset !== "TRAINIFY" ? themePreset : null;
    const customPrimary = presetOk && primaryColorHex ? primaryColorHex : null;
    return {
      tenantId: tid,
      themePreset: presetOk,
      primaryColorHex: customPrimary,
      hasLogo: Boolean(server?.hasLogo || logoFile),
      logoPath: server?.logoPath ?? null,
      borderRadiusPx: effectiveBorderRadiusPx ?? undefined,
      themeFont: effectiveThemeFont,
      buttonHoverHex: customPrimary && hoverManual ? buttonHoverHex : null,
    };
  };

  useEffect(() => {
    if (!tid) return;
    applyTenantThemeToDocument(previewTheme(), null);
  }, [
    themePreset,
    primaryColorHex,
    tid,
    server?.hasLogo,
    logoFile,
    effectiveBorderRadiusPx,
    effectiveThemeFont,
    buttonHoverHex,
    hoverManual,
  ]);

  const autoHoverLabel = useMemo(
    () => autoButtonHoverFromPrimary(primaryColorHex.startsWith("#") ? primaryColorHex : "#3b82f6"),
    [primaryColorHex],
  );

  const handleSave = async () => {
    setErr(null);
    setSaving(true);
    try {
      if (logoFile) {
        const fd = new FormData();
        fd.append("file", logoFile);
        await apiFetch("/api/v1/tenant/theme/logo", { method: "POST", body: fd });
      }
      const customPrimary = themePreset !== "TRAINIFY" ? primaryColorHex : null;
      await apiFetch("/api/v1/tenant/theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themePreset,
          primaryColorHex: customPrimary,
          borderRadiusPx,
          themeFont: themeFont || null,
          buttonHoverHex: customPrimary && hoverManual ? buttonHoverHex : null,
        }),
      });
      const next = await apiFetch<TenantThemeDto>("/api/v1/tenant/theme");
      setServer(next);
      setRadiusDirty(false);
      setFontDirty(false);
      setLogoFile(null);
      window.dispatchEvent(new CustomEvent("webshop-tenant-theme"));
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm(t("tenant.theme.confirmReset"))) return;
    setErr(null);
    setSaving(true);
    try {
      await apiFetch("/api/v1/tenant/theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToTrainifyDefaults: true }),
      });
      setThemePreset("TRAINIFY");
      setPrimaryColorHex("#3b82f6");
      setBorderRadiusPx(TENANT_THEME_DEFAULT_BORDER_RADIUS_PX);
      setThemeFont("");
      setHoverManual(false);
      setButtonHoverHex(autoButtonHoverFromPrimary("#3b82f6"));
      setLogoFile(null);
      const next = await apiFetch<TenantThemeDto>("/api/v1/tenant/theme");
      setServer(next);
      setBorderRadiusPx(next.borderRadiusPx ?? TENANT_THEME_DEFAULT_BORDER_RADIUS_PX);
      setRadiusDirty(false);
      setThemeFont(next.themeFont ?? "");
      setFontDirty(false);
      applyTenantThemeToDocument(next, null);
      window.dispatchEvent(new CustomEvent("webshop-tenant-theme"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t("tenant.theme.modalTitle")}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("nav.close_menu")}>
            ×
          </button>
        </div>
        <div>
          {loading && <p className="text-muted">{t("common.loading")}</p>}
          {err && (
            <div className="card" style={{ marginBottom: 12, color: "var(--danger)" }}>
              {err}
            </div>
          )}
          {!loading && (
            <>
              <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                {t("tenant.theme.intro")}
              </p>
              <div className="field">
                <SearchableSelect
                  label={t("tenant.theme.preset")}
                  value={themePreset}
                  onChange={(v) => {
                    setThemePreset(v);
                    if (v === "TRAINIFY") setPrimaryColorHex("#3b82f6");
                  }}
                  options={PRESETS.map((p) => ({ value: p, label: t(`tenant.theme.preset.${p}`) }))}
                  allowEmpty={false}
                  portal
                />
              </div>
              {themePreset !== "TRAINIFY" && (
                <div className="field">
                  <label>{t("tenant.theme.primary")}</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="color"
                      value={primaryColorHex.startsWith("#") ? primaryColorHex : "#3b82f6"}
                      onChange={(e) => setPrimaryColorHex(e.target.value)}
                      style={{ width: 48, height: 36, padding: 0, border: "none", background: "transparent" }}
                      aria-label={t("tenant.theme.primary")}
                    />
                    <input value={primaryColorHex} onChange={(e) => setPrimaryColorHex(e.target.value)} placeholder="#3b82f6" />
                  </div>
                </div>
              )}
              <div className="field">
                <label>
                  {t("tenant.theme.borderRadius")}{" "}
                  <span className="text-muted" style={{ fontWeight: 400 }}>
                    ({borderRadiusPx}px)
                  </span>
                </label>
                <input
                  type="range"
                  className="gym-theme-radius-slider"
                  min={0}
                  max={16}
                  step={1}
                  value={borderRadiusPx}
                  onChange={(e) => {
                    setBorderRadiusPx(Number(e.target.value));
                    setRadiusDirty(true);
                  }}
                />
                <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {t("tenant.theme.borderRadiusHint")}
                </p>
              </div>
              <div className="field">
                <SearchableSelect
                  label={t("tenant.theme.fontFamily")}
                  value={themeFont}
                  onChange={(v) => {
                    setThemeFont(v);
                    setFontDirty(true);
                  }}
                  options={TENANT_THEME_FONT_CODES.map((code) => ({ value: code, label: t(`tenant.theme.font.${code}`) }))}
                  emptyLabel={t("tenant.theme.fontDefault")}
                  portal
                />
              </div>
              {themePreset !== "TRAINIFY" && (
                <div className="field">
                  <label>{t("tenant.theme.hoverSecondary")}</label>
                  <p className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                    {t("tenant.theme.hoverAutoHint", { hex: autoHoverLabel })}
                  </p>
                  <label className="gym-theme-hover-row">
                    <input
                      type="checkbox"
                      checked={hoverManual}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setHoverManual(on);
                        if (!on) setButtonHoverHex(autoButtonHoverFromPrimary(primaryColorHex));
                      }}
                    />
                    <span>{t("tenant.theme.hoverManual")}</span>
                  </label>
                  {hoverManual && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <input
                        type="color"
                        value={buttonHoverHex.startsWith("#") ? buttonHoverHex : autoHoverLabel}
                        onChange={(e) => setButtonHoverHex(e.target.value)}
                        style={{ width: 48, height: 36, padding: 0, border: "none", background: "transparent" }}
                        aria-label={t("tenant.theme.hoverSecondary")}
                      />
                      <input value={buttonHoverHex} onChange={(e) => setButtonHoverHex(e.target.value)} placeholder={autoHoverLabel} />
                    </div>
                  )}
                </div>
              )}
              <div className="field">
                <label>{t("tenant.theme.logo")}</label>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
                {server?.hasLogo && !logoFile && (
                  <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {t("tenant.theme.logoCurrent")}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn btn--secondary" onClick={() => void handleReset()} disabled={saving || loading}>
            {t("tenant.theme.reset")}
          </button>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void handleSave()} disabled={saving || loading}>
            {saving ? t("common.loading") : t("tenant.theme.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
