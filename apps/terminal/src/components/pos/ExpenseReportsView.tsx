import { Search } from "lucide-react";
import { useMemo, useState } from "react";
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

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
            ? (line.vendor ?? "").trim() || "Cashbook"
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
            ? "Cashbook"
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
  lineKindLabel: string;
  description: string;
  note: string;
  ledgerEntryLabel: string;
  amount: number;
  receiptCount: number;
  enteredBy: string;
};

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
        lineKindLabel: line.lineKindLabel,
        description: line.description,
        note: line.note,
        ledgerEntryLabel: line.ledgerEntryLabel,
        amount: line.amount,
        receiptCount: line.receiptCount,
        enteredBy,
      });
    });
  }
  return out;
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
  ].join(" ");
  return hay.includes(q);
}

export function ExpenseReportsView() {
  const { map, loading, error } = useDailyEntryMap();
  const [search, setSearch] = useState("");

  const allRows = useMemo(
    () => buildReportRows(listDailyEntriesDescendingFromMap(map)),
    [map],
  );

  const query = search.trim().toLowerCase();
  const filteredRows = useMemo(
    () => allRows.filter((row) => rowMatchesQuery(row, query)),
    [allRows, query],
  );

  const grandTotal = useMemo(
    () => filteredRows.reduce((s, row) => s + row.amount, 0),
    [filteredRows],
  );

  const thBase =
    "px-3 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
        <div>
          <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">Expense reports</h1>
          <p className="text-[12px] text-[var(--pos-text-2)]">
            One row per saved expense line (cashbooks and regular), including ledger entry type
            and receipts — aligned with Daily Entry Form.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
        <label className="relative min-w-[220px] flex-1">
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
          />
        </label>
        <div className="ml-auto text-[11px] text-[var(--pos-text-2)]">
          <span className="font-semibold text-[var(--pos-text-1)]">{filteredRows.length}</span>{" "}
          expense
          {filteredRows.length === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-[var(--pos-text-1)]">{formatMoney(grandTotal)}</span>{" "}
          total
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
              : "No expenses match your search."}
          </div>
        ) : (
          <table className="w-full min-w-[880px] border-collapse text-center">
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
                <th className={thBase}>Amount</th>
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
                  Total (filtered)
                </th>
                <td className="px-3 py-2 text-center text-[11px] font-semibold tabular-nums text-[var(--pos-text-1)]">
                  {formatMoney(grandTotal)}
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
