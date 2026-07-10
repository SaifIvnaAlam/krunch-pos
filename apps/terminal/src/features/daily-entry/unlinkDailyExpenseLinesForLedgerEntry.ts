import {
  computeRemainingBalanceForRow,
  expenseTotalFromExpenseLines,
} from "./calculations";
import { loadDailyEntryMap, saveDailyEntry } from "./dailyEntryRepository";
import { DAILY_ENTRY_STORAGE_UPDATE_EVENT } from "./localDailyEntryStorage";
import type { DailyEntryRow, ExpenseLineSaved } from "./types";

export type UnlinkDailyLedgerResult =
  | { ok: true; updatedDates: string[] }
  | { ok: false; message: string };

function lineLinksToLedgerEntry(
  line: ExpenseLineSaved,
  ledgerEntryId: string,
): boolean {
  return line.ledgerLink?.ledgerEntryId === ledgerEntryId;
}

function stripLinkedLines(
  row: DailyEntryRow,
  ledgerEntryId: string,
): { row: DailyEntryRow; changed: boolean } {
  const prior = row.expenseLines ?? [];
  const nextLines = prior.filter((line) => !lineLinksToLedgerEntry(line, ledgerEntryId));
  if (nextLines.length === prior.length) {
    return { row, changed: false };
  }
  const expenses = expenseTotalFromExpenseLines(nextLines);
  const next: DailyEntryRow = {
    ...row,
    expenseLines: nextLines,
    expenses,
  };
  next.remainingBalance = computeRemainingBalanceForRow(next);
  return { row: next, changed: true };
}

/**
 * When a cashbook bill/payment created from Daily Entry is removed, drop the
 * matching expense/purchase line(s) from that day’s entry.
 */
export async function unlinkDailyExpenseLinesForLedgerEntry(
  ledgerEntryId: string,
): Promise<UnlinkDailyLedgerResult> {
  const id = ledgerEntryId.trim();
  if (!id) {
    return { ok: false, message: "Ledger entry is required." };
  }

  const map = await loadDailyEntryMap({ force: true });
  const updatedDates: string[] = [];

  for (const row of Object.values(map)) {
    const linked = (row.expenseLines ?? []).some((line) =>
      lineLinksToLedgerEntry(line, id),
    );
    if (!linked) continue;

    if (row.isLocked) {
      return {
        ok: false,
        message: `Daily entry for ${row.date} is locked. Unlock it before removing this cashbook line.`,
      };
    }

    const { row: next, changed } = stripLinkedLines(row, id);
    if (!changed) continue;

    const saveRes = await saveDailyEntry(next);
    if (!saveRes.ok) {
      return { ok: false, message: saveRes.message };
    }
    updatedDates.push(row.date);
  }

  if (updatedDates.length > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DAILY_ENTRY_STORAGE_UPDATE_EVENT));
  }

  return { ok: true, updatedDates };
}
