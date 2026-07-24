import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, ChevronDown, Plus, Rows2, Rows3, Search, Trash2, X } from "lucide-react";
import {
  createExpense,
  createExpenseCategory,
  createPayment,
  deleteExpense,
  deletePayment,
  getExpense,
  listExpenseCategories,
  listExpenses,
  listSuppliers,
  EXPENSE_KIND_LABEL,
  EXPENSE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_OPTIONS,
  expenseStatusTone,
  type CreateExpenseInput,
  type ExpenseCategory,
  type ExpenseDetail,
  type ExpenseKind,
  type ExpenseStatus,
  type ExpenseSummary,
  type PaymentMethod,
  type SupplierOption,
} from "@/features/payables";
import { formatDateKeyAsDisplay, todayDateKey } from "../../lib/dateDisplay";
import { dispatchPosSelectLeaf } from "../../lib/posNavEvents";
import {
  brandBtn,
  dangerBtn,
  fieldLabel,
  floatingCard,
  formatMoney,
  pageH1,
  pageWrap,
  payBody,
  payHead,
  paySubtitle,
  payTitle,
  primaryBtn,
  secondaryBtn,
  selectInput,
  textInput,
} from "./payablesUi";
import { sheetTableWrap, sheetTd, sheetTdNum, sheetTh, sheetThNum } from "./salaryUiShared";

type DraftItem = { name: string; qty: string; rate: string };

/** Where a system-managed (non-manual) row originates, for the read-only notice. */
const EXPENSE_SOURCE_ORIGIN: Record<string, string> = {
  purchase: "Daily Entry (item purchase)",
  daily: "Daily Entry",
  ledger: "Daily Entry",
};

/** Short origin used for the inline "↳ source" sub-label under a row title. */
const EXPENSE_SOURCE_SHORT: Record<string, string> = {
  purchase: "Daily entry",
  daily: "Daily entry",
  ledger: "Daily entry",
};

/** Neutral category tag — one restrained style, no rainbow. */
const catChip =
  "inline-flex items-center rounded-full border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-2 py-0.5 text-[11px] font-medium text-[var(--pos-text-2)]";

/** Faint "↳ Daily entry" line shown under a synced row's title. */
function SourceSub({ source }: { source: string }) {
  return (
    <span className="mt-0.5 block text-[11px] font-medium text-[var(--pos-text-2)]">
      ↳ {EXPENSE_SOURCE_SHORT[source] ?? "Synced"}
    </span>
  );
}

/** Status as a colored dot + label (quieter than a bordered pill, still scannable). */
function StatusCell({ status }: { status: ExpenseStatus }) {
  const dot =
    status === "paid"
      ? "bg-emerald-600"
      : status === "partially_paid"
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${expenseStatusTone(status)}`}>
      <span className={`h-[7px] w-[7px] rounded-full ${dot}`} />
      {EXPENSE_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Executive summary band: leads with the one number the owner acts on (still
 * due), paired with a settlement progress bar (paid vs due). Reused by the
 * Other Expenses and All Expenses pages.
 */
export function SettlementSummary({
  total,
  paid,
  due,
  openCount,
  extra,
}: {
  total: number;
  paid: number;
  due: number;
  openCount?: number;
  extra?: React.ReactNode;
}) {
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  return (
    <div className="px-5 py-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-6">
        <div className="sm:border-r sm:border-solid sm:[border-color:var(--pos-divider)] sm:pr-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[var(--pos-text-2)]">
            Still due
          </div>
          <div
            className={`mt-1.5 font-mono text-[30px] font-bold leading-none tabular-nums ${
              due > 0 ? "text-red-600 dark:text-red-400" : "text-[var(--pos-text-1)]"
            }`}
          >
            {formatMoney(due)}
          </div>
          {openCount !== undefined ? (
            <div className="mt-1.5 text-[12px] text-[var(--pos-text-2)]">
              across <span className="font-semibold text-[var(--pos-text-1)]">{openCount}</span>{" "}
              open {openCount === 1 ? "bill" : "bills"}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col justify-center gap-2.5">
          <div className="flex items-baseline justify-between">
            <div className="font-mono text-[15px] font-semibold tabular-nums text-[var(--pos-text-1)]">
              {formatMoney(total)}{" "}
              <span className="font-sans text-[12px] font-normal text-[var(--pos-text-2)]">spent</span>
            </div>
            <div className="text-[12px] text-[var(--pos-text-2)]">{pct}% settled</div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--pos-divider)]">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-5 text-[12px] text-[var(--pos-text-2)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-600" /> Paid{" "}
              <span className="font-mono font-semibold tabular-nums text-[var(--pos-text-1)]">
                {formatMoney(paid)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Due{" "}
              <span className="font-mono font-semibold tabular-nums text-[var(--pos-text-1)]">
                {formatMoney(due)}
              </span>
            </span>
          </div>
        </div>
      </div>
      {extra ? <div className="mt-4">{extra}</div> : null}
    </div>
  );
}

// ---------------- Period selector (replaces raw date pickers) ----------------

type Period = "all" | "this_month" | "last_month" | "last_3_months" | "this_year";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "this_year", label: "This year" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function periodRange(p: Period): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (p) {
    case "this_month":
      return { from: dateKey(new Date(y, m, 1)) };
    case "last_month":
      return { from: dateKey(new Date(y, m - 1, 1)), to: dateKey(new Date(y, m, 0)) };
    case "last_3_months":
      return { from: dateKey(new Date(y, m - 2, 1)) };
    case "this_year":
      return { from: dateKey(new Date(y, 0, 1)) };
    default:
      return {};
  }
}

function PeriodSelect({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  return (
    <div className="relative">
      <Calendar
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pos-text-2)]"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Period)}
        className="h-9 appearance-none rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] pl-8 pr-8 text-[13px] font-medium text-[var(--pos-text-1)] outline-none focus:border-[color-mix(in_srgb,var(--pos-sb-base)_45%,var(--pos-divider))]"
      >
        {PERIOD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--pos-text-2)]"
      />
    </div>
  );
}

/** Row-density toggle (comfortable / compact), as recommended for data tables. */
function DensityToggle({ dense, onChange }: { dense: boolean; onChange: (v: boolean) => void }) {
  const cell = "grid h-9 w-9 place-items-center transition-colors";
  const active = "bg-[color-mix(in_srgb,var(--pos-sb-base)_10%,var(--pos-card))] text-[var(--pos-sb-base)]";
  const idle = "text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]";
  return (
    <div className="inline-flex overflow-hidden rounded-[9px] border border-solid [border-color:var(--pos-divider)]">
      <button
        type="button"
        aria-label="Comfortable rows"
        className={`${cell} ${!dense ? active : idle}`}
        onClick={() => onChange(false)}
      >
        <Rows2 size={15} />
      </button>
      <button
        type="button"
        aria-label="Compact rows"
        className={`${cell} border-l border-solid [border-color:var(--pos-divider)] ${dense ? active : idle}`}
        onClick={() => onChange(true)}
      >
        <Rows3 size={15} />
      </button>
    </div>
  );
}

/** iOS-style segmented control used for the list filters. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-[9px] bg-[var(--pos-page)] p-0.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value || "all"}
            type="button"
            onClick={() => onChange(o.value)}
            className={[
              "h-7 rounded-[7px] px-2.5 text-[12px] font-medium transition-colors",
              active
                ? "bg-[var(--pos-card)] font-semibold text-[var(--pos-text-1)] shadow-sm"
                : "text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ExpensesListView({
  lockedKind,
  embedded = false,
}: { lockedKind?: ExpenseKind; embedded?: boolean } = {}) {
  const [rows, setRows] = useState<ExpenseSummary[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<ExpenseKind | "">(lockedKind ?? "");
  const [status, setStatus] = useState<ExpenseStatus | "">("");
  const isPurchases = lockedKind === "item_purchase";
  const isOther = lockedKind === "other_expense";
  const title = isPurchases ? "Item Purchases" : isOther ? "Other Expenses" : "All Expenses";
  const newLabel = isPurchases ? "New purchase" : isOther ? "New expense" : "Add entry";
  const [period, setPeriod] = useState<Period>("all");
  const [dense, setDense] = useState(false);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = periodRange(period);
      const list = await listExpenses({
        kind: kind || undefined,
        status: status || undefined,
        from: range.from,
        to: range.to,
      });
      setRows(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  }, [kind, status, period]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listExpenseCategories().then((c) => setCategories(c.filter((x) => x.active))).catch(() => {});
    void listSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.supplierName ?? "").toLowerCase().includes(q) ||
        (r.categoryName ?? "").toLowerCase().includes(q) ||
        r.items.some((it) => (it.name ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const totals = useMemo(() => {
    return visibleRows.reduce(
      (acc, r) => {
        acc.total += r.total;
        acc.paid += r.paid;
        acc.due += r.due;
        return acc;
      },
      { total: 0, paid: 0, due: 0 },
    );
  }, [visibleRows]);

  const openCount = useMemo(
    () => visibleRows.filter((r) => r.due > 0).length,
    [visibleRows],
  );

  const newButton = (
    <button type="button" className={brandBtn} onClick={() => setCreating(true)}>
      <Plus size={15} /> {newLabel}
    </button>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {lockedKind ? null : (
        <Segmented
          value={kind}
          onChange={(v) => setKind(v as ExpenseKind | "")}
          options={[
            { value: "", label: "All" },
            { value: "item_purchase", label: "Purchases" },
            { value: "other_expense", label: "Other" },
          ]}
        />
      )}
      <Segmented
        value={status}
        onChange={(v) => setStatus(v as ExpenseStatus | "")}
        options={[
          { value: "", label: "All" },
          { value: "unpaid", label: "Unpaid" },
          { value: "partially_paid", label: "Partial" },
          { value: "paid", label: "Paid" },
        ]}
      />
      {status || query || (!lockedKind && kind) ? (
        <button
          type="button"
          className="text-[12px] font-medium text-[var(--pos-text-2)] underline-offset-2 hover:text-[var(--pos-text-1)] hover:underline"
          onClick={() => {
            setStatus("");
            setQuery("");
            if (!lockedKind) setKind("");
          }}
        >
          Clear
        </button>
      ) : null}
      <label className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-2.5 focus-within:border-[color-mix(in_srgb,var(--pos-sb-base)_45%,var(--pos-divider))]">
        <Search size={14} className="text-[var(--pos-text-2)]" />
        <input
          type="text"
          value={query}
          placeholder="Search…"
          onChange={(e) => setQuery(e.target.value)}
          className="w-36 bg-transparent text-[13px] text-[var(--pos-text-1)] outline-none placeholder:text-[var(--pos-text-2)] sm:w-44"
        />
      </label>
      <DensityToggle dense={dense} onChange={setDense} />
      {embedded ? newButton : null}
    </div>
  );

  const tableCard = (
    <div
      className={`${floatingCard} min-h-0 flex-1 overflow-auto ${
        dense ? "[&_td]:!py-1.5 [&_th]:!py-2" : ""
      }`}
    >
      {loading ? (
        <p className={`${paySubtitle} p-4`}>Loading…</p>
      ) : isPurchases ? (
        <PurchasesTable rows={visibleRows} totals={totals} onSelect={setSelectedId} />
      ) : (
        <FlatExpensesTable
          rows={visibleRows}
          totals={totals}
          onSelect={setSelectedId}
          showCategory={!isPurchases}
        />
      )}
    </div>
  );

  const drawers = (
    <>
      {creating ? (
        <CreateExpenseDrawer
          categories={categories}
          suppliers={suppliers}
          lockedKind={lockedKind}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      ) : null}
      {selectedId ? (
        <ExpenseDetailDrawer
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="shrink-0">{toolbar}</div>
        {error ? <p className="shrink-0 text-[12px] text-red-600">{error}</p> : null}
        {tableCard}
        {drawers}
      </div>
    );
  }

  return (
    <div className={pageWrap}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className={pageH1}>{title}</h1>
        <div className="flex items-center gap-2">
          <PeriodSelect value={period} onChange={setPeriod} />
          {newButton}
        </div>
      </div>
      {!loading ? (
        <div className={`${floatingCard} shrink-0`}>
          <SettlementSummary
            total={totals.total}
            paid={totals.paid}
            due={totals.due}
            openCount={openCount}
          />
        </div>
      ) : null}
      <div className="shrink-0">{toolbar}</div>
      {error ? <p className="shrink-0 text-[12px] text-red-600">{error}</p> : null}
      {tableCard}
      {drawers}
    </div>
  );
}

// ---------------- Purchases table (PDF-shaped, grouped by supplier bill) ----------------

/** Warm, brand-tinted header "shelf" that anchors the columns; sticky on scroll. */
const pHeadRow =
  "border-b border-solid [border-color:color-mix(in_srgb,var(--pos-sb-base)_20%,var(--pos-divider))]";
const pTh =
  "sticky top-0 z-[1] bg-[color-mix(in_srgb,var(--pos-sb-base)_7%,var(--pos-card))] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[color-mix(in_srgb,var(--pos-sb-base)_60%,var(--pos-text-2))]";
const pThNum = `${pTh} text-right`;

const pCellBase = "px-3 py-3 align-middle text-[13px]";
const pCellNum = `${pCellBase} text-right font-mono tabular-nums whitespace-nowrap`;

/** Hairline divider between flat rows (whitespace + a faint rule do the grouping). */
const rowDivider = "border-b border-solid [border-color:var(--pos-border-hairline)]";

/**
 * Item-level purchases view matching the RMS layout:
 * Date | Supplier | Item | Qty | Rate | Amount | Paid | Due | Status.
 * Amount is per item (qty × rate); Paid/Due/Status are per bill and span the
 * bill's item rows since payments settle the whole supplier bill. Bills are
 * grouped by a subtle zebra shade (no inner grid lines) so the table reads as
 * part of the page rather than a boxed spreadsheet.
 */
function PurchasesTable({
  rows,
  totals,
  onSelect,
}: {
  rows: ExpenseSummary[];
  totals: { total: number; paid: number; due: number };
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className={pHeadRow}>
            <th className={pTh}>Date</th>
            <th className={pTh}>Supplier</th>
            <th className={pTh}>Item</th>
            <th className={pThNum}>Qty</th>
            <th className={pThNum}>Rate</th>
            <th className={pThNum}>Amount</th>
            <th className={pThNum}>Paid</th>
            <th className={pThNum}>Due</th>
            <th className={`${pTh} text-center`}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className={`${pCellBase} text-[var(--pos-text-2)]`} colSpan={9}>No purchases match these filters.</td></tr>
          ) : (
            rows.map((bill, billIdx) => {
              const lines =
                bill.items.length > 0
                  ? bill.items
                  : [{ id: bill.id, name: bill.description || "—", qty: 0, unit: "", rate: 0, total: bill.total }];
              const span = lines.length;
              // Zebra by bill group ties an invoice's item rows together without borders.
              const groupBg = billIdx % 2 === 1 ? " bg-[var(--pos-page)]" : "";
              const rowCls = `cursor-pointer transition-colors${groupBg} hover:bg-[color-mix(in_srgb,var(--pos-sb-base)_6%,transparent)]`;
              return lines.map((it, idx) => (
                <tr key={it.id} className={rowCls} onClick={() => onSelect(bill.id)}>
                  {idx === 0 ? (
                    <>
                      <td className={`${pCellNum} text-left text-[12px] text-[var(--pos-text-2)]`} rowSpan={span}>
                        {formatDateKeyAsDisplay(bill.date)}
                      </td>
                      <td className={`${pCellBase} font-semibold text-[var(--pos-text-1)]`} rowSpan={span}>
                        {bill.supplierName ?? "—"}
                        {!bill.editable ? <SourceSub source={bill.source} /> : null}
                      </td>
                    </>
                  ) : null}
                  <td className={`${pCellBase} text-[var(--pos-text-1)]`}>{it.name || "—"}</td>
                  <td className={`${pCellNum} text-[12px] text-[var(--pos-text-2)]`}>
                    {it.qty ? `${it.qty}${it.unit ? ` ${it.unit}` : ""}` : "—"}
                  </td>
                  <td className={`${pCellNum} text-[12px] text-[var(--pos-text-2)]`}>
                    {it.rate ? formatMoney(it.rate) : "—"}
                  </td>
                  <td className={`${pCellNum} font-medium text-[var(--pos-text-1)]`}>{formatMoney(it.total)}</td>
                  {idx === 0 ? (
                    <>
                      <td className={`${pCellNum} text-[var(--pos-text-1)]`} rowSpan={span}>
                        {formatMoney(bill.paid)}
                      </td>
                      <td
                        className={`${pCellNum} ${bill.due > 0 ? "text-red-600 dark:text-red-400" : "text-[var(--pos-text-2)]"}`}
                        rowSpan={span}
                      >
                        {formatMoney(bill.due)}
                      </td>
                      <td className={`${pCellBase} text-center`} rowSpan={span}>
                        <StatusCell status={bill.status} />
                      </td>
                    </>
                  ) : null}
                </tr>
              ));
            })
          )}
        </tbody>
        {rows.length > 0 ? (
          <tfoot>
            <tr className="border-t-2 border-solid [border-color:color-mix(in_srgb,var(--pos-sb-base)_18%,var(--pos-divider))] font-semibold">
              <td className={`${pCellBase} text-[12px] uppercase tracking-[0.04em] text-[var(--pos-text-2)]`} colSpan={5}>
                {rows.length} {rows.length === 1 ? "bill" : "bills"}
              </td>
              <td className={`${pCellNum} text-[var(--pos-text-1)]`}>{formatMoney(totals.total)}</td>
              <td className={`${pCellNum} text-[var(--pos-text-1)]`}>{formatMoney(totals.paid)}</td>
              <td className={`${pCellNum} ${totals.due > 0 ? "text-red-600 dark:text-red-400" : "text-[var(--pos-text-1)]"}`}>
                {formatMoney(totals.due)}
              </td>
              <td className={pCellBase} />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

// ---------------- Flat expenses table (Other Expenses + combined All Expenses) ----------------

/**
 * Clean, borderless list for other expenses / the combined view.
 * Columns: Date | [Category] | Title | Amount | Paid | Due | Status.
 * `showCategory` adds the kind/category column for the combined All Expenses page.
 */
function FlatExpensesTable({
  rows,
  totals,
  onSelect,
  showCategory,
}: {
  rows: ExpenseSummary[];
  totals: { total: number; paid: number; due: number };
  onSelect: (id: string) => void;
  showCategory: boolean;
}) {
  const cols = showCategory ? 7 : 6;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className={pHeadRow}>
            <th className={pTh}>Date</th>
            <th className={pTh}>Title</th>
            {showCategory ? <th className={pTh}>Category</th> : null}
            <th className={pThNum}>Amount</th>
            <th className={pThNum}>Paid</th>
            <th className={pThNum}>Due</th>
            <th className={`${pTh} text-center`}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className={`${pCellBase} text-[var(--pos-text-2)]`} colSpan={cols}>No expenses match these filters.</td></tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.id}
                className={`${rowDivider} cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--pos-sb-base)_6%,transparent)]`}
                onClick={() => onSelect(r.id)}
              >
                <td className={`${pCellNum} text-left text-[12px] text-[var(--pos-text-2)]`}>
                  {formatDateKeyAsDisplay(r.date)}
                </td>
                <td className={`${pCellBase} font-semibold text-[var(--pos-text-1)]`}>
                  {r.description || r.supplierName || EXPENSE_KIND_LABEL[r.kind]}
                  {!r.editable ? <SourceSub source={r.source} /> : null}
                </td>
                {showCategory ? (
                  <td className={pCellBase}>
                    <span className={catChip}>{r.categoryName ?? EXPENSE_KIND_LABEL[r.kind]}</span>
                  </td>
                ) : null}
                <td className={`${pCellNum} font-semibold text-[var(--pos-text-1)]`}>{formatMoney(r.total)}</td>
                <td className={`${pCellNum} text-[var(--pos-text-2)]`}>{formatMoney(r.paid)}</td>
                <td className={`${pCellNum} ${r.due > 0 ? "text-red-600 dark:text-red-400" : "text-[var(--pos-text-2)]"}`}>
                  {r.due > 0 ? formatMoney(r.due) : "—"}
                </td>
                <td className={`${pCellBase} text-center`}>
                  <StatusCell status={r.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 ? (
          <tfoot>
            <tr className="border-t-2 border-solid [border-color:color-mix(in_srgb,var(--pos-sb-base)_18%,var(--pos-divider))] font-semibold">
              <td className={`${pCellBase} text-[12px] uppercase tracking-[0.04em] text-[var(--pos-text-2)]`} colSpan={showCategory ? 3 : 2}>
                {rows.length} {rows.length === 1 ? "entry" : "entries"}
              </td>
              <td className={`${pCellNum} text-[var(--pos-text-1)]`}>{formatMoney(totals.total)}</td>
              <td className={`${pCellNum} text-[var(--pos-text-1)]`}>{formatMoney(totals.paid)}</td>
              <td className={`${pCellNum} ${totals.due > 0 ? "text-red-600 dark:text-red-400" : "text-[var(--pos-text-1)]"}`}>
                {formatMoney(totals.due)}
              </td>
              <td className={pCellBase} />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

// ---------------- Create drawer ----------------

function DrawerShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[130] flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={payHead}>
          <div className={payTitle}>{title}</div>
          <button type="button" className={secondaryBtn} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className={payBody}>{children}</div>
      </div>
    </div>
  );
}

function CreateExpenseDrawer({
  categories,
  suppliers,
  lockedKind,
  onClose,
  onSaved,
}: {
  categories: ExpenseCategory[];
  suppliers: SupplierOption[];
  lockedKind?: ExpenseKind;
  onClose: () => void;
  onSaved: () => void;
}) {
  // "salary" is a UI-only pseudo-kind: it deep-links to the Employee Salaries
  // flow rather than creating an Expense (salary lives in the payroll domain).
  const [kind, setKind] = useState<ExpenseKind | "salary">(
    lockedKind ?? "other_expense",
  );
  const [date, setDate] = useState(todayDateKey());
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // Local copy of categories so a category created inline shows up immediately
  // (parent reloads its own list on save via onSaved).
  const [cats, setCats] = useState<ExpenseCategory[]>(categories);
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  useEffect(() => {
    setCats(categories);
  }, [categories]);

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name || catBusy) return;
    const existing = cats.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setCategoryId(existing.id);
      setAddingCat(false);
      setNewCatName("");
      setCatError(null);
      return;
    }
    setCatBusy(true);
    setCatError(null);
    try {
      const created = await createExpenseCategory(name);
      setCats((prev) => [...prev, created]);
      setCategoryId(created.id);
      setAddingCat(false);
      setNewCatName("");
    } catch (e) {
      setCatError(e instanceof Error ? e.message : "Failed to create category.");
    } finally {
      setCatBusy(false);
    }
  };
  const [supplierId, setSupplierId] = useState("");
  const [manualTotal, setManualTotal] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [paidFull, setPaidFull] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [payTxn, setPayTxn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemsTotal = items.reduce(
    (s, it) => s + (Number.parseFloat(it.qty) || 0) * (Number.parseFloat(it.rate) || 0),
    0,
  );
  const total = items.length > 0 ? itemsTotal : Number.parseFloat(manualTotal) || 0;
  const paidNow = paidFull ? total : Number.parseFloat(paidAmount) || 0;

  const submit = async () => {
    if (busy || kind === "salary") return;
    setError(null);
    if (total <= 0) {
      setError("Total must be greater than zero.");
      return;
    }
    if (paidNow > total) {
      setError("Amount paid cannot exceed the total.");
      return;
    }
    setBusy(true);
    try {
      const body: CreateExpenseInput = {
        kind,
        date,
        description: description.trim() || undefined,
        expenseCategoryId: categoryId || undefined,
        supplierId: supplierId || undefined,
        total,
        note: note.trim() || undefined,
        items:
          items.length > 0
            ? items.map((it) => ({
                name: it.name.trim(),
                qty: Number.parseFloat(it.qty) || 0,
                rate: Number.parseFloat(it.rate) || 0,
                total: (Number.parseFloat(it.qty) || 0) * (Number.parseFloat(it.rate) || 0),
              }))
            : undefined,
        ...(paidNow > 0
          ? {
              paidAmount: paidNow,
              method,
              transactionId: payTxn.trim() || undefined,
            }
          : {}),
      };
      await createExpense(body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create expense.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerShell
      title={
        kind === "item_purchase"
          ? "New item purchase"
          : kind === "salary"
            ? "Add employee salary"
            : "New expense"
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {lockedKind ? null : (
          <div>
            <label className={fieldLabel}>Kind</label>
            <select
              className={selectInput}
              value={kind}
              onChange={(e) => setKind(e.target.value as ExpenseKind | "salary")}
            >
              <option value="item_purchase">Item Purchase</option>
              <option value="other_expense">Other Expense</option>
              <option value="salary">Employee Salary</option>
            </select>
          </div>
        )}
        {kind === "salary" ? (
          <div className="rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-3">
            <p className="text-[13px] leading-snug text-[var(--pos-text-1)]">
              Employee salaries are recorded in the Employee Salaries register,
              where payouts and advances are tracked per staff member.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className={primaryBtn}
                onClick={() => {
                  onClose();
                  dispatchPosSelectLeaf("hr-payroll");
                }}
              >
                Go to Employee Salaries
              </button>
              <button type="button" className={secondaryBtn} onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
        <>
        <div>
          <label className={fieldLabel}>Date</label>
          <input type="date" className={textInput} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className={fieldLabel}>{kind === "item_purchase" ? "Description" : "Title"}</label>
          <input
            className={textInput}
            value={description}
            placeholder={kind === "item_purchase" ? "" : "e.g. Staff Transport"}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className={fieldLabel}>Category</label>
          {addingCat ? (
            <div className="flex items-center gap-1.5">
              <input
                className={textInput + " mt-0 flex-1"}
                value={newCatName}
                autoFocus
                placeholder="New category name"
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addCategory();
                  } else if (e.key === "Escape") {
                    setAddingCat(false);
                    setNewCatName("");
                    setCatError(null);
                  }
                }}
              />
              <button
                type="button"
                className={primaryBtn + " h-9 px-3 text-[13px]"}
                disabled={catBusy || !newCatName.trim()}
                onClick={() => void addCategory()}
              >
                {catBusy ? "…" : "Add"}
              </button>
              <button
                type="button"
                className={secondaryBtn + " h-9 px-3 text-[13px]"}
                onClick={() => {
                  setAddingCat(false);
                  setNewCatName("");
                  setCatError(null);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <select
                className={selectInput + " flex-1"}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">— none —</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                className={secondaryBtn + " h-9 shrink-0 px-2.5 text-[13px]"}
                onClick={() => {
                  setAddingCat(true);
                  setCatError(null);
                }}
              >
                <Plus size={14} /> New
              </button>
            </div>
          )}
          {catError ? <p className="mt-1 text-[12px] text-red-600">{catError}</p> : null}
        </div>
        {kind === "item_purchase" ? (
          <div>
            <label className={fieldLabel}>Supplier</label>
            <select className={selectInput} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— none —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        {kind === "item_purchase" ? (
        <div>
          <div className="flex items-center justify-between">
            <label className={fieldLabel}>Items (optional)</label>
            <button
              type="button"
              className={secondaryBtn + " h-7 px-2 text-[12px]"}
              onClick={() => setItems((p) => [...p, { name: "", qty: "1", rate: "" }])}
            >
              <Plus size={13} /> Add item
            </button>
          </div>
          {items.map((it, i) => (
            <div key={i} className="mt-2 flex items-center gap-1.5">
              <input
                className={textInput + " mt-0 flex-1"}
                placeholder="Item"
                value={it.name}
                onChange={(e) => setItems((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <input
                className={textInput + " mt-0 w-16"}
                placeholder="Qty"
                inputMode="decimal"
                value={it.qty}
                onChange={(e) => setItems((p) => p.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
              />
              <input
                className={textInput + " mt-0 w-20"}
                placeholder="Rate"
                inputMode="decimal"
                value={it.rate}
                onChange={(e) => setItems((p) => p.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))}
              />
              <button type="button" className={dangerBtn} onClick={() => setItems((p) => p.filter((_, j) => j !== i))}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        ) : null}

        <div>
          <label className={fieldLabel}>Total</label>
          {items.length > 0 ? (
            <div className="mt-1 font-mono text-[16px] font-semibold text-[var(--pos-text-1)]">{formatMoney(total)}</div>
          ) : (
            <input
              type="number"
              inputMode="decimal"
              min={0}
              className={textInput}
              value={manualTotal}
              placeholder="0"
              onChange={(e) => setManualTotal(e.target.value)}
            />
          )}
        </div>

        <div className="rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-3">
          <div className="flex items-center gap-2">
            <input
              id="ce-paidfull"
              type="checkbox"
              checked={paidFull}
              onChange={(e) => setPaidFull(e.target.checked)}
            />
            <label htmlFor="ce-paidfull" className="text-[13px] text-[var(--pos-text-1)]">
              Paid in full ({formatMoney(total)})
            </label>
          </div>
          {!paidFull ? (
            <div className="mt-2">
              <label className={fieldLabel}>Amount paid now (optional)</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                className={textInput}
                value={paidAmount}
                placeholder="0"
                onChange={(e) => setPaidAmount(e.target.value)}
              />
            </div>
          ) : null}
          {paidNow > 0 ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className={fieldLabel}>Method</label>
                <select
                  className={selectInput}
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                >
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Txn ID (optional)</label>
                <input className={textInput} value={payTxn} onChange={(e) => setPayTxn(e.target.value)} />
              </div>
            </div>
          ) : null}
          {paidNow > 0 && paidNow < total ? (
            <p className="mt-2 text-[11px] text-[var(--pos-text-2)]">
              Remaining due after this payment: {formatMoney(total - paidNow)}
            </p>
          ) : null}
        </div>

        <div>
          <label className={fieldLabel}>Note (optional)</label>
          <input className={textInput} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
        <div className="mt-1 flex gap-2">
          <button type="button" className={primaryBtn} disabled={busy || total <= 0} onClick={() => void submit()}>
            {busy ? "Saving…" : "Create expense"}
          </button>
          <button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button>
        </div>
        </>
        )}
      </div>
    </DrawerShell>
  );
}

// ---------------- Detail drawer ----------------

function ExpenseDetailDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [exp, setExp] = useState<ExpenseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // add-payment form
  const [payDate, setPayDate] = useState(todayDateKey());
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [payTxn, setPayTxn] = useState("");

  const reload = useCallback(async () => {
    try {
      setExp(await getExpense(id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load expense.");
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addPayment = async () => {
    const amount = Number.parseFloat(payAmount) || 0;
    if (amount <= 0 || busy) return;
    setBusy(true);
    try {
      await createPayment({
        expenseId: id,
        date: payDate,
        amount,
        method: payMethod,
        transactionId: payTxn.trim() || undefined,
      });
      setPayAmount("");
      setPayTxn("");
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add payment.");
    } finally {
      setBusy(false);
    }
  };

  const removePayment = async (paymentId: string) => {
    try {
      await deletePayment(paymentId);
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete payment.");
    }
  };

  const removeExpense = async () => {
    if (!exp) return;
    if (!window.confirm("Delete this expense?")) return;
    try {
      await deleteExpense(id);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete expense.");
    }
  };

  return (
    <DrawerShell title="Expense details" onClose={onClose}>
      {error ? <p className="mb-3 text-[12px] text-red-600">{error}</p> : null}
      {!exp ? (
        <p className={paySubtitle}>Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-[15px] font-semibold text-[var(--pos-text-1)]">
              {exp.description || EXPENSE_KIND_LABEL[exp.kind]}
            </div>
            <div className={paySubtitle}>
              {exp.date} · {EXPENSE_KIND_LABEL[exp.kind]}
              {exp.categoryName ? ` · ${exp.categoryName}` : ""}
              {exp.supplierName ? ` · ${exp.supplierName}` : ""}
            </div>
          </div>

          {!exp.editable ? (
            <div className="rounded-[10px] border border-solid border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-[var(--pos-text-1)]">
              This record is created and kept in sync automatically from{" "}
              <span className="font-semibold">
                {EXPENSE_SOURCE_ORIGIN[exp.source] ?? "another module"}
              </span>
              . It's read-only here — edit or delete it in its source screen.
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-2.5 py-2">
              <div className="text-[10px] uppercase text-[var(--pos-text-2)]">Total</div>
              <div className="font-mono text-[15px] font-semibold text-[var(--pos-text-1)]">{formatMoney(exp.total)}</div>
            </div>
            <div className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-2.5 py-2">
              <div className="text-[10px] uppercase text-[var(--pos-text-2)]">Paid</div>
              <div className="font-mono text-[15px] font-semibold text-emerald-700 dark:text-emerald-400">{formatMoney(exp.paid)}</div>
            </div>
            <div className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-2.5 py-2">
              <div className="text-[10px] uppercase text-[var(--pos-text-2)]">Due</div>
              <div className={`font-mono text-[15px] font-semibold ${exp.due > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{formatMoney(exp.due)}</div>
            </div>
          </div>

          {exp.items.length > 0 ? (
            <div>
              <div className={fieldLabel}>Items</div>
              <div className={sheetTableWrap + " mt-1"}>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={sheetTh}>Item</th>
                      <th className={sheetThNum}>Qty</th>
                      <th className={sheetThNum}>Rate</th>
                      <th className={sheetThNum}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exp.items.map((it) => (
                      <tr key={it.id}>
                        <td className={sheetTd}>{it.name || "—"}</td>
                        <td className={sheetTdNum}>{it.qty}</td>
                        <td className={sheetTdNum}>{formatMoney(it.rate)}</td>
                        <td className={sheetTdNum}>{formatMoney(it.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div>
            <div className={fieldLabel}>Payments</div>
            {exp.payments.length === 0 ? (
              <p className={paySubtitle + " mt-1"}>No payments yet.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1.5">
                {exp.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-2.5 py-1.5">
                    <div className="text-[13px] text-[var(--pos-text-1)]">
                      <span className="font-mono font-semibold">{formatMoney(p.amount)}</span>
                      <span className="text-[var(--pos-text-2)]"> · {p.date} · {PAYMENT_METHOD_LABEL[p.method]}</span>
                      {p.transactionId ? <span className="text-[var(--pos-text-2)]"> · {p.transactionId}</span> : null}
                    </div>
                    {exp.editable ? (
                      <button type="button" className={dangerBtn} onClick={() => void removePayment(p.id)}>
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {exp.due > 0 && exp.editable ? (
            <div className="rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-3">
              <div className={fieldLabel}>Record a payment</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input type="date" className={textInput + " mt-0"} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className={textInput + " mt-0"}
                  placeholder={`Amount (due ${formatMoney(exp.due)})`}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
                <select className={selectInput + " mt-0"} value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <input className={textInput + " mt-0"} placeholder="Txn ID (optional)" value={payTxn} onChange={(e) => setPayTxn(e.target.value)} />
              </div>
              <button type="button" className={primaryBtn + " mt-2"} disabled={busy || !(Number.parseFloat(payAmount) > 0)} onClick={() => void addPayment()}>
                <Plus size={14} /> Add payment
              </button>
            </div>
          ) : null}

          {exp.editable ? (
            <div className="mt-1 border-t border-solid [border-color:var(--pos-divider)] pt-3">
              <button type="button" className={dangerBtn} onClick={() => void removeExpense()}>
                <Trash2 size={13} /> Delete expense
              </button>
            </div>
          ) : null}
        </div>
      )}
    </DrawerShell>
  );
}
