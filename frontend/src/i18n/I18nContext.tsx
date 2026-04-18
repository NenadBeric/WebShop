import { t as translate } from "./l10nShim";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { changeLanguage as applyL10nLang, getSavedLanguage, initI18n } from "./setup";

type Lang = "sr" | "en" | "ru" | "zh";

function normalizeLang(raw: string): Lang {
  const l = raw.toLowerCase();
  return l === "en" || l === "ru" || l === "zh" ? l : "sr";
}

type I18nCtx = {
  lang: Lang;
  setLang: (l: string) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  i18nReady: boolean;
};

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => normalizeLang(getSavedLanguage()));
  const [ready, setReady] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await initI18n(lang);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback(async (l: string) => {
    const next = normalizeLang(l);
    await applyL10nLang(next);
    setLangState(next);
    setTick((x) => x + 1);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      try {
        return translate(key, vars);
      } catch {
        return key;
      }
    },
    [lang],
  );

  const value = useMemo(
    () => ({ lang, setLang, t, i18nReady: ready }),
    [lang, setLang, t, ready],
  );

  if (!ready) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "40vh", color: "var(--muted, #888)" }}>
        Loading…
      </div>
    );
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside I18nProvider");
  return c;
}
