import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nContext";

export type SearchableSelectOption = { value: string; label: string };

type Props = {
  id?: string;
  label?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  emptyLabel?: string;
  /**
   * Kada je true (podrazumevano), prvi red briše izbor (vrednost "").
   * Kada je false (npr. sortiranje), nema tog reda i ne koristi se prazan string.
   */
  allowEmpty?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** Panel u document.body (modal / overflow). */
  portal?: boolean;
  className?: string;
};

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Padajuća lista sa lokalnom pretragom (Trainify isti UX: trigger + panel + caret).
 */
export function SearchableSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  emptyLabel = "—",
  allowEmpty = true,
  disabled,
  loading,
  portal = false,
  className,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [portalPos, setPortalPos] = useState({ top: 0, left: 0, width: 0, maxH: 280 });

  const emptyOption = useMemo(
    () => (allowEmpty ? options.find((o) => o.value === "") : undefined),
    [allowEmpty, options],
  );
  const effectiveEmptyLabel = emptyOption?.label ?? emptyLabel;
  const nonEmptyOptions = useMemo(() => options.filter((o) => o.value !== ""), [options]);

  const selected = useMemo(() => {
    if (value === "") return undefined;
    return options.find((o) => o.value === value);
  }, [options, value]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return nonEmptyOptions;
    return nonEmptyOptions.filter((o) => o.label.toLowerCase().includes(qq));
  }, [nonEmptyOptions, q]);

  const showNoResults =
    open && filtered.length === 0 && nonEmptyOptions.length > 0 && q.trim().length > 0;
  const showEmptyOptions =
    open &&
    nonEmptyOptions.length === 0 &&
    !loading &&
    !(allowEmpty && emptyOption !== undefined);

  useLayoutEffect(() => {
    if (!open || !portal || !triggerRef.current) return;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const maxH = Math.min(280, Math.max(120, window.innerHeight - r.bottom - 16));
      setPortalPos({ top: r.bottom + 4, left: r.left, width: r.width, maxH });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, portal]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!open) return;
      const target = e.target as Node;
      if (portal) {
        if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      } else if (rootRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, portal]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const finePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
    if (finePointer) {
      searchInputRef.current?.focus();
    }
  }, [open]);

  const isBusy = disabled || loading;

  const panelInner = (
    <>
      {label ? (
        <div className="searchable-select__panel-header" aria-live="polite">
          <div className="searchable-select__panel-title">
            <strong>{label}</strong>
            <span style={{ opacity: 0.85 }}>
              {" "}
              — {t("searchable_select.selected")}: <strong>{selected?.label ?? effectiveEmptyLabel}</strong>
            </span>
          </div>
          <div className="searchable-select__panel-count">
            {t("searchable_select.showing_results", { count: String(filtered.length) })}
            {q.trim().length > 0 ? ` ${t("searchable_select.for_query", { query: q.trim() })}` : ""}.
          </div>
        </div>
      ) : null}
      <input
        ref={searchInputRef}
        type="search"
        className="searchable-select__search"
        placeholder={placeholder ?? t("common.search_placeholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        autoComplete="off"
      />
      <ul className="searchable-select__list" role="listbox">
        {allowEmpty ? (
          <li>
            <button
              type="button"
              className="searchable-select__option"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {effectiveEmptyLabel}
            </button>
          </li>
        ) : null}
        {showEmptyOptions ? (
          <li className="searchable-select__empty-hint" aria-live="polite">
            {t("searchable_select.no_options")}
          </li>
        ) : showNoResults ? (
          <li className="searchable-select__empty-hint" aria-live="polite">
            {t("searchable_select.no_results", { query: q.trim() })}
          </li>
        ) : (
          filtered.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className={cx(
                  "searchable-select__option",
                  o.value === value && "searchable-select__option--selected",
                )}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))
        )}
      </ul>
    </>
  );

  return (
    <div
      ref={rootRef}
      className={cx(
        "searchable-select",
        portal && "searchable-select--portal-root",
        open && "searchable-select--open",
        className,
      )}
    >
      {label ? (
        <label className="searchable-select__label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={cx("searchable-select__trigger", loading && "searchable-select__trigger--loading")}
        disabled={isBusy}
        onClick={() => !isBusy && setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="searchable-select__trigger-value">
          {loading ? t("common.loading") : selected?.label ?? (value === "" ? effectiveEmptyLabel : "—")}
        </span>
        <span className="searchable-select__caret" aria-hidden />
      </button>
      {open && !portal ? (
        <div ref={panelRef} className="searchable-select__panel">
          {panelInner}
        </div>
      ) : null}
      {open &&
        portal &&
        createPortal(
          <div
            ref={panelRef}
            className="searchable-select__panel searchable-select__panel--portal"
            style={{
              position: "fixed",
              top: portalPos.top,
              left: portalPos.left,
              width: portalPos.width,
              maxHeight: portalPos.maxH,
              zIndex: "var(--z-portal)",
            }}
          >
            {panelInner}
          </div>,
          document.body,
        )}
    </div>
  );
}
