import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DAILY_ENTRY_STORAGE_KEY,
  DAILY_ENTRY_STORAGE_UPDATE_EVENT,
  type DailyEntryRow,
  listDailyEntriesDescending,
  savedLineKind,
} from "../../lib/dailyEntryStorage";

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatDateKeyAsDisplay(dateKey: string): string {
  const parts = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  const [y, m, d] = parts;
  if (!y || !m || m < 1 || m > 12 || !d || d < 1 || d > 31) return dateKey;
  const mon = MONTH_ABBR[m - 1];
  if (!mon) return dateKey;
  const dd = String(d).padStart(2, "0");
  return `${dd}-${mon}-${y}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

type FlatLine = {
  kind: "vendor" | "regular";
  description: string;
  amount: number;
  receiptCount: number;
};

function expenseLinesFromDailyRow(r: DailyEntryRow): FlatLine[] {
  if (r.expenseLines && r.expenseLines.length > 0) {
    return r.expenseLines.map((line) => {
      const kind = savedLineKind(line);
      const description =
        kind === "vendor"
          ? (line.vendor ?? "").trim() || "Vendor"
          : (line.label ?? "").trim() || "Regular expense";
      return {
        kind,
        description,
        amount: line.amount,
        receiptCount: line.receiptDataUrls?.length ?? 0,
      };
    });
  }
  if ((r.expenses ?? 0) > 0) {
    return [
      {
        kind: "vendor" as const,
        description: "Legacy total",
        amount: r.expenses ?? 0,
        receiptCount: 0,
      },
    ];
  }
  return [];
}

type ReportRow = {
  id: string;
  dateKey: string;
  displayDate: string;
  kind: "vendor" | "regular";
  description: string;
  amount: number;
  receiptCount: number;
  enteredBy: string;
};

function buildReportRows(): ReportRow[] {
  const saved = listDailyEntriesDescending();
  const out: ReportRow[] = [];
  for (const r of saved) {
    const lines = expenseLinesFromDailyRow(r);
    if (lines.length === 0) continue;
    const displayDate = formatDateKeyAsDisplay(r.date);
    const enteredBy = (r.enteredBy ?? "").trim() || "—";
    lines.forEach((line, idx) => {
      out.push({
        id: `${r.date}-${idx}`,
        dateKey: r.date,
        displayDate,
        kind: line.kind,
        description: line.description,
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
    row.kind,
    row.enteredBy.toLowerCase(),
  ].join(" ");
  return hay.includes(q);
}

export function ExpenseReportsView() {
  const [dataEpoch, setDataEpoch] = useState(0);
  const [search, setSearch] = useState("");

  const bump = useCallback(() => setDataEpoch((n) => n + 1), []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DAILY_ENTRY_STORAGE_KEY) bump();
    };
    window.addEventListener(DAILY_ENTRY_STORAGE_UPDATE_EVENT, bump);
    window.addEventListener("storage", onStorage);
    const onFocus = () => bump();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(DAILY_ENTRY_STORAGE_UPDATE_EVENT, bump);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [bump]);

  const allRows = useMemo(() => {
    void dataEpoch;
    return buildReportRows();
  }, [dataEpoch]);

  const query = search.trim().toLowerCase();
  const filteredRows = useMemo(
    () => allRows.filter((row) => rowMatchesQuery(row, query)),
    [allRows, query],
  );

  const grandTotal = useMemo(
    () => filteredRows.reduce((s, row) => s + row.amount, 0),
    [filteredRows],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
        <div>
          <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">Expense reports</h1>
          <p className="text-[12px] text-[var(--pos-text-2)]">
            All daily entry expenses in one table — newest dates first; same date appears on each
            line.
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
            placeholder="Search date, description, entered by, or type"
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
        {filteredRows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[var(--pos-text-2)]">
            {allRows.length === 0
              ? "No expenses yet. Save a daily entry with expense lines to see them here."
              : "No expenses match your search."}
          </div>
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-center">
            <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
              <tr className="border-b border-solid [border-color:var(--pos-divider)]">
                <th className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                  Date
                </th>
                <th className="min-w-[180px] px-3 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                  Description
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Type</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                  Amount
                </th>
                <th className="w-24 px-3 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                  Receipts
                </th>
                <th className="min-w-[120px] px-3 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                  Entered by
                </th>
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
                  <td className="max-w-[280px] truncate px-3 py-2 text-[var(--pos-text-1)]">
                    {row.description}
                  </td>
                  <td className="px-3 py-2 capitalize text-[var(--pos-text-2)]">{row.kind}</td>
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
          </table>
        )}
      </div>
    </div>
  );
}
