export type ApiOrderStatus =
  | "OPEN"
  | "SENT_TO_KITCHEN"
  | "READY"
  | "PAID"
  | "VOIDED"
  | "HELD";

export type ApiOrderSummary = {
  id: string;
  branchId: string;
  staffId: string;
  tableNumber: string | null;
  status: ApiOrderStatus;
  totalAmount: string | number;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
};

export type UiOrderStatus = "pending" | "kitchen" | "completed" | "cancelled";

export type UiOrderRow = {
  id: string;
  table: string;
  status: UiOrderStatus;
  type: "dine_in";
  total: string;
  time: string;
  date: string;
};
