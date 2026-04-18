import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import { IconClock } from "./DatePickerIcons";

type Props = {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  disabled?: boolean;
  stepMinutes?: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function normalizeStep(stepMinutes: number | undefined) {
  const s = typeof stepMinutes === "number" ? stepMinutes : 5;
  if (!Number.isFinite(s) || s <= 0) return 5;
  return Math.max(1, Math.min(60, Math.trunc(s)));
}

function isValidHm(v: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(v)) return false;
  const [h, m] = v.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export function TimePicker({ value, onChange, className = "", disabled, stepMinutes }: Props) {
  const { t } = useI18n();
  const step = normalizeStep(stepMinutes);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const out: string[] = [];
    for (let h = 0; h < 24; h += 1) {
      for (let m = 0; m < 60; m += step) {
        out.push(`${pad2(h)}:${pad2(m)}`);
      }
    }
    return out;
  }, [step]);

  const selected = isValidHm(value) ? value : "";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
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
  }, [open]);

  function toggle() {
    if (disabled) return;
    setOpen((v) => !v);
  }

  return (
    <div ref={wrapRef} className={`tp-wrap${className ? ` ${className}` : ""}`}>
      <div
        className={`tp-trigger${open ? " tp-trigger--open" : ""}${disabled ? " tp-trigger--disabled" : ""}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "tp-value" : "tp-placeholder"}>{selected || t("time_picker.placeholder")}</span>
        <IconClock className="tp-clock-icon" />
      </div>

      {open ? (
        <div className="tp-popup" role="listbox">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`tp-option${opt === selected ? " tp-option--sel" : ""}`}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              aria-selected={opt === selected}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
