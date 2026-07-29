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

/** Stable public base for `media:{id}` refs (no trailing slash). */
export function getMediaPublicBaseUrl(): string {
  const v = raw.VITE_MEDIA_PUBLIC_BASE_URL;
  if (typeof v === "string" && v.length > 0) {
    return v.replace(/\/+$/, "");
  }
  return "https://s3.storage.inventivelab.bd/media";
}

export function getMediaPublicUrl(mediaId: string): string {
  return `${getMediaPublicBaseUrl()}/${mediaId}`;
}

/**
 * Public origin for phone QR capture links (no trailing slash).
 * Prefer `VITE_PUBLIC_APP_URL` so local PC browsers still encode the VPS URL
 * phones can reach. Falls back to absolute `VITE_API_URL` host, then `location.origin`.
 */
export function getPublicAppOrigin(): string {
  const explicit = raw.VITE_PUBLIC_APP_URL;
  if (typeof explicit === "string" && explicit.trim().length > 0) {
    return explicit.trim().replace(/\/+$/, "");
  }
  const api = getApiBaseUrl();
  if (/^https?:\/\//i.test(api)) {
    return api.replace(/\/api\/v1\/?$/i, "").replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "";
}

export function getPhoneCaptureUrl(sessionToken: string): string {
  const origin = getPublicAppOrigin();
  const token = sessionToken.trim();
  return `${origin}/capture/${encodeURIComponent(token)}`;
}
