function cx(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

export type LangOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: LangOption[];
  ariaLabel: string;
};

/**
 * Izbor jezika bez padajuće liste — za mobilni drawer (sve opcije vidljive, bez skrolovanja u panelu).
 */
export function LanguagePickerBar({ value, onChange, options, ariaLabel }: Props) {
  const items = options.filter((o) => o.value !== "");
  return (
    <div className="language-picker-bar" role="radiogroup" aria-label={ariaLabel}>
      {items.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={cx("language-picker-bar__btn", active && "language-picker-bar__btn--active")}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
