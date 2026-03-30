/** Keep in sync with inline script in index.html (localStorage key). */
export const THEME_STORAGE_KEY = "remi-pos-theme";

export type ThemeMode = "light" | "dark";

export function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    /* ignore */
  }
  return "light";
}
