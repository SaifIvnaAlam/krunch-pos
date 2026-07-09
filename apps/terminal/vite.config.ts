import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const apiProxyTarget =
    env.DEV_API_PROXY_TARGET?.trim() ||
    "https://steakandmarrow.inventivelab.bd";

  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    plugins: [react(), tailwindcss()],
    server: {
      port: 1420,
      strictPort: false,
      proxy: {
        // secure: false — prod API uses a self-signed / private CA cert
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        "/media": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => `/api/v1${path}`,
        },
      },
    },
  };
});
