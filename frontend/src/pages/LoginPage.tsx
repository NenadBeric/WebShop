import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { InfoButton } from "../components/InfoButton";
import { useI18n } from "../i18n/I18nContext";

export function LoginPage() {
  const { token, login, isOidc } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("customer@webshop.demo");
  const [password, setPassword] = useState("demo123");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (token) return <Navigate to="/catalog" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setLoading(false);
    }
  }

  if (isOidc) {
    return (
      <div className="login-screen">
        <div className="card login-screen__card">
          <div className="page-title-row" style={{ marginBottom: "0.35rem" }}>
            <h1 style={{ marginTop: 0 }}>{t("login.title")}</h1>
            <InfoButton label={t("login.oidc")} content={<p style={{ margin: 0 }}>{t("login.oidc_hint")}</p>} />
          </div>
          {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={() => {
              setErr(null);
              setLoading(true);
              void login("", "")
                .catch((ex) => setErr(ex instanceof Error ? ex.message : String(ex)))
                .finally(() => setLoading(false));
            }}
          >
            {loading ? t("common.loading") : t("login.oidc")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="card login-screen__card">
        <div className="page-title-row" style={{ marginBottom: "0.35rem" }}>
          <h1 style={{ marginTop: 0 }}>{t("login.title")}</h1>
          <InfoButton label={t("login.title")} content={<p style={{ margin: 0 }}>{t("login.hint")}</p>} />
        </div>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>{t("login.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              inputMode="email"
            />
          </div>
          <div className="field">
            <label>{t("login.password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? t("common.loading") : t("login.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
