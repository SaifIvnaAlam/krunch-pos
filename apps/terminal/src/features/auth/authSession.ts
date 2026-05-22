import { readAccessToken } from "./tokenStorage";

/** Fired when access/refresh tokens are cleared after a 401 (SessionProvider listens). */
export const AUTH_EXPIRED_EVENT = "pos-auth-expired";

export function notifyAuthExpired(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

/** Returns stored access token when present (expiry is handled via API refresh). */
export function readValidAccessToken(): string | null {
  return readAccessToken();
}
