import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

function cx(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

type Props = {
  /** Tekst na dugmetu (npr. „Filteri“). */
  toggleLabel: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/**
 * Na uskom ekranu (≤640px) filteri se skupljaju u red sa strelicom u primarnoj boji (Trainify billing-board-filters).
 */
export function MobileCollapsibleFilters({ toggleLabel, className, style, children }: Props) {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false,
  );
  const [open, setOpen] = useState(() =>
    typeof window !== "undefined" ? !window.matchMedia("(max-width: 640px)").matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => {
      const c = mq.matches;
      setCompact(c);
      setOpen(!c);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div className={cx("card", "mobile-collapsible-filters", className)} style={style}>
      {compact ? (
        <button
          type="button"
          className="mobile-collapsible-filters__toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="mobile-collapsible-filters__toggle-label">{toggleLabel}</span>
          <span
            className={cx("mobile-collapsible-filters__chevron", open && "mobile-collapsible-filters__chevron--open")}
            aria-hidden
          />
        </button>
      ) : null}
      <div
        className={cx(
          "mobile-collapsible-filters__body",
          compact && !open && "mobile-collapsible-filters__body--hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
