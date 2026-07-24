import type { ExpenseKind, ExpenseStatus, PaymentMethod } from "./types";

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  mobile_money: "Mobile Money",
  cheque: "Cheque",
  other: "Other",
};

export const EXPENSE_KIND_LABEL: Record<ExpenseKind, string> = {
  item_purchase: "Item Purchase",
  other_expense: "Other Expense",
};

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partial",
  paid: "Paid",
};

/** Tailwind text tone for a status. */
export function expenseStatusTone(status: ExpenseStatus): string {
  if (status === "paid") return "text-emerald-700 dark:text-emerald-400";
  if (status === "partially_paid") return "text-amber-700 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

/** Small pill classes for a status badge. */
export function expenseStatusPill(status: ExpenseStatus): string {
  if (status === "paid")
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (status === "partially_paid")
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400";
}
