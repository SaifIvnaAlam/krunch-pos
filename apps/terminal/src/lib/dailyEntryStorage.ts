/** Persisted daily entry rows — shared by Daily Entry Form and Reports. */

export type ExpenseLineSaved = {
  kind?: "vendor" | "regular";
  vendor?: string;
  label?: string;
  amount: number;
  receiptDataUrls?: string[];
};

export type DailyEntryRow = {
  date: string;
  openingBalance: number;
  cashSale: number;
  bankSale: number;
  bkashSale: number;
  pathaoSale: number;
  foodiSale: number;
  foodpandaSale: number;
  expenses: number;
  expenseLines?: ExpenseLineSaved[];
  remainingBalance: number;
  updatedAt: string;
  /** User display name for the session that last saved this day (from terminal sign-in). */
  enteredBy?: string;
};

export type DailyEntryMap = Record<string, DailyEntryRow>;

export const DAILY_ENTRY_STORAGE_KEY = "upos.dailyEntryRows.v1";

/** Fired on this window after a successful save (same tab). */
export const DAILY_ENTRY_STORAGE_UPDATE_EVENT = "krunch-daily-entry-updated";

export function savedLineKind(line: ExpenseLineSaved): "vendor" | "regular" {
  return line.kind === "regular" ? "regular" : "vendor";
}

export function readDailyEntryMap(): DailyEntryMap {
  try {
    const raw = localStorage.getItem(DAILY_ENTRY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DailyEntryMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeDailyEntryMap(
  rows: DailyEntryMap,
): { ok: true } | { ok: false; message: string } {
  try {
    localStorage.setItem(DAILY_ENTRY_STORAGE_KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent(DAILY_ENTRY_STORAGE_UPDATE_EVENT));
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof DOMException && e.name === "QuotaExceededError"
        ? "Storage full — clear browser data or export entries."
        : "Could not save — check browser storage permissions.";
    return { ok: false, message };
  }
}

export function listDailyEntriesDescending(): DailyEntryRow[] {
  const map = readDailyEntryMap();
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}
