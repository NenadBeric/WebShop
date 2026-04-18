import { UserManager, WebStorageStateStore } from "oidc-client-ts";

const OIDC_AUTHORITY = import.meta.env.VITE_OIDC_AUTHORITY as string | undefined;
const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined;

export const IS_OIDC = !!(OIDC_AUTHORITY && OIDC_CLIENT_ID);

export const userManager: UserManager | null = IS_OIDC
  ? new UserManager({
      authority: OIDC_AUTHORITY!,
      client_id: OIDC_CLIENT_ID!,
      redirect_uri: `${window.location.origin}/callback`,
      post_logout_redirect_uri: window.location.origin,
      scope: "openid profile email urn:zitadel:iam:org:project:id:zitadel:aud",
      loadUserInfo: true,
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      automaticSilentRenew: true,
    })
  : null;
