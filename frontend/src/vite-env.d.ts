/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_PROXY?: string;
  readonly VITE_OIDC_AUTHORITY?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  readonly VITE_L10N_BASE_URL?: string;
  readonly VITE_L10N_APP_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
