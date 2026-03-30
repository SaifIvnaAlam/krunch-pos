import type { ThemeMode } from "./themeStorage";

/** Updates native window chrome (title bar on Windows) to match app theme. No-op in browser. */
export async function syncNativeWindowTheme(mode: ThemeMode): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTheme(mode);
  } catch {
    /* Not running inside Tauri, or API unavailable */
  }
}
