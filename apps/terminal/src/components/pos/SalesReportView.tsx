import { Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  bankNetAfterWithdrawals,
  listDailyEntriesDescendingFromMap,
  useDailyEntryMap,
  type DailyEntryRow,
} from "@/features/daily-entry";
import { formatDateKeyAsDisplay } from "../../lib/dateDisplay";

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
    r.nagadSale +
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
  bankWithdrawn: number;
  cashIn: number;
  bankBalance: number;
  bkash: number;
  nagad: number;
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
  const bankWithdrawn = r.bankWithdrawn ?? 0;
  const cashIn = r.cashIn ?? 0;
  return {
    dateKey: r.date,
    displayDate: formatDateKeyAsDisplay(r.date),
    openingBalance: r.openingBalance,
    cash: r.cashSale,
    bank: r.bankSale,
    bankWithdrawn,
    cashIn,
    bankBalance: bankNetAfterWithdrawals(r.bankSale, bankWithdrawn),
    bkash: r.bkashSale,
    nagad: r.nagadSale,
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
  bankWithdrawn: number;
  cashIn: number;
  bankBalance: number;
  bkash: number;
  nagad: number;
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
      bankWithdrawn: acc.bankWithdrawn + row.bankWithdrawn,
      cashIn: acc.cashIn + row.cashIn,
      bankBalance: acc.bankBalance + row.bankBalance,
      bkash: acc.bkash + row.bkash,
      nagad: acc.nagad + row.nagad,
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
      bankWithdrawn: 0,
      cashIn: 0,
      bankBalance: 0,
      bkash: 0,
      nagad: 0,
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

const fieldClass =
  "mt-1 h-9 w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)] focus:outline-none";
const labelClass = "text-[11px] text-[var(--pos-text-2)]";
const statCell =
  "min-w-[120px] flex-1 rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2";

export function SalesReportView() {
  const { map, loading, error } = useDailyEntryMap();
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const allRows = useMemo(
    () => listDailyEntriesDescendingFromMap(map).map(rowFromEntry),
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

  const footerTotals = useMemo(() => sumFooter(filteredRows), [filteredRows]);

  const hasFilters = search.trim() !== "" || dateFrom !== "" || dateTo !== "";

  const clearFilters = useCallback(() => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
  }, []);

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
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2.5">
        <div className={statCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Net sales</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {formatMoney(footerTotals.netSales)}
          </div>
        </div>
        <div className={statCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Gross sales</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {formatMoney(footerTotals.grossSales)}
          </div>
        </div>
        <div className={statCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Void</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {formatMoney(footerTotals.voidSale)}
          </div>
        </div>
        <div className={statCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Expenses</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {formatMoney(footerTotals.expenses)}
          </div>
        </div>
        <div className={statCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Bank withdrawn</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {formatMoney(footerTotals.bankWithdrawn)}
          </div>
        </div>
        <div className={statCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Cash In</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {formatMoney(footerTotals.cashIn)}
          </div>
        </div>
        <div className={statCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Days</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {filteredRows.length}
          </div>
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
              placeholder="Search date, entered by, or void note"
              className="h-9 w-full cursor-text rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] pl-9 pr-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)] focus:outline-none"
              aria-label="Search sales report"
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
            day{filteredRows.length === 1 ? "" : "s"} shown
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
              ? "No daily entries yet. Save a daily entry from Daily Entry Form to see sales here."
              : "No rows match your filters."}
          </div>
        ) : (
          <table className="w-full min-w-[1680px] border-collapse text-center">
            <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
              <tr className="border-b border-solid [border-color:var(--pos-divider)]">
                <th className={thClass}>Date</th>
                <th className={thClass} title="Opening balance for the day">
                  Opening
                </th>
                <th className={thClass}>Cash</th>
                <th className={thClass}>Bank</th>
                <th
                  className={thClass}
                  title="Cash brought from bank into the cash counter (not sales)"
                >
                  Bank withdrawn
                </th>
                <th
                  className={thClass}
                  title="Owner top-up into the cash counter (not sales)"
                >
                  Cash In
                </th>
                <th
                  className={thClass}
                  title="Bank sales minus bank withdrawn"
                >
                  Bank balance
                </th>
                <th className={thClass}>bKash</th>
                <th className={thClass}>Nagad</th>
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
                <th
                  className={thClass}
                  title="Closing cash: opening + cash channels − void − expenses + bank withdraw + cash in"
                >
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
                  <td className={tdNum}>{formatMoney(row.bankWithdrawn)}</td>
                  <td className={tdNum}>{formatMoney(row.cashIn)}</td>
                  <td className={tdNum}>{formatMoney(row.bankBalance)}</td>
                  <td className={tdNum}>{formatMoney(row.bkash)}</td>
                  <td className={tdNum}>{formatMoney(row.nagad)}</td>
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
                <td className={footTd}>{formatMoney(footerTotals.bankWithdrawn)}</td>
                <td className={footTd}>{formatMoney(footerTotals.cashIn)}</td>
                <td className={footTd}>{formatMoney(footerTotals.bankBalance)}</td>
                <td className={footTd}>{formatMoney(footerTotals.bkash)}</td>
                <td className={footTd}>{formatMoney(footerTotals.nagad)}</td>
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
