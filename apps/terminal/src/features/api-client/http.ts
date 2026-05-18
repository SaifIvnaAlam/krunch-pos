import { notifyAuthExpired } from "@/features/auth/authSession";
import {
  clearApiTokens,
  readRefreshToken,
  writeTokens,
} from "@/features/auth/tokenStorage";
import type { RefreshTokensDto } from "@/features/auth/types";
import { getApiBaseUrl } from "@/shared/config/env";
import { ApiRequestError } from "./errors";

export type ApiFetchOptions = RequestInit & {
  /** When set, sends Authorization: Bearer … */
  token?: string;
  /** @internal — set by retry after refresh */
  _retryAfterRefresh?: boolean;
};

function joinUrl(base: string, path: string): string {
  if (path.startsWith("http")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) {
    clearApiTokens();
    notifyAuthExpired();
    return null;
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const base = getApiBaseUrl();
        const response = await fetch(joinUrl(base, "/auth/refresh"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        const text = await response.text();
        let data: unknown = undefined;
        if (text) {
          try {
            data = JSON.parse(text) as unknown;
          } catch {
            data = text;
          }
        }
        if (!response.ok) {
          clearApiTokens();
          notifyAuthExpired();
          return null;
        }
        const tokens = data as RefreshTokensDto;
        writeTokens(tokens.accessToken, tokens.refreshToken);
        return tokens.accessToken;
      } catch {
        clearApiTokens();
        notifyAuthExpired();
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

/**
 * JSON fetch against the Nest API (`/api/v1` prefix included in base URL).
 * On 401 with a bearer token, attempts one refresh + retry.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const base = getApiBaseUrl();
  const { token, headers: initHeaders, _retryAfterRefresh, ...rest } = options;

  const headers = new Headers(initHeaders);
  const hasBody = rest.body != null && rest.body !== "";
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(joinUrl(base, path), {
    ...rest,
    headers,
  });

  const text = await response.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  if (
    response.status === 401 &&
    token &&
    !_retryAfterRefresh &&
    !path.includes("/auth/refresh") &&
    !path.includes("/auth/login")
  ) {
    const nextToken = await refreshAccessToken();
    if (nextToken) {
      return apiFetch<T>(path, {
        ...options,
        token: nextToken,
        _retryAfterRefresh: true,
      });
    }
  }

  if (!response.ok) {
    const msg =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : `HTTP ${response.status}`;
    if (response.status === 401 && token) {
      clearApiTokens();
      notifyAuthExpired();
    }
    throw new ApiRequestError(msg, response.status, data);
  }

  return data as T;
}
