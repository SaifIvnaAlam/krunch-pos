/**
 * Central place for Vite env reads (feature modules import from here).
 */
const raw = import.meta.env;

export function getApiBaseUrl(): string {
  const v = raw.VITE_API_URL;
  return (
    (typeof v === "string" && v.length > 0
      ? v
      : "http://localhost:3000/api/v1"
    ).replace(/\/+$/, "")
  );
}

/** Local UI-only mock auth (no API). Opt-in with `VITE_USE_DEMO_DATA=true`. */
export function isDemoDataMode(): boolean {
  return raw.VITE_USE_DEMO_DATA === "true";
}

/** Email allowed on the sign-in form in API mode (must match seeded staff). */
export function getSeededAdminEmail(): string {
  const v = raw.VITE_SEEDED_ADMIN_EMAIL;
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return "owner@universalpos.local";
}

export function getDefaultBranchId(): string {
  const v = raw.VITE_DEFAULT_BRANCH_ID;
  if (typeof v === "string" && v.length > 0) return v;
  return "a0000000-0000-4000-8000-000000000001";
}

export function getDefaultTerminalId(): string {
  const v = raw.VITE_DEFAULT_TERMINAL_ID;
  if (typeof v === "string" && v.length > 0) return v;
  return "terminal-dev-001";
}
