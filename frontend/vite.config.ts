import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const isWindows = process.platform === "win32";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.VITE_BACKEND_PROXY || "http://localhost:8000";
  const l10nProxyTarget =
    env.L10N_PROXY_TARGET || env.VITE_L10N_PROXY_TARGET || "http://localhost:4000";

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      watch: isWindows
        ? { usePolling: true, interval: 300 }
        : undefined,
      proxy: {
        "/api": {
          target: backend,
          changeOrigin: true,
          timeout: 120000,
          proxyTimeout: 120000,
        },
        "/static": {
          target: backend,
          changeOrigin: true,
        },
        "/l10n": {
          target: l10nProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
