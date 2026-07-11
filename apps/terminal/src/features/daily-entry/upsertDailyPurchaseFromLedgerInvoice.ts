import {
  carriedOpeningBalanceForDate,
  computeRemainingBalanceForRow,
  expenseTotalFromExpenseLines,
} from "./calculations";
import { loadDailyEntryMap, saveDailyEntry } from "./dailyEntryRepository";
import { DAILY_ENTRY_STORAGE_UPDATE_EVENT } from "./localDailyEntryStorage";
import type {
  DailyEntryMap,
  DailyEntryRow,
  DailyPurchaseItemSaved,
  ExpenseLineSaved,
} from "./types";

export type UpsertDailyPurchaseFromLedgerParams = {
  ledgerEntryId: string;
  purchaseOrderId?: string;
  /** Cashbook / vendor book display name. */
  vendorName: string;
  date: string;
  notes?: string;
  /** Bill total in cents (absolute). */
  amountCents: number;
  items: Array<{
    id?: string;
    name: string;
    qty: number;
    unit: string;
    rateCents: number;
    totalCents: number;
  }>;
  /** Persisted media refs / data URLs from ledger attachments. */
  attachmentRefs?: string[];
  enteredBy?: string;
};

export type UpsertDailyPurchaseFromLedgerResult =
  | { ok: true; dailyEntryDate: string; lineId: string }
  | { ok: false; message: string };

function newExpenseLineId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyDailyEntryRow(
  dateKey: string,
  openingBalance: number,
  enteredBy: string,
): DailyEntryRow {
  return {
    date: dateKey,
    openingBalance,
    cashSale: 0,
    bankSale: 0,
    bkashSale: 0,
    nagadSale: 0,
    pathaoSale: 0,
    foodiSale: 0,
    foodpandaSale: 0,
    expenses: 0,
    bankWithdrawn: 0,
    expenseLines: [],
    remainingBalance: openingBalance,
    updatedAt: new Date().toISOString(),
    enteredBy,
  };
}

/** Prefer a real name; treat blank / "Unknown" as missing. */
function resolveEnteredByName(
  preferred?: string,
  ...fallbacks: Array<string | undefined>
): string {
  const candidates = [preferred, ...fallbacks];
  for (const candidate of candidates) {
    const name = candidate?.trim();
    if (name && name !== "Unknown") return name;
  }
  for (const candidate of candidates) {
    const name = candidate?.trim();
    if (name) return name;
  }
  return "Unknown";
}

/** Keep an existing real name; fill in when missing or previously Unknown. */
function mergeEnteredByName(
  existing: string | undefined,
  incoming: string,
): string {
  const prior = existing?.trim();
  if (prior && prior !== "Unknown") return prior;
  return incoming;
}

function centsToTaka(cents: number): number {
  return Math.round(cents) / 100;
}

function buildPurchaseItems(
  params: UpsertDailyPurchaseFromLedgerParams,
): DailyPurchaseItemSaved[] {
  const rows = params.items.filter((i) => i.name.trim() && i.totalCents > 0);
  if (rows.length > 0) {
    return rows.map((i) => ({
      id: i.id?.trim() || newExpenseLineId(),
      name: i.name.trim(),
      qty: i.qty,
      unit: i.unit.trim() || "pcs",
      rate: centsToTaka(i.rateCents),
      total: centsToTaka(i.totalCents),
    }));
  }
  const amount = centsToTaka(Math.abs(params.amountCents));
  if (amount <= 0) return [];
  const note = params.notes?.trim();
  return [
    {
      id: newExpenseLineId(),
      name: note || "Purchase",
      qty: 1,
      unit: "pcs",
      rate: amount,
      total: amount,
    },
  ];
}

function buildPurchaseLine(
  params: UpsertDailyPurchaseFromLedgerParams,
  lineId: string,
  items: DailyPurchaseItemSaved[],
): ExpenseLineSaved {
  const amount = items.reduce((s, i) => s + i.total, 0);
  const receipts = (params.attachmentRefs ?? [])
    .map((r) => r.trim())
    .filter(Boolean);
  const note = params.notes?.trim() ?? "";
  return {
    kind: "purchase",
    vendor: params.vendorName.trim(),
    amount,
    items,
    ledgerKind: "invoice",
    lineId,
    ...(note ? { ledgerNote: note } : {}),
    ...(receipts.length > 0 ? { receiptDataUrls: receipts } : {}),
    ledgerLink: {
      ledgerEntryId: params.ledgerEntryId,
      ...(params.purchaseOrderId
        ? { purchaseOrderId: params.purchaseOrderId }
        : {}),
    },
  };
}

function finalizeRow(row: DailyEntryRow): DailyEntryRow {
  const next = {
    ...row,
    expenses: expenseTotalFromExpenseLines(row.expenseLines),
    updatedAt: new Date().toISOString(),
  };
  next.remainingBalance = computeRemainingBalanceForRow(next);
  return next;
}

function findLinkedLine(
  map: DailyEntryMap,
  ledgerEntryId: string,
): { date: string; line: ExpenseLineSaved } | null {
  for (const row of Object.values(map)) {
    for (const line of row.expenseLines ?? []) {
      if (line.ledgerLink?.ledgerEntryId === ledgerEntryId) {
        return { date: row.date, line };
      }
    }
  }
  return null;
}

/**
 * Upserts an Items purchased line on Daily Entry when a cashbook bill is
 * created or edited in Bills & payments (reverse of daily → ledger sync).
 */
export async function upsertDailyPurchaseFromLedgerInvoice(
  params: UpsertDailyPurchaseFromLedgerParams,
): Promise<UpsertDailyPurchaseFromLedgerResult> {
  const ledgerEntryId = params.ledgerEntryId.trim();
  const vendorName = params.vendorName.trim();
  const dateKey = params.date.trim();

  if (!ledgerEntryId) {
    return { ok: false, message: "Ledger entry is required." };
  }
  if (!vendorName) {
    return { ok: false, message: "Vendor cashbook is required." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return { ok: false, message: "Bill date is required." };
  }

  const items = buildPurchaseItems(params);
  if (items.length === 0) {
    return { ok: false, message: "Bill needs at least one item or amount." };
  }

  const map = await loadDailyEntryMap({ force: true });
  const linked = findLinkedLine(map, ledgerEntryId);
  const lineId = linked?.line.lineId?.trim() || newExpenseLineId();
  const purchaseLine = buildPurchaseLine(params, lineId, items);

  const targetPrior = map[dateKey];
  if (targetPrior?.isLocked) {
    return {
      ok: false,
      message: `Daily entry for ${dateKey} is locked — unlock it before saving this bill.`,
    };
  }
  if (linked && linked.date !== dateKey) {
    const oldRow = map[linked.date];
    if (oldRow?.isLocked) {
      return {
        ok: false,
        message: `Daily entry for ${linked.date} is locked — unlock it before moving this bill.`,
      };
    }
  }

  const enteredBy = resolveEnteredByName(
    params.enteredBy,
    targetPrior?.enteredBy,
    linked ? map[linked.date]?.enteredBy : undefined,
  );

  const datesToSave = new Set<string>([dateKey]);
  if (linked) datesToSave.add(linked.date);

  const nextMap: DailyEntryMap = { ...map };

  if (linked && linked.date !== dateKey) {
    const oldRow = map[linked.date]!;
    const oldLines = (oldRow.expenseLines ?? []).filter(
      (l) => l.ledgerLink?.ledgerEntryId !== ledgerEntryId,
    );
    nextMap[linked.date] = finalizeRow({
      ...oldRow,
      expenseLines: oldLines,
    });
  }

  let targetRow = nextMap[dateKey] ?? targetPrior;
  if (!targetRow) {
    const openingBalance = carriedOpeningBalanceForDate(map, dateKey).opening;
    targetRow = emptyDailyEntryRow(dateKey, openingBalance, enteredBy);
  }

  const withoutLink = (targetRow.expenseLines ?? []).filter(
    (l) => l.ledgerLink?.ledgerEntryId !== ledgerEntryId,
  );
  nextMap[dateKey] = finalizeRow({
    ...targetRow,
    expenseLines: [...withoutLink, purchaseLine],
    enteredBy: mergeEnteredByName(targetRow.enteredBy, enteredBy),
  });

  for (const d of datesToSave) {
    const row = nextMap[d];
    if (!row) continue;
    const saveRes = await saveDailyEntry(row);
    if (!saveRes.ok) {
      return { ok: false, message: saveRes.message };
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DAILY_ENTRY_STORAGE_UPDATE_EVENT));
  }

  return { ok: true, dailyEntryDate: dateKey, lineId };
}
