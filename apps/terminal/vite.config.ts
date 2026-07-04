import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const apiProxyTarget =
    env.DEV_API_PROXY_TARGET?.trim() || "http://localhost:3001";
  const apiProxySecure = apiProxyTarget.startsWith("https://");

  // @ts-expect-error process is a nodejs global
  const host = process.env.TAURI_DEV_HOST;

  return {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. Browser `npm run dev`: if 1420 is busy, use the next port (strictPort: false).
  //    Tauri runs `npm run dev -- --strictPort` so desktop dev still pins 1420 (see tauri.conf.json).
  server: {
    port: 1420,
    strictPort: false,
    host: host || false,
    // Same-origin API in browser dev (VITE_API_URL=/api/v1).
    // Default: local Nest on :3001. Set DEV_API_PROXY_TARGET to production URL to use prod DB.
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
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
};
});
