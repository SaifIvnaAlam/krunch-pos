/**
 * Shared helpers for the Expense payables model.
 *
 * Money: DB columns are integer minor units (`*Minor`). The API speaks
 * whole-currency numbers (like payroll / daily-entry expenses), so we divide by
 * 100 on read and multiply on write.
 */

export const PAYMENT_METHODS = [
  'cash',
  'card',
  'bank_transfer',
  'mobile_money',
  'cheque',
  'other',
] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export const EXPENSE_KINDS = ['item_purchase', 'other_expense'] as const;
export type ExpenseKindValue = (typeof EXPENSE_KINDS)[number];

/**
 * Legacy cashbooks that are NOT kitchen/item vendors. Keep in sync with
 * `scripts/supplier-expense-kind-map.mjs`.
 */
export const OTHER_EXPENSE_SUPPLIER_NAMES = [
  'Boosting',
  'Maintainence',
  'Rent',
  'Staff Snacks',
  'Gas',
  'ALL Vlogger',
  'Ahmudul Haque Anik',
  'Shohel',
  'Hardware and Accessories',
  'WASA - Water Bill',
  'Vat Tax',
] as const;

const OTHER_EXPENSE_SUPPLIER_NAME_SET = new Set(
  OTHER_EXPENSE_SUPPLIER_NAMES.map((n) => n.toLowerCase()),
);

/** Prefer stored bookPurpose when set; else name map; else item_purchase. */
export function expenseKindForSupplier(opts: {
  name?: string | null;
  bookPurpose?: string | null;
}): ExpenseKindValue {
  const purpose = (opts.bookPurpose || '').trim().toLowerCase();
  if (purpose === 'other_expense' || purpose === 'item_purchase') return purpose;
  const name = (opts.name || '').trim().toLowerCase();
  if (name && OTHER_EXPENSE_SUPPLIER_NAME_SET.has(name)) return 'other_expense';
  return 'item_purchase';
}

export type FifoExpense = {
  id: string;
  supplierId: string | null;
  date: string;
  totalMinor: number;
};

export type FifoLedgerPayment = {
  id: string;
  supplierId: string;
  date: string;
  /** Signed cashbook amount (payments are negative). */
  amountMinor: number;
  memo?: string | null;
  ref?: string | null;
};

export type FifoAllocation = {
  expenseId: string;
  ledgerEntryId: string;
  date: string;
  amountMinor: number;
  transactionId: string;
  memo: string;
};

/**
 * Allocate cashbook ledger payments onto supplier bills (FIFO by date/id).
 * This is the v1 account-balance truth: Σ invoices − Σ |payments| per supplier.
 * Daily-entry vendor lines alone under-count when cashbook has duplicate bills
 * (e.g. 15 identical POs on 2026-07-19 with only 1 daily vendor line).
 */
export function allocateLedgerPaymentsFifo(
  expenses: FifoExpense[],
  ledgerPayments: FifoLedgerPayment[],
): FifoAllocation[] {
  const open = new Map<string, { id: string; date: string; remaining: number }[]>();
  for (const e of [...expenses].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date),
  )) {
    if (!e.supplierId || e.totalMinor <= 0) continue;
    const arr = open.get(e.supplierId) ?? [];
    arr.push({ id: e.id, date: e.date, remaining: e.totalMinor });
    open.set(e.supplierId, arr);
  }

  const out: FifoAllocation[] = [];
  const pays = [...ledgerPayments].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date),
  );
  for (const pay of pays) {
    let left = Math.abs(pay.amountMinor);
    if (left <= 0) continue;
    const bills = open.get(pay.supplierId) ?? [];
    for (const bill of bills) {
      if (left <= 0) break;
      if (bill.remaining <= 0) continue;
      const take = Math.min(left, bill.remaining);
      bill.remaining -= take;
      left -= take;
      out.push({
        expenseId: bill.id,
        ledgerEntryId: pay.id,
        date: pay.date,
        amountMinor: take,
        transactionId: pay.ref ?? '',
        memo: pay.memo ?? '',
      });
    }
  }
  return out;
}

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid';

export const toWhole = (minor: number): number => minor / 100;
export const toMinor = (whole: number): number => Math.round(Number(whole) * 100);

/**
 * Derive paid / due / status for a payable. Return credits reduce the amount
 * owed. `due` is clamped at zero so an overpayment never shows negative due.
 */
export function derivePaidDue(
  totalMinor: number,
  paidMinor: number,
  creditMinor = 0,
): { paidMinor: number; dueMinor: number; status: PaymentStatus } {
  const owed = Math.max(0, totalMinor - creditMinor);
  const dueMinor = Math.max(0, owed - paidMinor);
  let status: PaymentStatus;
  if (paidMinor <= 0) status = 'unpaid';
  else if (paidMinor >= owed) status = 'paid';
  else status = 'partially_paid';
  return { paidMinor, dueMinor, status };
}
