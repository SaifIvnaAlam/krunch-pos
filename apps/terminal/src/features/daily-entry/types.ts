/** Links a daily vendor line to rows created in Bills & payments (terminal workspace). */
export type LedgerExpenseLink = {
  ledgerEntryId: string;
  purchaseOrderId?: string;
};

export type ExpenseLineSaved = {
  kind?: "vendor" | "regular";
  vendor?: string;
  label?: string;
  note?: string;
  amount: number;
  receiptDataUrls?: string[];
  lineId?: string;
  ledgerKind?: "invoice" | "payment" | "return_credit" | "adjustment";
  ledgerEmployeeLineKind?:
    | "salary"
    | "service_charge"
    | "bonus"
    | "overtime";
  ledgerNote?: string;
  ledgerLink?: LedgerExpenseLink;
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
  expenseLines?: ExpenseLineSaved[];
  remainingBalance: number;
  updatedAt: string;
  enteredBy?: string;
};

export type DailyEntryMap = Record<string, DailyEntryRow>;

export type PersistResult = { ok: true } | { ok: false; message: string };
