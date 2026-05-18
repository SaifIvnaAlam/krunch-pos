import { apiFetch } from "@/features/api-client";
import { requireAccessToken } from "@/features/api-client/auth";

export type SalesReportPayload = {
  totalRevenue: string;
  totalOrders: number;
  averageOrderValue: string;
};

export type ItemPerformanceRow = {
  menuItemId: string;
  name: string;
  category: string;
  quantity: number;
  revenue: string;
};

export async function fetchSalesReport(
  startDate: string,
  endDate: string,
): Promise<SalesReportPayload> {
  const token = requireAccessToken();
  const qs = new URLSearchParams({ startDate, endDate });
  return apiFetch<SalesReportPayload>(`/reports/sales?${qs}`, { method: "GET", token });
}

export async function fetchItemPerformance(
  startDate: string,
  endDate: string,
): Promise<ItemPerformanceRow[]> {
  const token = requireAccessToken();
  const qs = new URLSearchParams({ startDate, endDate });
  return apiFetch<ItemPerformanceRow[]>(`/reports/items?${qs}`, { method: "GET", token });
}
