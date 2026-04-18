import { useMemo } from "react";
import { DatePicker } from "./DatePicker";
import { TimePicker } from "./TimePicker";

type Props = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
};

function splitDatetimeLocal(s: string): { date: string; time: string } {
  if (!s || !s.includes("T")) return { date: "", time: "" };
  const [d, rest] = s.split("T");
  const time = (rest || "").slice(0, 5);
  return { date: d || "", time: /^\d{2}:\d{2}$/.test(time) ? time : "" };
}

function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function defaultDateForTime(min?: string, max?: string): string {
  const t = todayYmd();
  const minD = min && min.length >= 10 ? min.slice(0, 10) : undefined;
  const maxD = max && max.length >= 10 ? max.slice(0, 10) : undefined;
  if (minD && t < minD) return minD;
  if (maxD && t > maxD) return maxD;
  return t;
}

function ymdBounds(min?: string, max?: string): { min?: string; max?: string } {
  return {
    min: min && min.length >= 10 ? min.slice(0, 10) : undefined,
    max: max && max.length >= 10 ? max.slice(0, 10) : undefined,
  };
}

/** Zamena za native datetime-local — isti UX kao Trainify (DatePicker + TimePicker). */
export function DatetimeLocalPicker({ id, value, onChange, min, max, disabled }: Props) {
  const { date: datePart, time: timePart } = useMemo(() => splitDatetimeLocal(value), [value]);
  const { min: minD, max: maxD } = useMemo(() => ymdBounds(min, max), [min, max]);

  return (
    <div className="dtp-wrap">
      <DatePicker
        id={id}
        value={datePart}
        onChange={(nextYmd) => {
          if (!nextYmd) {
            onChange("");
            return;
          }
          const tm = timePart || "12:00";
          onChange(`${nextYmd}T${tm}`);
        }}
        disabled={disabled}
        min={minD}
        max={maxD}
        portal
      />
      <TimePicker
        className="dtp-time"
        value={timePart}
        disabled={disabled}
        stepMinutes={5}
        onChange={(raw) => {
          const d = datePart || defaultDateForTime(min, max);
          onChange(`${d}T${raw}`);
        }}
      />
    </div>
  );
}
