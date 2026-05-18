import { apiFetch } from "@/features/api-client";
import { requireAccessToken } from "@/features/api-client/auth";

export type ApiStockItem = {
  id: string;
  branchId: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  parLevel: number;
  lastCountedAt: string | null;
  balance: number;
  createdAt: string;
  updatedAt: string;
};

export type ApiStockMovement = {
  id: string;
  stockItemId: string;
  direction: "IN" | "OUT";
  quantity: number;
  note: string | null;
  occurredAt: string;
  createdAt: string;
};

export async function fetchStockItemsFromApi(): Promise<ApiStockItem[]> {
  const token = requireAccessToken();
  return apiFetch<ApiStockItem[]>("/inventory/stock-items", { method: "GET", token });
}

export async function createStockItemOnApi(body: {
  sku: string;
  name: string;
  category: string;
  unit?: string;
  parLevel?: number;
  openingQuantity?: number;
  openingReason?: string;
}): Promise<ApiStockItem> {
  const token = requireAccessToken();
  return apiFetch<ApiStockItem>("/inventory/stock-items", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export async function fetchStockMovementsFromApi(
  stockItemId: string,
): Promise<ApiStockMovement[]> {
  const token = requireAccessToken();
  return apiFetch<ApiStockMovement[]>(
    `/inventory/stock-items/${encodeURIComponent(stockItemId)}/movements`,
    { method: "GET", token },
  );
}

export async function createStockMovementOnApi(
  stockItemId: string,
  body: { direction: "IN" | "OUT"; quantity: number; note?: string },
): Promise<ApiStockMovement> {
  const token = requireAccessToken();
  return apiFetch<ApiStockMovement>(
    `/inventory/stock-items/${encodeURIComponent(stockItemId)}/movements`,
    {
      method: "POST",
      token,
      body: JSON.stringify(body),
    },
  );
}
