/** Types mirroring the API's expenses / payments / categories / reports DTOs.
 *  All money fields are whole-currency numbers (not minor units). */

export type ExpenseKind = "item_purchase" | "other_expense";
export type ExpenseStatus = "unpaid" | "partially_paid" | "paid";
export type PaymentMethod =
  | "cash"
  | "card"
  | "bank_transfer"
  | "mobile_money"
  | "cheque"
  | "other";

export type ExpenseCategory = {
  id: string;
  name: string;
  active: boolean;
  sortIndex: number;
  updatedAt: string;
};

export type ExpenseItem = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
};

export type ExpensePaymentLine = {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  transactionId: string;
  note: string;
};

/** Row shape from GET /expenses (list). "salary" rows are staff payouts. */
export type ExpenseSummary = {
  id: string;
  kind: ExpenseKind | "salary";
  date: string;
  description: string;
  expenseCategoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  total: number;
  paid: number;
  due: number;
  status: ExpenseStatus;
  note: string;
  /** Row ownership: "manual" rows are editable; others are read-only projections. */
  source: string;
  /** True only for manual rows (server-authoritative). */
  editable: boolean;
  itemCount: number;
  paymentCount: number;
  items: ExpenseItem[];
  createdAt: string;
  updatedAt: string;
};

/** Full shape from GET /expenses/:id (detail). */
export type ExpenseDetail = ExpenseSummary & {
  creditTotal: number;
  items: ExpenseItem[];
  payments: ExpensePaymentLine[];
  returns: { id: string; date: string; reason: string; credit: number }[];
  attachments: { id: string; fileName: string; mimeType: string; dataUrl: string }[];
};

export type Payment = {
  id: string;
  expenseId: string | null;
  salaryLineId: string | null;
  date: string;
  amount: number;
  method: PaymentMethod;
  transactionId: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type ReportBucket = {
  key: string;
  label: string;
  total: number;
  paid: number;
  due: number;
};

export type ReportMonth = {
  month: string;
  total: number;
  paid: number;
  due: number;
};

export type ExpenseReportSummary = {
  range: { from: string | null; to: string | null };
  totals: { total: number; paid: number; due: number };
  byCategory: ReportBucket[];
  /** High-level rollup: item purchases, other expenses, salary. */
  byKind: ReportBucket[];
  byMonth: ReportMonth[];
};

// ---- request payloads ----

export type ExpenseItemInput = {
  name?: string;
  qty?: number;
  unit?: string;
  rate?: number;
  total: number;
};

export type CreateExpenseInput = {
  kind: ExpenseKind;
  date: string;
  description?: string;
  expenseCategoryId?: string | null;
  supplierId?: string | null;
  total: number;
  note?: string;
  items?: ExpenseItemInput[];
  /** Optional initial payment recorded atomically with the expense. */
  paidAmount?: number;
  method?: PaymentMethod;
  transactionId?: string;
};

export type ListExpensesQuery = {
  kind?: ExpenseKind;
  expenseCategoryId?: string;
  supplierId?: string;
  status?: ExpenseStatus;
  from?: string;
  to?: string;
};

export type CreatePaymentInput = {
  expenseId?: string;
  salaryLineId?: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  transactionId?: string;
  note?: string;
};
