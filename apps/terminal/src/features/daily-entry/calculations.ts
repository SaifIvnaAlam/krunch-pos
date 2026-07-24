import type { DailyEntryMap, DailyEntryRow, ExpenseLineSaved } from "./types";

/** Whole-taka rounding for POS totals. */
export function roundTaka(amount: number): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/** Bank sales minus expenses withdrawn from the bank. */
export function bankNetAfterWithdrawals(
  bankSale: number,
  bankWithdrawn: number,
): number {
  return roundTaka(
    Math.max(0, Number(bankSale) || 0) - Math.max(0, Number(bankWithdrawn) || 0),
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
    // Regular: only cash paid now hits the daily register (due stays on the payable).
    if (line.kind === "regular") {
      const paid =
        typeof line.paidAmount === "number" && Number.isFinite(line.paidAmount)
          ? line.paidAmount
          : line.amount;
      return sum + paid;
    }
    return sum + line.amount;
  }, 0);
}

/**
 * Closing cash from a saved daily entry row (matches Daily Entry Form).
 * Bank sales are omitted — they deposit to the bank, not cash on hand.
 */
export function computeRemainingBalanceForRow(row: DailyEntryRow): number {
  const salesSum =
    row.cashSale +
    row.bkashSale +
    row.nagadSale +
    row.pathaoSale +
    row.foodiSale +
    row.foodpandaSale;
  const voidAmt = Math.max(0, row.voidSale ?? 0);
  const expenseSum = expenseTotalFromExpenseLines(row.expenseLines);
  return roundTaka(row.openingBalance + salesSum - voidAmt - expenseSum);
}
