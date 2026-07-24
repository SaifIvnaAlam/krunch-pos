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
