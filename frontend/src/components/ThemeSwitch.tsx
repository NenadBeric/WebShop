import { useCallback, useState } from "react";
import { readThemeIsLight, setThemeIsLight } from "../theme";
import { useI18n } from "../i18n/I18nContext";
import { IconMoon, IconSun } from "./NavIcons";

export function ThemeSwitch() {
  const { t } = useI18n();
  const [isLight, setIsLight] = useState(readThemeIsLight);

  const goDark = useCallback(() => {
    setThemeIsLight(false);
    setIsLight(false);
  }, []);

  const goLight = useCallback(() => {
    setThemeIsLight(true);
    setIsLight(true);
  }, []);

  const toggleRail = useCallback(() => {
    setIsLight((prev) => {
      const next = !prev;
      setThemeIsLight(next);
      return next;
    });
  }, []);

  return (
    <div className="theme-toggle" role="group" aria-label={t("nav.theme")}>
      <span className="theme-toggle__label">{t("nav.theme_label")}</span>
      <div className="theme-toggle__control">
        <button
          type="button"
          className={`theme-toggle__icon-btn${!isLight ? " is-active" : ""}`}
          onClick={goDark}
          title={t("nav.theme_dark")}
          aria-pressed={!isLight}
        >
          <IconMoon />
        </button>
        <button type="button" className="theme-toggle__rail" onClick={toggleRail} aria-label={t("nav.theme_toggle")} title={t("nav.theme_toggle")}>
          <span className={`theme-toggle__ball${isLight ? " is-right" : ""}`} />
        </button>
        <button
          type="button"
          className={`theme-toggle__icon-btn${isLight ? " is-active" : ""}`}
          onClick={goLight}
          title={t("nav.theme_light")}
          aria-pressed={isLight}
        >
          <IconSun />
        </button>
      </div>
    </div>
  );
}
