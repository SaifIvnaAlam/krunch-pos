import { readAccessToken } from "./tokenStorage";

/** Fired when access/refresh tokens are cleared after a 401 (SessionProvider listens). */
export const AUTH_EXPIRED_EVENT = "pos-auth-expired";

export function notifyAuthExpired(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

/** Returns true if JWT is missing, malformed, or past expiry (30s skew). */
export function isAccessTokenExpired(token: string): boolean {
  try {
    const part = token.split(".")[1];
    if (!part) return true;
    const payload = JSON.parse(atob(part)) as { exp?: number };
    if (typeof payload.exp !== "number") return true;
    return payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}

export function readValidAccessToken(): string | null {
  const token = readAccessToken();
  if (!token || isAccessTokenExpired(token)) return null;
  return token;
}
