import { apiFetch } from "@/features/api-client";
import { requireAccessToken } from "@/features/api-client/auth";
import type { ApiMenuItem } from "./types";
import { catalogItemToModifiers } from "./mappers";

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

export async function deleteMenuItemOnApi(id: string): Promise<void> {
  const token = requireAccessToken();
  await apiFetch<{ message: string }>(`/menu/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
}

export function catalogItemPayload(
  item: { name: string; priceCents: number; variantGroups: unknown[]; addons: unknown[] },
  category: string,
) {
  return {
    name: item.name,
    price: item.priceCents / 100,
    category,
    modifiers: catalogItemToModifiers(item as Parameters<typeof catalogItemToModifiers>[0]),
  };
}
