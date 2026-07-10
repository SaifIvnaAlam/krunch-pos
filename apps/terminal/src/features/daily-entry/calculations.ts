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

export { savedLineKind, type SavedExpenseLineKind } from "./staffExpenseLine";

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

export type CarriedOpeningBalance = {
  opening: number;
  /** Prior saved entry date used as source, or null when none exists before `dateKey`. */
  sourceDate: string | null;
};

/** Closing balance from the latest saved entry strictly before `dateKey`. */
export function carriedOpeningBalanceForDate(
  map: DailyEntryMap,
  dateKey: string,
): CarriedOpeningBalance {
  let sourceRow: DailyEntryRow | null = null;
  for (const row of Object.values(map)) {
    if (row.date >= dateKey) continue;
    if (!sourceRow || row.date > sourceRow.date) {
      sourceRow = row;
    }
  }
  return {
    opening: sourceRow?.remainingBalance ?? 0,
    sourceDate: sourceRow?.date ?? null,
  };
}

/** First empty calendar day after the latest saved entry, or `today` when none exist. */
export function suggestedNewEntryDateKey(map: DailyEntryMap, today: string): string {
  const dates = Object.keys(map).sort();
  if (dates.length === 0) return today;
  let next = dateAddDays(dates[dates.length - 1]!, 1);
  while (map[next]) {
    next = dateAddDays(next, 1);
  }
  return next;
}

export function expenseTotalFromExpenseLines(
  lines: ExpenseLineSaved[] | undefined,
): number {
  return (lines ?? []).reduce((sum, line) => {
    // Fines live on the salary sheet; purchase bills are payables, not cash out.
    if (line.kind === "staff" && line.staffLineKind === "fine") return sum;
    if (line.kind === "purchase") return sum;
    return sum + line.amount;
  }, 0);
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
