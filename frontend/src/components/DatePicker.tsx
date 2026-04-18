import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "./DatePickerIcons";

type Props = {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** Kalendar u portalu (overflow u kartici / modalu). */
  portal?: boolean;
};

const DP_POPUP_W = 272;
const DP_POPUP_EST_H = 340;
const DP_GAP = 6;

function intlLocale(lang: string): string {
  if (lang === "sr") return "sr-Latn-RS";
  if (lang === "ru") return "ru-RU";
  if (lang === "zh") return "zh-CN";
  return "en-GB";
}

function weekdaysMonFirst(lang: string): string[] {
  const loc = intlLocale(lang);
  const fmt = new Intl.DateTimeFormat(loc, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
}

function formatMonthTitle(lang: string, viewYear: number, viewMonth: number): string {
  const loc = intlLocale(lang);
  return new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" }).format(new Date(viewYear, viewMonth, 1));
}

function formatDisplayYmd(lang: string, ymd: string): string {
  const p = parseYmd(ymd);
  if (!p) return "";
  const loc = intlLocale(lang);
  return new Intl.DateTimeFormat(loc, { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(p.y, p.m - 1, p.d),
  );
}

function computePortalPosition(trigger: DOMRect): { top: number; left: number } {
  const pad = 8;
  let top = trigger.bottom + DP_GAP;
  const spaceBelow = window.innerHeight - trigger.bottom - DP_GAP;
  const spaceAbove = trigger.top - DP_GAP;
  if (spaceBelow < DP_POPUP_EST_H && spaceAbove > spaceBelow && spaceAbove >= DP_POPUP_EST_H * 0.85) {
    top = trigger.top - DP_POPUP_EST_H - DP_GAP;
  }
  top = Math.max(pad, Math.min(top, window.innerHeight - DP_POPUP_EST_H - pad));
  let left = trigger.left;
  if (left + DP_POPUP_W + pad > window.innerWidth) {
    left = Math.max(pad, trigger.right - DP_POPUP_W);
  }
  if (left < pad) left = pad;
  return { top, left };
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const raw = (ymd ?? "").trim();
  if (!raw) return null;
  const head = raw.length >= 10 ? raw.slice(0, 10) : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return null;
  const [yStr, mStr, dStr] = head.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function comparableYmd(raw: string): string | null {
  const p = parseYmd(raw);
  if (!p) return null;
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  className = "",
  placeholder,
  disabled,
  id,
  portal = false,
}: Props) {
  const { t, lang } = useI18n();
  const today = todayYmd();
  const rawValue = value ?? "";
  const parsed = parseYmd(rawValue);

  const [viewYear, setViewYear] = useState(() => parsed?.y ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (parsed ? parsed.m - 1 : new Date().getMonth()));
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [alignRight, setAlignRight] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [portalPos, setPortalPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const p = parseYmd(rawValue);
    if (!open) {
      if (p) {
        setViewYear(p.y);
        setViewMonth(p.m - 1);
      } else {
        const d = new Date();
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
      return;
    }
    if (p) {
      setViewYear(p.y);
      setViewMonth(p.m - 1);
    }
  }, [open, rawValue]);

  useLayoutEffect(() => {
    if (!open || !portal || !triggerRef.current) return;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      setPortalPos(computePortalPosition(el.getBoundingClientRect()));
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, portal, viewYear, viewMonth]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (portal) {
        if (wrapRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      } else if (wrapRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, portal]);

  function openPicker() {
    if (disabled) return;
    if (!open) {
      const p = parseYmd(rawValue);
      if (p) {
        setViewYear(p.y);
        setViewMonth(p.m - 1);
      } else {
        const d = new Date();
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setAbove(window.innerHeight - rect.bottom < 320);
        const popupW = 272;
        const pad = 8;
        const overflowRight = rect.left + popupW + pad > window.innerWidth;
        const overflowLeft = rect.right - popupW - pad < 0;
        setAlignRight(overflowRight && !overflowLeft);
      }
    }
    setOpen((v) => !v);
  }

  const selectedYmd = comparableYmd(rawValue);
  const dayNames = weekdaysMonFirst(lang);
  const monthTitle = formatMonthTitle(lang, viewYear, viewMonth);

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const day = i - startOffset + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  function dayToYmd(day: number): string {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function selectDay(day: number) {
    const ymd = dayToYmd(day);
    if (min && ymd < min) return;
    if (max && ymd > max) return;
    onChange(ymd);
    setOpen(false);
  }

  function prevMonth() {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }
  function nextMonth() {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }

  const displayStr = rawValue ? formatDisplayYmd(lang, rawValue) : "";
  const ph = placeholder ?? t("date_picker.placeholder");

  const popupInner = (
    <>
      <div className="dp-header">
        <button type="button" className="dp-nav" onClick={prevMonth} aria-label={t("date_picker.prev_month")}>
          <IconChevronLeft />
        </button>
        <span className="dp-month-title">{monthTitle}</span>
        <button type="button" className="dp-nav" onClick={nextMonth} aria-label={t("date_picker.next_month")}>
          <IconChevronRight />
        </button>
      </div>

      <div className="dp-grid">
        {dayNames.map((n, i) => (
          <div key={i} className="dp-day-hdr">
            {n}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div key={idx} className="dp-cell dp-cell--gap" />;
          const ymd = dayToYmd(day);
          const isSel = selectedYmd != null && ymd === selectedYmd;
          const isToday = ymd === today;
          const isDis = Boolean((min && ymd < min) || (max && ymd > max));
          return (
            <button
              key={idx}
              type="button"
              onClick={() => !isDis && selectDay(day)}
              className={[
                "dp-cell",
                isSel && "dp-cell--sel",
                isToday && !isSel && "dp-cell--today",
                isDis && "dp-cell--dis",
              ]
                .filter(Boolean)
                .join(" ")}
              tabIndex={isDis ? -1 : 0}
              aria-pressed={isSel}
              aria-disabled={isDis || undefined}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="dp-footer">
        <button
          type="button"
          className="dp-foot-btn"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
        >
          {t("date_picker.clear")}
        </button>
        <button
          type="button"
          className="dp-foot-btn dp-foot-btn--today"
          onClick={() => {
            onChange(today);
            setOpen(false);
          }}
        >
          {t("date_picker.today")}
        </button>
      </div>
    </>
  );

  return (
    <div className={`dp-wrap${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <div
        ref={triggerRef}
        id={id}
        className={`dp-trigger${open ? " dp-trigger--open" : ""}${disabled ? " dp-trigger--disabled" : ""}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={rawValue ? "dp-value" : "dp-placeholder"}>{rawValue ? displayStr : ph}</span>
        <IconCalendar className="dp-cal-icon" />
      </div>

      {open && !portal ? (
        <div
          className={`dp-popup${above ? " dp-popup--above" : ""}${alignRight ? " dp-popup--right" : ""}`}
          role="dialog"
        >
          {popupInner}
        </div>
      ) : null}
      {open &&
        portal &&
        createPortal(
          <div
            ref={popupRef}
            className="dp-popup dp-popup--portal"
            role="dialog"
            style={{
              position: "fixed",
              top: portalPos.top,
              left: portalPos.left,
              width: DP_POPUP_W,
              zIndex: "var(--z-portal)",
            }}
          >
            {popupInner}
          </div>,
          document.body,
        )}
    </div>
  );
}
