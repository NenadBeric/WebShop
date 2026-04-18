import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nContext";

export type InfoButtonProps = {
  content: ReactNode;
  /** Shorter name for assistive tech (e.g. section title). */
  label?: string;
  className?: string;
};

export function InfoButton({ content, label, className }: InfoButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const autoId = useId();
  const panelId = `${autoId}-panel`;
  const defaultLabel = t("common.info_tooltip");

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className={["info-btn-wrap", className].filter(Boolean).join(" ")}>
      <button
        type="button"
        className="info-btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label ? `${defaultLabel}: ${label}` : defaultLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <svg className="info-btn__icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden>
          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="6.25" r="1.1" fill="currentColor" />
          <path d="M10 9v5.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div id={panelId} className="info-popover" role="region" aria-label={label || defaultLabel}>
          <div className="info-popover__body">{content}</div>
        </div>
      ) : null}
    </span>
  );
}
