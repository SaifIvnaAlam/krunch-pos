/** Persisted daily entry rows — shared by Daily Entry Form and Reports. */

/** Links a daily vendor line to rows created in Bills & payments (terminal workspace). */
export type LedgerExpenseLink = {
  ledgerEntryId: string;
  /** Present when the line was saved as a bill (invoice) — both are removed together. */
  purchaseOrderId?: string;
};

export type ExpenseLineSaved = {
  kind?: "vendor" | "regular";
  vendor?: string;
  label?: string;
  /** Optional memo for regular expense lines. */
  note?: string;
  amount: number;
  receiptDataUrls?: string[];
  /** Stable id for this line across edits (drives ledger sync). */
  lineId?: string;
  /** When set with a matching ledger book, daily save also posts this line to Bills & payments. */
  ledgerKind?: "invoice" | "payment" | "return_credit" | "adjustment";
  /** Staff books only — salary, rent, etc. (matches Ledger Management payment / deal type). */
  ledgerEmployeeLineKind?:
    | "salary"
    | "service_charge"
    | "house_rent"
    | "deal"
    | "advance"
    | "bonus"
    | "other";
  ledgerNote?: string;
  /** Set after a successful post so later edits can update/remove the workspace ledger row. */
  ledgerLink?: LedgerExpenseLink;
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
  /** Cancelled / voided sales amount (subtracted from channel totals for closing). */
  voidSale?: number;
  /** Required when void sale amount is greater than zero. */
  voidSaleRemarks?: string;
  /** Evidence for void sales (images and PDFs as data URLs). */
  voidSaleAttachmentDataUrls?: string[];
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

/** Sample rows for local UI preview — only applied when storage is empty (dev). */
function dummyDailyEntryMap(): DailyEntryMap {
  const t0 = "2026-04-17T10:30:00.000Z";
  const t1 = "2026-04-18T11:15:00.000Z";
  const t2 = "2026-04-19T09:45:00.000Z";

  const apr17: DailyEntryRow = {
    date: "2026-04-17",
    openingBalance: 5_000,
    cashSale: 12_000,
    bankSale: 5_000,
    bkashSale: 3_000,
    pathaoSale: 2_000,
    foodiSale: 1_500,
    foodpandaSale: 1_000,
    voidSale: undefined,
    voidSaleRemarks: undefined,
    voidSaleAttachmentDataUrls: undefined,
    expenses: 4_300,
    expenseLines: [
      { kind: "vendor", vendor: "City Wholesale", amount: 3_500 },
      { kind: "regular", label: "Cleaning supplies", amount: 800, note: "Monthly stock-up" },
    ],
    remainingBalance: 5_000 + 24_500 - 4_300,
    updatedAt: t0,
    enteredBy: "Demo",
  };

  const apr18: DailyEntryRow = {
    date: "2026-04-18",
    openingBalance: apr17.remainingBalance,
    cashSale: 11_000,
    bankSale: 4_500,
    bkashSale: 2_800,
    pathaoSale: 1_900,
    foodiSale: 1_200,
    foodpandaSale: 900,
    voidSale: 150,
    voidSaleRemarks: "Duplicate card charge reversed at register.",
    voidSaleAttachmentDataUrls: undefined,
    expenses: 3_400,
    expenseLines: [
      { kind: "vendor", vendor: "Produce Co", amount: 2_800 },
      { kind: "regular", label: "Fuel (delivery)", amount: 600 },
    ],
    remainingBalance:
      apr17.remainingBalance + 22_300 - 150 - 3_400,
    updatedAt: t1,
    enteredBy: "Demo",
  };

  const apr19: DailyEntryRow = {
    date: "2026-04-19",
    openingBalance: apr18.remainingBalance,
    cashSale: 13_000,
    bankSale: 6_000,
    bkashSale: 3_200,
    pathaoSale: 2_100,
    foodiSale: 1_600,
    foodpandaSale: 1_100,
    voidSale: undefined,
    voidSaleRemarks: undefined,
    voidSaleAttachmentDataUrls: undefined,
    expenses: 4_000,
    expenseLines: [{ kind: "vendor", vendor: "Dairy Direct", amount: 4_000 }],
    remainingBalance: apr18.remainingBalance + 27_000 - 4_000,
    updatedAt: t2,
    enteredBy: "Demo",
  };

  return {
    "2026-04-17": apr17,
    "2026-04-18": apr18,
    "2026-04-19": apr19,
  };
}

/**
 * In dev, fills empty daily-entry storage with sample rows so lists and reports have data to show.
 * Returns true if storage was seeded.
 */
export function seedDummyDailyEntriesIfEmpty(): boolean {
  if (!import.meta.env.DEV) return false;
  if (Object.keys(readDailyEntryMap()).length > 0) return false;
  const result = writeDailyEntryMap(dummyDailyEntryMap());
  return result.ok;
}
