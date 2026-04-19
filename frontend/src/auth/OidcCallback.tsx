import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { setToken } from "../api/client";
import { setAdminTenantIdInStorage } from "../lib/adminTenant";
import { userManager } from "./oidc-config";

export function OidcCallback() {
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (!userManager) {
      navigate("/login", { replace: true });
      return;
    }

    userManager
      .signinRedirectCallback()
      .then((user) => {
        if (user?.access_token) {
          setToken(user.access_token);
          setAdminTenantIdInStorage(null);
        }
        navigate("/catalog", { replace: true });
      })
      .catch(() => {
        navigate("/login", { replace: true });
      });
  }, [navigate]);

  return <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>Signing in…</div>;
}
