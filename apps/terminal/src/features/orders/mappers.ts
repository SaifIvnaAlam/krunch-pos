import type { ApiOrderStatus, ApiOrderSummary, UiOrderRow, UiOrderStatus } from "./types";

export function mapApiStatusToUi(status: ApiOrderStatus): UiOrderStatus {
  switch (status) {
    case "OPEN":
    case "HELD":
      return "pending";
    case "SENT_TO_KITCHEN":
    case "READY":
      return "kitchen";
    case "PAID":
      return "completed";
    case "VOIDED":
      return "cancelled";
    default:
      return "pending";
  }
}

export function apiOrderToUiRow(order: ApiOrderSummary): UiOrderRow {
  const created = new Date(order.createdAt);
  const totalNum =
    typeof order.totalAmount === "string"
      ? Number.parseFloat(order.totalAmount)
      : order.totalAmount;
  return {
    id: `#${order.id.slice(0, 8)}`,
    table: order.tableNumber?.trim() || "—",
    status: mapApiStatusToUi(order.status),
    type: "dine_in",
    total: Number.isFinite(totalNum) ? totalNum.toFixed(2) : "0.00",
    time: created.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    date: created.toISOString().slice(0, 10),
  };
}
