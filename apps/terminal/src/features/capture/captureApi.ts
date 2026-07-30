import { apiFetch } from "@/features/api-client/http";
import { requireAccessToken } from "@/features/api-client/auth";
import { getApiBaseUrl } from "@/shared/config/env";
import { ApiRequestError } from "@/features/api-client/errors";

export type CaptureSessionItem = {
  id: string;
  mediaRef: string;
  createdAt: string;
};

export type CaptureSessionView = {
  items: CaptureSessionItem[];
};

export type CapturePresignResult = {
  uploadUrl: string;
  mediaId: string;
  publicUrl: string;
  mediaRef: string;
  expiresIn: number;
};

async function publicFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = getApiBaseUrl();
  const headers = new Headers(options.headers);
  if (options.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    ...options,
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
  if (!response.ok) {
    const msg =
      data &&
      typeof data === "object" &&
      "message" in data &&
      (typeof (data as { message: unknown }).message === "string" ||
        Array.isArray((data as { message: unknown }).message))
        ? Array.isArray((data as { message: unknown }).message)
          ? ((data as { message: string[] }).message).join(", ")
          : String((data as { message: string }).message)
        : `Request failed (${response.status})`;
    throw new ApiRequestError(msg, response.status, data);
  }
  return data as T;
}

export async function createCaptureSession(dateKey: string): Promise<{
  token: string;
}> {
  const token = requireAccessToken();
  return apiFetch<{ token: string }>("/capture-sessions", {
    method: "POST",
    token,
    body: JSON.stringify({ dateKey }),
  });
}

export async function closeCaptureSession(sessionToken: string): Promise<void> {
  const token = requireAccessToken();
  await apiFetch<{ ok: true }>(`/capture-sessions/${encodeURIComponent(sessionToken)}`, {
    method: "DELETE",
    token,
  });
}

export function getCaptureSession(sessionToken: string): Promise<CaptureSessionView> {
  return publicFetch<CaptureSessionView>(
    `/capture-sessions/${encodeURIComponent(sessionToken)}`,
  );
}

export function presignCaptureUpload(
  sessionToken: string,
  contentType: string,
): Promise<CapturePresignResult> {
  return publicFetch<CapturePresignResult>(
    `/capture-sessions/${encodeURIComponent(sessionToken)}/presign`,
    {
      method: "POST",
      body: JSON.stringify({ contentType }),
    },
  );
}

export function registerCaptureItem(
  sessionToken: string,
  mediaRef: string,
): Promise<CaptureSessionItem> {
  return publicFetch<CaptureSessionItem>(
    `/capture-sessions/${encodeURIComponent(sessionToken)}/items`,
    {
      method: "POST",
      body: JSON.stringify({ mediaRef }),
    },
  );
}

/** Remove tray item. Pass keepMedia when assigning onto a form row. */
export function removeCaptureItem(
  sessionToken: string,
  itemId: string,
  opts?: { keepMedia?: boolean },
): Promise<{ ok: true }> {
  const q = opts?.keepMedia ? "?keepMedia=1" : "";
  return publicFetch<{ ok: true }>(
    `/capture-sessions/${encodeURIComponent(sessionToken)}/items/${encodeURIComponent(itemId)}${q}`,
    { method: "DELETE" },
  );
}
