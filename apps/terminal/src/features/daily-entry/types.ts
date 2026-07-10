import type { StaffLineKind } from "../payroll/staffLineKinds";

/** Links a daily vendor line to rows created in Bills & payments (terminal workspace). */
export type LedgerExpenseLink = {
  ledgerEntryId: string;
  purchaseOrderId?: string;
};

/** Line items on a daily “items purchased” bill (amounts in taka). */
export type DailyPurchaseItemSaved = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
};

export type ExpenseLineSaved = {
  kind?: "vendor" | "regular" | "staff" | "purchase";
  vendor?: string;
  label?: string;
  /** Staff expense — links to employee directory. */
  employeeId?: string;
  employeeName?: string;
  staffLineKind?: StaffLineKind | "fine";
  note?: string;
  amount: number;
  receiptDataUrls?: string[];
  lineId?: string;
  /** Vendor payment / purchase bill lines when posted to cashbooks. */
  ledgerKind?: "invoice" | "payment" | "return_credit" | "adjustment";
  ledgerEmployeeLineKind?: StaffLineKind;
  ledgerNote?: string;
  ledgerLink?: LedgerExpenseLink;
  /** Links back to a salary-register payout. */
  salaryPaymentId?: string;
  /** Item breakdown for purchase bills. */
  items?: DailyPurchaseItemSaved[];
};

export type DailyEntryRow = {
  date: string;
  openingBalance: number;
  cashSale: number;
  bankSale: number;
  bkashSale: number;
  nagadSale: number;
  pathaoSale: number;
  foodiSale: number;
  foodpandaSale: number;
  voidSale?: number;
  voidSaleRemarks?: string;
  voidSaleAttachmentDataUrls?: string[];
  expenses: number;
  /** Expenses paid by withdrawing from the bank (≤ `expenses`). Bank deposits use `bankSale`. */
  bankWithdrawn: number;
  expenseLines?: ExpenseLineSaved[];
  remainingBalance: number;
  updatedAt: string;
  enteredBy?: string;
  isLocked?: boolean;
  lockedAt?: string;
  lockedBy?: string;
};

export type DailyEntryMap = Record<string, DailyEntryRow>;

export type PersistResult = { ok: true } | { ok: false; message: string };
