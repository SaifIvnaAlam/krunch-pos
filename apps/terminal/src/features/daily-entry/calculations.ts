import type { DailyEntryMap, DailyEntryRow, ExpenseLineSaved } from "./types";

/** Applied to `bankSale` (gross) when summing sales and closing balance. */
export const BANK_SALE_SERVICE_CHARGE_RATE = 0.0175;

/** Whole-taka rounding for POS totals and bank net after service charge. */
export function roundTaka(amount: number): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function bankSaleNetAfterServiceCharge(gross: number): number {
  const g = Number(gross);
  if (!Number.isFinite(g) || g <= 0) return 0;
  return roundTaka(g * (1 - BANK_SALE_SERVICE_CHARGE_RATE));
}

export function bankSaleServiceChargeAmount(gross: number): number {
  const g = Number(gross);
  if (!Number.isFinite(g) || g <= 0) return 0;
  return Math.max(0, g - bankSaleNetAfterServiceCharge(g));
}

/** Net bank sales (after service charge) minus expenses withdrawn from the bank. */
export function bankNetAfterWithdrawals(
  bankSaleGross: number,
  bankWithdrawn: number,
): number {
  return roundTaka(
    bankSaleNetAfterServiceCharge(bankSaleGross) -
      Math.max(0, Number(bankWithdrawn) || 0),
  );
}

export function savedLineKind(line: { kind?: string }): "vendor" | "regular" {
  return line.kind === "regular" ? "regular" : "vendor";
}

export function listDailyEntriesDescendingFromMap(
  map: DailyEntryMap,
): DailyEntryRow[] {
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

export function dateAddDays(dateKey: string, days: number): string {
  const parts = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  const [y, m, d] = parts;
  if (!y || !m || !d) return dateKey;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function expenseTotalFromExpenseLines(
  lines: ExpenseLineSaved[] | undefined,
): number {
  return (lines ?? []).reduce((sum, line) => sum + line.amount, 0);
}

/** Closing balance from a saved daily entry row (matches Daily Entry Form). */
export function computeRemainingBalanceForRow(row: DailyEntryRow): number {
  const salesSum =
    row.cashSale +
    bankSaleNetAfterServiceCharge(row.bankSale) +
    row.bkashSale +
    row.nagadSale +
    row.pathaoSale +
    row.foodiSale +
    row.foodpandaSale;
  const voidAmt = Math.max(0, row.voidSale ?? 0);
  const expenseSum = expenseTotalFromExpenseLines(row.expenseLines);
  return roundTaka(row.openingBalance + salesSum - voidAmt - expenseSum);
}
