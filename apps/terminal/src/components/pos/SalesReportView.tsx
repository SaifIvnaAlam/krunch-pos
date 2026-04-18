import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DAILY_ENTRY_STORAGE_KEY,
  DAILY_ENTRY_STORAGE_UPDATE_EVENT,
  type DailyEntryRow,
  listDailyEntriesDescending,
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

function salesTotal(r: DailyEntryRow): number {
  return (
    r.cashSale +
    r.bankSale +
    r.bkashSale +
    r.pathaoSale +
    r.foodiSale +
    r.foodpandaSale
  );
}

type SalesRow = {
  dateKey: string;
  displayDate: string;
  cash: number;
  bank: number;
  bkash: number;
  pathao: number;
  foodi: number;
  foodpanda: number;
  total: number;
  enteredBy: string;
};

function rowFromEntry(r: DailyEntryRow): SalesRow {
  return {
    dateKey: r.date,
    displayDate: formatDateKeyAsDisplay(r.date),
    cash: r.cashSale,
    bank: r.bankSale,
    bkash: r.bkashSale,
    pathao: r.pathaoSale,
    foodi: r.foodiSale,
    foodpanda: r.foodpandaSale,
    total: salesTotal(r),
    enteredBy: (r.enteredBy ?? "").trim() || "—",
  };
}

function rowMatchesQuery(row: SalesRow, q: string): boolean {
  if (q.length === 0) return true;
  const hay = [
    row.dateKey,
    row.displayDate.toLowerCase(),
    row.enteredBy.toLowerCase(),
  ].join(" ");
  return hay.includes(q);
}

export function SalesReportView() {
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
    return listDailyEntriesDescending().map(rowFromEntry);
  }, [dataEpoch]);

  const query = search.trim().toLowerCase();
  const filteredRows = useMemo(
    () => allRows.filter((row) => rowMatchesQuery(row, query)),
    [allRows, query],
  );

  const grandTotal = useMemo(
    () => filteredRows.reduce((s, row) => s + row.total, 0),
    [filteredRows],
  );

  const thClass =
    "whitespace-nowrap px-2 py-2 text-center text-[11px] font-semibold text-[var(--pos-text-2)]";
  const tdNum =
    "px-2 py-2 text-center tabular-nums text-[12px] text-[var(--pos-text-1)]";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
        <div>
          <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">Sales report</h1>
          <p className="text-[12px] text-[var(--pos-text-2)]">
            Daily sales by channel from saved daily entries — newest dates first.
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
            placeholder="Search date or entered by"
            className="h-9 w-full cursor-text rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] pl-9 pr-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)] focus:outline-none"
          />
        </label>
        <div className="ml-auto text-[11px] text-[var(--pos-text-2)]">
          <span className="font-semibold text-[var(--pos-text-1)]">{filteredRows.length}</span>{" "}
          day
          {filteredRows.length === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-[var(--pos-text-1)]">{formatMoney(grandTotal)}</span>{" "}
          total sales
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {filteredRows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[var(--pos-text-2)]">
            {allRows.length === 0
              ? "No daily entries yet. Save a daily entry from Daily Entry Form to see sales here."
              : "No rows match your search."}
          </div>
        ) : (
          <table className="w-full min-w-[900px] border-collapse text-center">
            <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
              <tr className="border-b border-solid [border-color:var(--pos-divider)]">
                <th className={thClass}>Date</th>
                <th className={thClass}>Cash</th>
                <th className={thClass}>Bank</th>
                <th className={thClass}>bKash</th>
                <th className={thClass}>Pathao</th>
                <th className={thClass}>Foodi</th>
                <th className={thClass}>Foodpanda</th>
                <th className={thClass}>Total</th>
                <th className={`${thClass} min-w-[100px]`}>Entered by</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.dateKey}
                  className="border-b border-solid [border-color:var(--pos-divider)] transition-colors hover:bg-[var(--pos-nav-hover)]/25"
                >
                  <td className="whitespace-nowrap px-2 py-2 text-center text-[12px] text-[var(--pos-text-1)]">
                    {row.displayDate}
                  </td>
                  <td className={tdNum}>{formatMoney(row.cash)}</td>
                  <td className={tdNum}>{formatMoney(row.bank)}</td>
                  <td className={tdNum}>{formatMoney(row.bkash)}</td>
                  <td className={tdNum}>{formatMoney(row.pathao)}</td>
                  <td className={tdNum}>{formatMoney(row.foodi)}</td>
                  <td className={tdNum}>{formatMoney(row.foodpanda)}</td>
                  <td className={`${tdNum} font-semibold`}>{formatMoney(row.total)}</td>
                  <td className="max-w-[140px] truncate px-2 py-2 text-center text-[12px] text-[var(--pos-text-2)]">
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
