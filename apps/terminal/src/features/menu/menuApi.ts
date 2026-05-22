import { apiFetch } from "@/features/api-client";
import { requireAccessToken } from "@/features/api-client/auth";
import type { ApiMenuItem } from "./types";
export async function fetchMenuFromApi(): Promise<ApiMenuItem[]> {
  const token = requireAccessToken();
  return apiFetch<ApiMenuItem[]>("/menu", { method: "GET", token });
}

export async function createMenuItemOnApi(body: {
  name: string;
  description?: string;
  price: number;
  category: string;
  imageKey?: string;
  modifiers?: Record<string, unknown>;
}): Promise<ApiMenuItem> {
  const token = requireAccessToken();
  return apiFetch<ApiMenuItem>("/menu", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export async function updateMenuItemOnApi(
  id: string,
  body: {
    name?: string;
    description?: string;
    price?: number;
    category?: string;
    isAvailable?: boolean;
    imageKey?: string | null;
    modifiers?: Record<string, unknown>;
  },
): Promise<ApiMenuItem> {
  const token = requireAccessToken();
  return apiFetch<ApiMenuItem>(`/menu/${encodeURIComponent(id)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

