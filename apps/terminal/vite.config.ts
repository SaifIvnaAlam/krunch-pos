import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const apiProxyTarget =
    env.DEV_API_PROXY_TARGET?.trim() ||
    "https://steakandmarrow.inventivelab.bd";
  const apiProxySecure = apiProxyTarget.startsWith("https://");

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
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: apiProxySecure,
        },
        "/media": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: apiProxySecure,
          rewrite: (path) => `/api/v1${path}`,
        },
      },
    },
  };
});
