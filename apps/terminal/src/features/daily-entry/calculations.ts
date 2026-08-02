import type { DailyEntryMap, DailyEntryRow, ExpenseLineSaved } from "./types";

/** Whole-taka rounding for POS totals. */
export function roundTaka(amount: number): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/** Bank sales minus cash withdrawn from bank into the counter. */
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

export type DailyEntryHistorySlot = {
  date: string;
  row: DailyEntryRow | null;
};

/**
 * One slot per calendar day from the earliest saved entry through today
 * (newest first). Days without a saved row have `row: null` (missing).
 * With no saves yet, returns today only.
 */
export function listDailyEntryHistorySlots(
  map: DailyEntryMap,
  today: string,
): DailyEntryHistorySlot[] {
  const dates = Object.keys(map).sort();
  const start = dates[0] ?? today;
  const latest = dates[dates.length - 1] ?? today;
  const end = latest > today ? latest : today;
  if (end < start) return [{ date: today, row: map[today] ?? null }];

  const slots: DailyEntryHistorySlot[] = [];
  for (let d = end; ; d = dateAddDays(d, -1)) {
    slots.push({ date: d, row: map[d] ?? null });
    if (d <= start) break;
  }
  return slots;
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

/**
 * Date for Add Entry: prefer today when it has no saved row; otherwise the next
 * empty calendar day after today (never jumps to “day after latest” when older
 * gaps exist — those are opened by editing a date or picking one).
 */
export function suggestedNewEntryDateKey(map: DailyEntryMap, today: string): string {
  if (!map[today]) return today;
  let next = dateAddDays(today, 1);
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
 * Bank sales omitted (deposit to bank). Bank withdraw + cash in add to the
 * counter; neither is sales.
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
  const cashAdded =
    Math.max(0, row.bankWithdrawn ?? 0) + Math.max(0, row.cashIn ?? 0);
  return roundTaka(row.openingBalance + salesSum - voidAmt - expenseSum + cashAdded);
}
