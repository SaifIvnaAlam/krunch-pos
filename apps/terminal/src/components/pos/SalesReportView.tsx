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

function channelSalesTotal(r: DailyEntryRow): number {
  return (
    r.cashSale +
    r.bankSale +
    r.bkashSale +
    r.pathaoSale +
    r.foodiSale +
    r.foodpandaSale
  );
}

function netSalesTotal(r: DailyEntryRow): number {
  return channelSalesTotal(r) - (r.voidSale ?? 0);
}

type SalesRow = {
  dateKey: string;
  displayDate: string;
  openingBalance: number;
  cash: number;
  bank: number;
  bkash: number;
  pathao: number;
  foodi: number;
  foodpanda: number;
  grossSales: number;
  voidSale: number;
  total: number;
  expenses: number;
  remainingBalance: number;
  voidRemarks: string;
  enteredBy: string;
};

function rowFromEntry(r: DailyEntryRow): SalesRow {
  return {
    dateKey: r.date,
    displayDate: formatDateKeyAsDisplay(r.date),
    openingBalance: r.openingBalance,
    cash: r.cashSale,
    bank: r.bankSale,
    bkash: r.bkashSale,
    pathao: r.pathaoSale,
    foodi: r.foodiSale,
    foodpanda: r.foodpandaSale,
    grossSales: channelSalesTotal(r),
    voidSale: r.voidSale ?? 0,
    total: netSalesTotal(r),
    expenses: r.expenses ?? 0,
    remainingBalance: r.remainingBalance,
    voidRemarks: (r.voidSaleRemarks ?? "").trim(),
    enteredBy: (r.enteredBy ?? "").trim() || "—",
  };
}

function rowMatchesQuery(row: SalesRow, q: string): boolean {
  if (q.length === 0) return true;
  const hay = [
    row.dateKey,
    row.displayDate.toLowerCase(),
    row.enteredBy.toLowerCase(),
    row.voidRemarks.toLowerCase(),
  ].join(" ");
  return hay.includes(q);
}

type SalesFooterTotals = {
  cash: number;
  bank: number;
  bkash: number;
  pathao: number;
  foodi: number;
  foodpanda: number;
  grossSales: number;
  voidSale: number;
  netSales: number;
  expenses: number;
};

function sumFooter(rows: SalesRow[]): SalesFooterTotals {
  return rows.reduce(
    (acc, row) => ({
      cash: acc.cash + row.cash,
      bank: acc.bank + row.bank,
      bkash: acc.bkash + row.bkash,
      pathao: acc.pathao + row.pathao,
      foodi: acc.foodi + row.foodi,
      foodpanda: acc.foodpanda + row.foodpanda,
      grossSales: acc.grossSales + row.grossSales,
      voidSale: acc.voidSale + row.voidSale,
      netSales: acc.netSales + row.total,
      expenses: acc.expenses + row.expenses,
    }),
    {
      cash: 0,
      bank: 0,
      bkash: 0,
      pathao: 0,
      foodi: 0,
      foodpanda: 0,
      grossSales: 0,
      voidSale: 0,
      netSales: 0,
      expenses: 0,
    },
  );
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

  const grandTotalNet = useMemo(
    () => filteredRows.reduce((s, row) => s + row.total, 0),
    [filteredRows],
  );

  const grandTotalExpenses = useMemo(
    () => filteredRows.reduce((s, row) => s + row.expenses, 0),
    [filteredRows],
  );

  const footerTotals = useMemo(() => sumFooter(filteredRows), [filteredRows]);

  const thClass =
    "whitespace-nowrap px-2 py-2 text-center text-[11px] font-semibold text-[var(--pos-text-2)]";
  const tdNum =
    "px-2 py-2 text-center tabular-nums text-[12px] text-[var(--pos-text-1)]";
  const footTh =
    "whitespace-nowrap px-2 py-2 text-right text-[11px] font-semibold text-[var(--pos-text-1)]";
  const footTd = "px-2 py-2 text-center tabular-nums text-[11px] font-semibold text-[var(--pos-text-1)]";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
        <div>
          <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">Sales report</h1>
          <p className="text-[12px] text-[var(--pos-text-2)]">
            Saved daily entries: channel sales, voids, net sales, expenses, and closing balance
            (same figures as Daily Entry Form).
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
            placeholder="Search date, entered by, or void note"
            className="h-9 w-full cursor-text rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] pl-9 pr-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)] focus:outline-none"
          />
        </label>
        <div className="ml-auto text-right text-[11px] text-[var(--pos-text-2)]">
          <div>
            <span className="font-semibold text-[var(--pos-text-1)]">{filteredRows.length}</span>{" "}
            day
            {filteredRows.length === 1 ? "" : "s"}
          </div>
          <div>
            Net sales{" "}
            <span className="font-semibold text-[var(--pos-text-1)]">{formatMoney(grandTotalNet)}</span>
            {" · "}
            Expenses{" "}
            <span className="font-semibold text-[var(--pos-text-1)]">
              {formatMoney(grandTotalExpenses)}
            </span>
          </div>
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
          <table className="w-full min-w-[1320px] border-collapse text-center">
            <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
              <tr className="border-b border-solid [border-color:var(--pos-divider)]">
                <th className={thClass}>Date</th>
                <th className={thClass} title="Opening balance for the day">
                  Opening
                </th>
                <th className={thClass}>Cash</th>
                <th className={thClass}>Bank</th>
                <th className={thClass}>bKash</th>
                <th className={thClass}>Pathao</th>
                <th className={thClass}>Foodi</th>
                <th className={thClass}>Foodpanda</th>
                <th className={thClass} title="Sum of channel sales before void">
                  Gross
                </th>
                <th className={thClass}>Void</th>
                <th className={thClass}>Net total</th>
                <th className={thClass} title="Total expenses saved for the day">
                  Expenses
                </th>
                <th className={thClass} title="Remaining balance after sales, void, and expenses">
                  Remaining
                </th>
                <th className={`${thClass} min-w-[100px]`}>Void note</th>
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
                  <td className={tdNum}>{formatMoney(row.openingBalance)}</td>
                  <td className={tdNum}>{formatMoney(row.cash)}</td>
                  <td className={tdNum}>{formatMoney(row.bank)}</td>
                  <td className={tdNum}>{formatMoney(row.bkash)}</td>
                  <td className={tdNum}>{formatMoney(row.pathao)}</td>
                  <td className={tdNum}>{formatMoney(row.foodi)}</td>
                  <td className={tdNum}>{formatMoney(row.foodpanda)}</td>
                  <td className={tdNum}>{formatMoney(row.grossSales)}</td>
                  <td className={tdNum}>{formatMoney(-row.voidSale)}</td>
                  <td className={`${tdNum} font-semibold`}>{formatMoney(row.total)}</td>
                  <td className={tdNum}>{formatMoney(row.expenses)}</td>
                  <td className={tdNum}>{formatMoney(row.remainingBalance)}</td>
                  <td
                    className="max-w-[140px] truncate px-2 py-2 text-center text-[11px] text-[var(--pos-text-2)]"
                    title={row.voidRemarks || undefined}
                  >
                    {row.voidRemarks || "—"}
                  </td>
                  <td className="max-w-[140px] truncate px-2 py-2 text-center text-[12px] text-[var(--pos-text-2)]">
                    {row.enteredBy}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 border-t border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]/95 backdrop-blur-sm">
              <tr>
                <th className={footTh} scope="row" colSpan={2}>
                  Totals (filtered days)
                </th>
                <td className={footTd}>{formatMoney(footerTotals.cash)}</td>
                <td className={footTd}>{formatMoney(footerTotals.bank)}</td>
                <td className={footTd}>{formatMoney(footerTotals.bkash)}</td>
                <td className={footTd}>{formatMoney(footerTotals.pathao)}</td>
                <td className={footTd}>{formatMoney(footerTotals.foodi)}</td>
                <td className={footTd}>{formatMoney(footerTotals.foodpanda)}</td>
                <td className={footTd}>{formatMoney(footerTotals.grossSales)}</td>
                <td className={footTd}>{formatMoney(-footerTotals.voidSale)}</td>
                <td className={footTd}>{formatMoney(footerTotals.netSales)}</td>
                <td className={footTd}>{formatMoney(footerTotals.expenses)}</td>
                <td className={footTd}>—</td>
                <td className={footTd} colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
