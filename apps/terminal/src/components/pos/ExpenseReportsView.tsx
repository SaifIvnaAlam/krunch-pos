import { Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  listDailyEntriesDescendingFromMap,
  savedLineKind,
  staffExpenseLineNote,
  staffExpenseLineTitle,
  useDailyEntryMap,
  type DailyEntryRow,
} from "@/features/daily-entry";
import { isStaffFineExpenseLine } from "@/features/daily-entry/staffExpenseLine";
import { formatDateKeyAsDisplay } from "../../lib/dateDisplay";
import { expenseSavedLineLedgerReportLabel } from "../../lib/ledgerLineReportLabels";
import {
  expenseStatLabel,
  expenseStatTile,
  expenseStatValue,
} from "./payablesUi";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

const fieldClass =
  "mt-1 h-9 w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)] focus:outline-none";
const labelClass = "text-[11px] text-[var(--pos-text-2)]";

type FlatLine = {
  kind: "vendor" | "regular" | "staff" | "purchase";
  lineKindLabel: string;
  description: string;
  note: string;
  amount: number;
  receiptCount: number;
  ledgerEntryLabel: string;
  stableKey: string;
};

function expenseLinesFromDailyRow(r: DailyEntryRow): FlatLine[] {
  if (r.expenseLines && r.expenseLines.length > 0) {
    return r.expenseLines.filter((line) => !isStaffFineExpenseLine(line)).map((line, idx) => {
      const kind = savedLineKind(line);
      const description =
        kind === "staff"
          ? staffExpenseLineTitle(line)
          : kind === "vendor"
            ? (line.vendor ?? "").trim() || "Supplier"
            : kind === "purchase"
              ? (line.vendor ?? "").trim() || "Purchase"
              : (line.label ?? "").trim() || "Regular expense";
      const note =
        kind === "staff"
          ? staffExpenseLineNote(line)
          : kind === "vendor" || kind === "purchase"
            ? (line.ledgerNote ?? "").trim() ||
              (kind === "purchase" && line.items?.length
                ? line.items.map((i) => i.name).filter(Boolean).join(", ")
                : "")
            : (line.note ?? "").trim();
      const lineKindLabel =
        kind === "staff"
          ? "Payout"
          : kind === "vendor"
            ? "Supplier"
            : kind === "purchase"
              ? "Items purchased"
              : "Regular expense";
      const idPart =
        line.lineId && String(line.lineId).trim().length > 0
          ? String(line.lineId).trim()
          : `idx-${idx}`;
      return {
        kind,
        lineKindLabel,
        description,
        note,
        amount: line.amount,
        receiptCount: line.receiptDataUrls?.length ?? 0,
        ledgerEntryLabel: expenseSavedLineLedgerReportLabel(line),
        stableKey: `${r.date}:${idPart}`,
      };
    });
  }
  if ((r.expenses ?? 0) > 0) {
    return [
      {
        kind: "vendor" as const,
        lineKindLabel: "Day total (legacy)",
        description: "No line detail — stored expense total only",
        note: "",
        amount: r.expenses ?? 0,
        receiptCount: 0,
        ledgerEntryLabel: "—",
        stableKey: `${r.date}:legacy-total`,
      },
    ];
  }
  return [];
}

type ReportRow = {
  id: string;
  dateKey: string;
  displayDate: string;
  kind: FlatLine["kind"];
  lineKindLabel: string;
  description: string;
  note: string;
  ledgerEntryLabel: string;
  amount: number;
  /**
   * Cash paid: for purchases, same-day cashbook payment applied to the bill;
   * for payout / regular / cashbook rows, the expense amount (already cash out).
   */
  paidAmount: number;
  receiptCount: number;
  enteredBy: string;
};

function vendorKey(description: string): string {
  return description.trim().toLowerCase();
}

function buildReportRows(saved: DailyEntryRow[]): ReportRow[] {
  const out: ReportRow[] = [];
  for (const r of saved) {
    const lines = expenseLinesFromDailyRow(r);
    if (lines.length === 0) continue;
    const displayDate = formatDateKeyAsDisplay(r.date);
    const enteredBy = (r.enteredBy ?? "").trim() || "—";
    lines.forEach((line) => {
      out.push({
        id: line.stableKey,
        dateKey: r.date,
        displayDate,
        kind: line.kind,
        lineKindLabel: line.lineKindLabel,
        description: line.description,
        note: line.note,
        ledgerEntryLabel: line.ledgerEntryLabel,
        amount: line.amount,
        // Purchases start unpaid until a same-day cashbook payment is folded in.
        // Payout, regular, and cashbook lines are cash out — Paid equals Amount.
        paidAmount: line.kind === "purchase" ? 0 : line.amount,
        receiptCount: line.receiptCount,
        enteredBy,
      });
    });
  }
  return foldSameDayPaymentsIntoPurchases(out);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Same-day cashbook payments for a purchase vendor are shown as Paid on the bill
 * row instead of a duplicate Cashbook payment row.
 */
function foldSameDayPaymentsIntoPurchases(rows: ReportRow[]): ReportRow[] {
  const paidByPurchaseId = new Map<string, number>();
  /** Payment row id → remaining amount to keep (0 = hide). Absent = keep original. */
  const paymentRemainderById = new Map<string, number>();

  const rowsByDate = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const list = rowsByDate.get(row.dateKey);
    if (list) list.push(row);
    else rowsByDate.set(row.dateKey, [row]);
  }

  for (const dayRows of rowsByDate.values()) {
    const purchasesByVendor = new Map<string, ReportRow[]>();
    const paymentsByVendor = new Map<string, ReportRow[]>();

    for (const row of dayRows) {
      const key = vendorKey(row.description);
      if (!key) continue;
      if (row.kind === "purchase") {
        const list = purchasesByVendor.get(key);
        if (list) list.push(row);
        else purchasesByVendor.set(key, [row]);
      } else if (row.kind === "vendor") {
        const list = paymentsByVendor.get(key);
        if (list) list.push(row);
        else paymentsByVendor.set(key, [row]);
      }
    }

    for (const [key, purchases] of purchasesByVendor) {
      const payments = paymentsByVendor.get(key);
      if (!payments || payments.length === 0) continue;

      let payPool = payments.reduce((sum, p) => sum + p.amount, 0);
      if (payPool <= 0) continue;

      let appliedTotal = 0;
      for (const purchase of purchases) {
        if (payPool <= 0) break;
        const applied = Math.min(purchase.amount, payPool);
        paidByPurchaseId.set(purchase.id, applied);
        appliedTotal = roundMoney(appliedTotal + applied);
        payPool = roundMoney(payPool - applied);
      }

      let absorbBudget = appliedTotal;
      for (const payment of payments) {
        if (absorbBudget <= 0) {
          paymentRemainderById.set(payment.id, payment.amount);
          continue;
        }
        if (payment.amount <= absorbBudget + 1e-9) {
          paymentRemainderById.set(payment.id, 0);
          absorbBudget = roundMoney(absorbBudget - payment.amount);
        } else {
          paymentRemainderById.set(payment.id, roundMoney(payment.amount - absorbBudget));
          absorbBudget = 0;
        }
      }
    }
  }

  const out: ReportRow[] = [];
  for (const row of rows) {
    if (row.kind === "purchase") {
      out.push({
        ...row,
        paidAmount: paidByPurchaseId.get(row.id) ?? 0,
      });
      continue;
    }
    if (row.kind === "vendor" && paymentRemainderById.has(row.id)) {
      const remainder = paymentRemainderById.get(row.id)!;
      if (remainder <= 0) continue;
      out.push({ ...row, amount: remainder, paidAmount: remainder });
      continue;
    }
    out.push(row);
  }
  return out;
}

type ExpenseStatTotals = {
  total: number;
  cashbook: number;
  regular: number;
  payout: number;
  purchase: number;
  days: number;
};

function sumExpenseStats(rows: ReportRow[]): ExpenseStatTotals {
  const dayKeys = new Set<string>();
  const totals = rows.reduce(
    (acc, row) => {
      dayKeys.add(row.dateKey);
      if (row.kind === "purchase") {
        acc.purchase += row.amount;
        const paid = row.paidAmount;
        acc.total += paid;
        acc.cashbook += paid;
      } else if (row.kind === "vendor") {
        acc.total += row.amount;
        acc.cashbook += row.amount;
      } else if (row.kind === "regular") {
        acc.total += row.amount;
        acc.regular += row.amount;
      } else if (row.kind === "staff") {
        acc.total += row.amount;
        acc.payout += row.amount;
      }
      return acc;
    },
    { total: 0, cashbook: 0, regular: 0, payout: 0, purchase: 0 },
  );
  return { ...totals, days: dayKeys.size };
}

function rowMatchesQuery(row: ReportRow, q: string): boolean {
  if (q.length === 0) return true;
  const hay = [
    row.dateKey,
    row.displayDate.toLowerCase(),
    row.description.toLowerCase(),
    row.note.toLowerCase(),
    row.lineKindLabel.toLowerCase(),
    row.ledgerEntryLabel.toLowerCase(),
    row.enteredBy.toLowerCase(),
    String(row.paidAmount),
  ].join(" ");
  return hay.includes(q);
}

export function ExpenseReportsView() {
  const { map, loading, error } = useDailyEntryMap();
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const allRows = useMemo(
    () => buildReportRows(listDailyEntriesDescendingFromMap(map)),
    [map],
  );

  const query = search.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (dateFrom) rows = rows.filter((row) => row.dateKey >= dateFrom);
    if (dateTo) rows = rows.filter((row) => row.dateKey <= dateTo);
    if (query) rows = rows.filter((row) => rowMatchesQuery(row, query));
    return rows;
  }, [allRows, dateFrom, dateTo, query]);

  const stats = useMemo(() => sumExpenseStats(filteredRows), [filteredRows]);

  const hasFilters = search.trim() !== "" || dateFrom !== "" || dateTo !== "";

  const clearFilters = useCallback(() => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
  }, []);

  const thBase =
    "px-3 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
        <div>
          <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">Expense reports</h1>
          <p className="text-[12px] text-[var(--pos-text-2)]">
            Purchase bills show a Paid column for same-day supplier payments — those payments are
            not listed again as separate rows.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2.5">
        <div className={expenseStatTile} title="Cash out: supplier payments, regular, and payouts">
          <div className={expenseStatLabel}>Cash total</div>
          <div className={expenseStatValue}>{formatMoney(stats.total)}</div>
        </div>
        <div className={expenseStatTile} title="Includes paid amounts on purchase bills">
          <div className={expenseStatLabel}>Supplier</div>
          <div className={expenseStatValue}>{formatMoney(stats.cashbook)}</div>
        </div>
        <div className={expenseStatTile}>
          <div className={expenseStatLabel}>Regular</div>
          <div className={expenseStatValue}>{formatMoney(stats.regular)}</div>
        </div>
        <div className={expenseStatTile}>
          <div className={expenseStatLabel}>Payout</div>
          <div className={expenseStatValue}>{formatMoney(stats.payout)}</div>
        </div>
        <div
          className={expenseStatTile}
          title="Purchase bill amounts (payables) — cash paid is in Supplier / Paid"
        >
          <div className={expenseStatLabel}>Purchase bills</div>
          <div className={expenseStatValue}>{formatMoney(stats.purchase)}</div>
        </div>
        <div className={expenseStatTile}>
          <div className={expenseStatLabel}>Days</div>
          <div className={expenseStatValue}>{stats.days}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
        <label className="relative min-w-[220px] flex-1">
          <span className={labelClass}>Search</span>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pos-text-2)]"
              strokeWidth={2}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search date, book, note, ledger entry, entered by…"
              className="h-9 w-full cursor-text rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] pl-9 pr-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)] focus:outline-none"
              aria-label="Search expense reports"
            />
          </div>
        </label>
        <label className="block min-w-[120px] max-w-[140px]">
          <span className={labelClass}>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={fieldClass}
            aria-label="From date"
          />
        </label>
        <label className="block min-w-[120px] max-w-[140px]">
          <span className={labelClass}>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={fieldClass}
            aria-label="To date"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-card)] px-3 text-[12px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-nav-hover)]/40"
            >
              Clear
            </button>
          ) : null}
          <span className="text-[11px] text-[var(--pos-text-2)]">
            <span className="font-semibold text-[var(--pos-text-1)]">{filteredRows.length}</span>{" "}
            expense{filteredRows.length === 1 ? "" : "s"} shown
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="px-4 py-10 text-center text-[13px] text-[var(--pos-text-2)]">
            Loading daily entries…
          </div>
        ) : error ? (
          <div className="px-4 py-10 text-center text-[13px] text-red-600" role="alert">
            {error}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[var(--pos-text-2)]">
            {allRows.length === 0
              ? "No expenses yet. Save a daily entry with expense lines to see them here."
              : "No expenses match your filters."}
          </div>
        ) : (
          <table className="w-full min-w-[960px] border-collapse text-center">
            <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
              <tr className="border-b border-solid [border-color:var(--pos-divider)]">
                <th className={`whitespace-nowrap ${thBase}`}>Date</th>
                <th className={`min-w-[120px] ${thBase}`}>Line kind</th>
                <th className={`min-w-[160px] text-left ${thBase}`}>Description</th>
                <th className={`min-w-[120px] text-left ${thBase}`}>Note</th>
                <th
                  className={`min-w-[120px] ${thBase}`}
                  title="Ledger type when synced to Bills &amp; payments; “not posted” if sync failed"
                >
                  Ledger entry
                </th>
                <th className={thBase} title="Bill amount for purchases; expense amount otherwise">
                  Amount
                </th>
                <th
                  className={thBase}
                  title="Cash paid: same-day payment on purchase bills; full amount for payouts, regular, and supplier"
                >
                  Paid
                </th>
                <th className={`w-24 ${thBase}`}>Receipts</th>
                <th className={`min-w-[100px] ${thBase}`}>Entered by</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-solid [border-color:var(--pos-divider)] text-[12px] transition-colors hover:bg-[var(--pos-nav-hover)]/25"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--pos-text-1)]">
                    {row.displayDate}
                  </td>
                  <td className="px-3 py-2 text-[var(--pos-text-2)]">{row.lineKindLabel}</td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-left text-[var(--pos-text-1)]">
                    {row.description}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-left text-[var(--pos-text-2)]">
                    {row.note ? row.note : "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--pos-text-2)]">{row.ledgerEntryLabel}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--pos-text-1)]">
                    {formatMoney(row.amount)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[var(--pos-text-1)]">
                    {row.paidAmount > 0 ? formatMoney(row.paidAmount) : "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--pos-text-2)]">
                    {row.receiptCount > 0 ? row.receiptCount : "—"}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-[var(--pos-text-2)]">
                    {row.enteredBy}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 border-t border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]/95 backdrop-blur-sm">
              <tr>
                <th
                  className="px-3 py-2 text-right text-[11px] font-semibold text-[var(--pos-text-1)]"
                  colSpan={5}
                  scope="row"
                >
                  Cash total (filtered)
                </th>
                <td className="px-3 py-2 text-center text-[11px] text-[var(--pos-text-2)]">—</td>
                <td
                  className="px-3 py-2 text-center text-[11px] font-semibold tabular-nums text-[var(--pos-text-1)]"
                  title="Cash out only (paid on bills + other cash expenses)"
                >
                  {formatMoney(stats.total)}
                </td>
                <td className="px-3 py-2 text-center text-[11px] text-[var(--pos-text-2)]" colSpan={2}>
                  —
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
