import { apiFetch } from "@/features/api-client";
import { requireAccessToken } from "@/features/api-client/auth";
import type { ApiOrderSummary } from "./types";

export async function fetchOrdersFromApi(status?: string): Promise<ApiOrderSummary[]> {
  const token = requireAccessToken();
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<ApiOrderSummary[]>(`/orders${qs}`, { method: "GET", token });
}

export async function createOrderOnApi(body: {
  tableNumber?: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    modifiers?: Record<string, unknown>;
    notes?: string;
  }>;
}): Promise<{ id: string; totalAmount?: string | number }> {
  const token = requireAccessToken();
  return apiFetch<{ id: string; totalAmount?: string | number }>("/orders", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export async function holdOrderOnApi(orderId: string): Promise<void> {
  const token = requireAccessToken();
  await apiFetch(`/orders/${encodeURIComponent(orderId)}/hold`, {
    method: "POST",
    token,
    body: JSON.stringify({}),
  });
}

export async function fireOrderOnApi(orderId: string): Promise<void> {
  const token = requireAccessToken();
  await apiFetch(`/orders/${encodeURIComponent(orderId)}/fire`, {
    method: "POST",
    token,
    body: JSON.stringify({}),
  });
}
