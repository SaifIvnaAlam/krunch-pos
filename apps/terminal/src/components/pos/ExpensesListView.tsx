import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, Plus, Search, Trash2, X } from "lucide-react";
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
  expenseStatusPill,
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
import { SearchableSelect } from "./SearchableSelect";
import {
  brandBtn,
  dangerBtn,
  fieldLabel,
  expenseStatLabel,
  expenseStatStrip,
  expenseStatTile,
  expenseStatValue,
  floatingCard,
  formatMoney,
  pageH1,
  pageWrap,
  payShell,
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

/** Neutral category tag — one restrained style, no rainbow. */
const catChip =
  "inline-flex items-center rounded-full border border-solid [border-color:var(--pos-divider)] bg-[color-mix(in_srgb,var(--pos-sb-base)_4%,var(--pos-page))] px-2.5 py-0.5 text-[11px] font-medium text-[var(--pos-text-2)]";

/** Soft tinted status pill — scannable without competing with money columns. */
function StatusCell({ status }: { status: ExpenseStatus }) {
  const dot =
    status === "paid"
      ? "bg-emerald-600"
      : status === "partially_paid"
        ? "bg-amber-500"
        : "bg-rose-500";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-solid px-2.5 py-0.5 text-[11px] font-semibold ${expenseStatusPill(status)}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {EXPENSE_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Still-due metric tile — same chrome as the kind breakdown cards.
 * Reused by the Other Expenses and All Expenses pages.
 */
export function SettlementSummary({
  due,
  openCount,
}: {
  /** Kept for call-site compatibility; no longer shown. */
  total?: number;
  paid?: number;
  due: number;
  openCount?: number;
  /** @deprecated Kind tiles are siblings in the parent grid now. */
  extra?: React.ReactNode;
}) {
  return (
    <div className={expenseStatTile}>
      <div className={expenseStatLabel}>Still due</div>
      <div
        className={`${expenseStatValue} ${
          due > 0 ? "text-rose-600 dark:text-rose-400" : ""
        }`}
      >
        {formatMoney(due)}
      </div>
      {openCount !== undefined ? (
        <div className="mt-0.5 text-[11px] text-[var(--pos-text-2)]">
          {openCount} open {openCount === 1 ? "bill" : "bills"}
        </div>
      ) : null}
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
        className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-[var(--pos-text-2)]"
      />
      <SearchableSelect
        value={value}
        onChange={(v) => onChange(v as Period)}
        options={PERIOD_OPTIONS}
        aria-label="Period"
        className="h-9 min-w-[10.5rem] rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] pl-8 pr-2 text-[13px] font-medium text-[var(--pos-text-1)] outline-none transition-[border-color,box-shadow] focus:border-[color-mix(in_srgb,var(--pos-sb-base)_45%,var(--pos-divider))] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--pos-sb-base)_14%,transparent)]"
      />
    </div>
  );
}

type FilterOpt = { value: string; label: string };

/** Empty set = no filter (show all). Non-empty = match any selected value. */
function matchesFilter(selected: Set<string>, value: string): boolean {
  return selected.size === 0 || selected.has(value);
}

function toggleFilterValue(selected: Set<string>, value: string): Set<string> {
  const next = new Set(selected);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function uniqueFilterOpts(entries: FilterOpt[]): FilterOpt[] {
  const seen = new Set<string>();
  const out: FilterOpt[] = [];
  for (const e of entries) {
    if (!e.value || seen.has(e.value)) continue;
    seen.add(e.value);
    out.push(e);
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

function moneyFilterOpt(n: number): FilterOpt {
  const value = String(Math.ceil(Math.abs(n)));
  return { value, label: formatMoney(n) };
}

function rowTitle(r: ExpenseSummary): string {
  return r.description || r.supplierName || EXPENSE_KIND_LABEL[r.kind];
}

function rowCategory(r: ExpenseSummary): string {
  return r.categoryName ?? EXPENSE_KIND_LABEL[r.kind];
}

/** Column-header multi-select filter (checkbox dropdown). */
function ColumnMultiFilter({
  label,
  options,
  selected,
  onChange,
  align = "left",
}: {
  label: string;
  options: FilterOpt[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  align?: "left" | "right" | "center";
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; right?: number } | null>(null);
  const active = selected.size > 0;

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    if (align === "right") {
      setPos({ top: r.bottom + 4, left: 0, right: window.innerWidth - r.right });
    } else if (align === "center") {
      setPos({ top: r.bottom + 4, left: Math.max(8, r.left + r.width / 2 - 88) });
    } else {
      setPos({ top: r.bottom + 4, left: Math.max(8, r.left) });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        className={`inline-flex max-w-full items-center gap-1 transition-colors hover:text-[var(--pos-text-1)] ${
          active ? "text-[var(--pos-sb-base)]" : ""
        }`}
      >
        <span className="truncate">{label}</span>
        {active ? (
          <span className="text-[10px] font-bold">({selected.size})</span>
        ) : null}
        <ChevronDown size={12} className={`shrink-0 opacity-70 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos ? (
        <div
          ref={menuRef}
          className="fixed z-[140] flex max-h-72 min-w-[12rem] max-w-[17rem] flex-col overflow-hidden rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-[0_8px_28px_rgba(0,0,0,0.14)]"
          style={{
            top: pos.top,
            left: pos.right !== undefined ? undefined : pos.left,
            right: pos.right,
          }}
        >
          <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] p-2">
            <label className="flex h-8 items-center gap-1.5 rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-2 focus-within:border-[color-mix(in_srgb,var(--pos-sb-base)_45%,var(--pos-divider))]">
              <Search size={13} className="shrink-0 text-[var(--pos-text-2)]" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                placeholder={`Search ${label.toLowerCase()}…`}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                }}
                className="w-full min-w-0 bg-transparent text-[12px] font-normal normal-case tracking-normal text-[var(--pos-text-1)] outline-none placeholder:text-[var(--pos-text-2)]"
              />
            </label>
          </div>
          <button
            type="button"
            className="block w-full shrink-0 px-3 py-1.5 text-left text-[11px] font-semibold normal-case tracking-normal text-[var(--pos-text-2)] hover:bg-[var(--pos-page)] hover:text-[var(--pos-text-1)]"
            onClick={() => onChange(new Set())}
          >
            Clear filter
          </button>
          <div className="min-h-0 flex-1 overflow-auto border-t border-solid [border-color:var(--pos-divider)] py-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-[12px] font-normal normal-case tracking-normal text-[var(--pos-text-2)]">
                No values
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-[12px] font-normal normal-case tracking-normal text-[var(--pos-text-2)]">
                No matches
              </div>
            ) : (
              filteredOptions.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[12px] font-normal normal-case tracking-normal text-[var(--pos-text-1)] hover:bg-[var(--pos-page)]"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(o.value)}
                    onChange={() => onChange(toggleFilterValue(selected, o.value))}
                    className="accent-[var(--pos-sb-base)]"
                  />
                  <span className="min-w-0 truncate">{o.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

type FlatColFilters = {
  dates: Set<string>;
  titles: Set<string>;
  categories: Set<string>;
  amounts: Set<string>;
  paids: Set<string>;
  dues: Set<string>;
  statuses: Set<string>;
};

const emptyFlatFilters = (): FlatColFilters => ({
  dates: new Set(),
  titles: new Set(),
  categories: new Set(),
  amounts: new Set(),
  paids: new Set(),
  dues: new Set(),
  statuses: new Set(),
});

type PurchaseColFilters = {
  dates: Set<string>;
  suppliers: Set<string>;
  items: Set<string>;
  amounts: Set<string>;
  paids: Set<string>;
  dues: Set<string>;
  statuses: Set<string>;
};

const emptyPurchaseFilters = (): PurchaseColFilters => ({
  dates: new Set(),
  suppliers: new Set(),
  items: new Set(),
  amounts: new Set(),
  paids: new Set(),
  dues: new Set(),
  statuses: new Set(),
});

function flatFiltersActive(f: FlatColFilters): boolean {
  return Object.values(f).some((s) => s.size > 0);
}

function purchaseFiltersActive(f: PurchaseColFilters): boolean {
  return Object.values(f).some((s) => s.size > 0);
}

export function ExpensesListView({
  lockedKind,
  embedded = false,
  reportShell = false,
  onDataChanged,
  headerAccessory,
}: {
  lockedKind?: ExpenseKind;
  embedded?: boolean;
  /** Match Expense Reports chrome (toolbar + table) while keeping payables features. */
  reportShell?: boolean;
  onDataChanged?: () => void;
  /** Optional control in the report-shell header (e.g. Purchases / Suppliers tabs). */
  headerAccessory?: React.ReactNode;
} = {}) {
  const [rows, setRows] = useState<ExpenseSummary[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isPurchases = lockedKind === "item_purchase";
  const isOther = lockedKind === "other_expense";
  const title = isPurchases ? "Item Purchases" : isOther ? "Other Expenses" : "All Expenses";
  const newLabel = isPurchases ? "New purchase" : isOther ? "New expense" : "Add entry";
  const [period, setPeriod] = useState<Period>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [flatFilters, setFlatFilters] = useState<FlatColFilters>(emptyFlatFilters);
  const [purchaseFilters, setPurchaseFilters] = useState<PurchaseColFilters>(emptyPurchaseFilters);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = reportShell ? { from: dateFrom || undefined, to: dateTo || undefined } : periodRange(period);
      const list = await listExpenses({
        kind: lockedKind,
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
  }, [lockedKind, period, reportShell, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listExpenseCategories().then((c) => setCategories(c.filter((x) => x.active))).catch(() => {});
    void listSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  const flatFilterOpts = useMemo(() => {
    return {
      dates: uniqueFilterOpts(rows.map((r) => ({ value: r.date, label: formatDateKeyAsDisplay(r.date) }))),
      titles: uniqueFilterOpts(rows.map((r) => ({ value: rowTitle(r), label: rowTitle(r) }))),
      categories: uniqueFilterOpts([
        ...rows.map((r) => ({ value: rowCategory(r), label: rowCategory(r) })),
        ...rows.map((r) => ({
          value: EXPENSE_KIND_LABEL[r.kind],
          label: EXPENSE_KIND_LABEL[r.kind],
        })),
      ]),
      amounts: uniqueFilterOpts(rows.map((r) => moneyFilterOpt(r.total))),
      paids: uniqueFilterOpts(rows.map((r) => moneyFilterOpt(r.paid))),
      dues: uniqueFilterOpts(
        rows.map((r) => (r.due > 0 ? moneyFilterOpt(r.due) : { value: "0", label: "—" })),
      ),
      statuses: uniqueFilterOpts(
        rows.map((r) => ({ value: r.status, label: EXPENSE_STATUS_LABEL[r.status] })),
      ),
    };
  }, [rows]);

  const purchaseFilterOpts = useMemo(() => {
    const itemOpts: FilterOpt[] = [];
    for (const bill of rows) {
      const lines =
        bill.items.length > 0
          ? bill.items
          : [{ name: bill.description || "—", total: bill.total }];
      for (const it of lines) {
        itemOpts.push({ value: it.name || "—", label: it.name || "—" });
      }
    }
    return {
      dates: uniqueFilterOpts(rows.map((r) => ({ value: r.date, label: formatDateKeyAsDisplay(r.date) }))),
      suppliers: uniqueFilterOpts(
        rows.map((r) => ({ value: r.supplierName ?? "—", label: r.supplierName ?? "—" })),
      ),
      items: uniqueFilterOpts(itemOpts),
      amounts: uniqueFilterOpts(
        rows.flatMap((bill) => {
          const lines =
            bill.items.length > 0
              ? bill.items
              : [{ total: bill.total }];
          return lines.map((it) => moneyFilterOpt(it.total));
        }),
      ),
      paids: uniqueFilterOpts(rows.map((r) => moneyFilterOpt(r.paid))),
      dues: uniqueFilterOpts(rows.map((r) => moneyFilterOpt(r.due))),
      statuses: uniqueFilterOpts(
        rows.map((r) => ({ value: r.status, label: EXPENSE_STATUS_LABEL[r.status] })),
      ),
    };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (isPurchases) {
        const f = purchaseFilters;
        if (!matchesFilter(f.dates, r.date)) return false;
        if (!matchesFilter(f.suppliers, r.supplierName ?? "—")) return false;
        if (!matchesFilter(f.statuses, r.status)) return false;
        if (!matchesFilter(f.paids, String(Math.ceil(Math.abs(r.paid))))) return false;
        if (!matchesFilter(f.dues, String(Math.ceil(Math.abs(r.due))))) return false;
        if (f.items.size > 0 || f.amounts.size > 0) {
          const lines =
            r.items.length > 0
              ? r.items
              : [{ name: r.description || "—", total: r.total }];
          const anyLine = lines.some(
            (it) =>
              matchesFilter(f.items, it.name || "—") &&
              matchesFilter(f.amounts, String(Math.ceil(Math.abs(it.total)))),
          );
          if (!anyLine) return false;
        }
      } else {
        const f = flatFilters;
        if (!matchesFilter(f.dates, r.date)) return false;
        if (!matchesFilter(f.titles, rowTitle(r))) return false;
        if (
          f.categories.size > 0 &&
          !f.categories.has(rowCategory(r)) &&
          !f.categories.has(EXPENSE_KIND_LABEL[r.kind])
        ) {
          return false;
        }
        if (!matchesFilter(f.amounts, String(Math.ceil(Math.abs(r.total))))) return false;
        if (!matchesFilter(f.paids, String(Math.ceil(Math.abs(r.paid))))) return false;
        if (!matchesFilter(f.dues, r.due > 0 ? String(Math.ceil(Math.abs(r.due))) : "0")) return false;
        if (!matchesFilter(f.statuses, r.status)) return false;
      }
      if (!q) return true;
      return (
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.supplierName ?? "").toLowerCase().includes(q) ||
        (r.categoryName ?? "").toLowerCase().includes(q) ||
        r.items.some((it) => (it.name ?? "").toLowerCase().includes(q))
      );
    });
  }, [rows, query, isPurchases, flatFilters, purchaseFilters]);

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

  const filtersActive = isPurchases
    ? purchaseFiltersActive(purchaseFilters)
    : flatFiltersActive(flatFilters);

  const hasReportFilters =
    query.trim() !== "" || dateFrom !== "" || dateTo !== "" || filtersActive;

  const clearAllFilters = () => {
    setQuery("");
    setDateFrom("");
    setDateTo("");
    if (isPurchases) setPurchaseFilters(emptyPurchaseFilters());
    else setFlatFilters(emptyFlatFilters());
  };

  // Staff payout rows have no Expense detail — deep-link to Employee Salaries.
  const selectRow = useCallback(
    (id: string) => {
      const row = rows.find((r) => r.id === id);
      if (row?.kind === "salary") {
        dispatchPosSelectLeaf("hr-payroll");
        return;
      }
      setSelectedId(id);
    },
    [rows],
  );

  const fieldClass =
    "mt-1 h-9 w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)] focus:outline-none";
  const labelClass = "text-[11px] text-[var(--pos-text-2)]";

  const toolbar = reportShell ? (
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, supplier, category…"
            className="h-9 w-full cursor-text rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] pl-9 pr-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)] focus:outline-none"
            aria-label="Search expenses"
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
        {hasReportFilters ? (
          <button
            type="button"
            onClick={clearAllFilters}
            className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-card)] px-3 text-[12px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-nav-hover)]/40"
          >
            Clear
          </button>
        ) : null}
        {newButton}
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2.5">
      {filtersActive || query ? (
        <button
          type="button"
          className="text-[12px] font-medium text-[var(--pos-text-2)] underline-offset-2 hover:text-[var(--pos-text-1)] hover:underline"
          onClick={clearAllFilters}
        >
          Clear filters
        </button>
      ) : null}
      <label className="ml-auto inline-flex h-9 min-w-[11rem] flex-1 items-center gap-2 rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 transition-[border-color,box-shadow] focus-within:border-[color-mix(in_srgb,var(--pos-sb-base)_45%,var(--pos-divider))] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--pos-sb-base)_14%,transparent)] sm:max-w-[17rem] sm:flex-none">
        <Search size={14} className="shrink-0 text-[var(--pos-text-2)]" />
        <input
          type="text"
          value={query}
          placeholder="Search…"
          onChange={(e) => setQuery(e.target.value)}
          className="w-full min-w-0 bg-transparent text-[13px] text-[var(--pos-text-1)] outline-none placeholder:text-[var(--pos-text-2)]"
        />
      </label>
      {embedded ? newButton : null}
    </div>
  );

  const notifyChanged = () => {
    void load();
    onDataChanged?.();
  };

  const tableCard = (
    <div
      className={
        reportShell
          ? "min-h-0 flex-1 overflow-auto"
          : `${floatingCard} min-h-0 flex-1 overflow-auto`
      }
    >
      {loading ? (
        <div className="px-4 py-10 text-center text-[13px] text-[var(--pos-text-2)]">
          Loading expenses…
        </div>
      ) : isPurchases ? (
        <PurchasesTable
          rows={visibleRows}
          totals={totals}
          onSelect={selectRow}
          filters={purchaseFilters}
          options={purchaseFilterOpts}
          onFiltersChange={setPurchaseFilters}
          reportChrome={reportShell}
        />
      ) : (
        <FlatExpensesTable
          rows={visibleRows}
          totals={totals}
          onSelect={selectRow}
          showCategory={!isPurchases}
          filters={flatFilters}
          options={flatFilterOpts}
          onFiltersChange={setFlatFilters}
          reportChrome={reportShell}
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
            notifyChanged();
          }}
        />
      ) : null}
      {selectedId ? (
        <ExpenseDetailDrawer
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={notifyChanged}
        />
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <div className={`flex min-h-0 flex-1 flex-col ${reportShell ? "" : "gap-4"}`}>
        <div className="shrink-0">{toolbar}</div>
        {error ? (
          <p className={`shrink-0 text-[12px] text-red-600 ${reportShell ? "px-4 py-2" : ""}`}>
            {error}
          </p>
        ) : null}
        {tableCard}
        {drawers}
      </div>
    );
  }

  if (reportShell) {
    return (
      <div className={payShell}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <h1 className="min-w-0 text-[16px] font-semibold text-[var(--pos-text-1)]">{title}</h1>
          {headerAccessory ? <div className="shrink-0">{headerAccessory}</div> : null}
        </div>
        {!loading ? (
          <div className="flex shrink-0 flex-wrap gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2.5">
            <SettlementSummary
              total={totals.total}
              paid={totals.paid}
              due={totals.due}
              openCount={openCount}
            />
          </div>
        ) : null}
        <div className="shrink-0">{toolbar}</div>
        {error ? (
          <p className="shrink-0 px-4 py-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        {tableCard}
        {drawers}
      </div>
    );
  }

  return (
    <div className={pageWrap}>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className={pageH1}>{title}</h1>
          <p className="mt-1 text-[13px] text-[var(--pos-text-2)]">
            {isPurchases
              ? "Supplier bills and stock purchases"
              : isOther
                ? "Operating costs outside item purchases"
                : "Purchases, other, and salary payables"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelect value={period} onChange={setPeriod} />
          {newButton}
        </div>
      </div>
      {!loading ? (
        <div className={`${expenseStatStrip} shrink-0`}>
          <SettlementSummary
            total={totals.total}
            paid={totals.paid}
            due={totals.due}
            openCount={openCount}
          />
        </div>
      ) : null}
      <div className="shrink-0">{toolbar}</div>
      {error ? <p className="shrink-0 text-[12px] text-red-600 dark:text-red-400">{error}</p> : null}
      {tableCard}
      {drawers}
    </div>
  );
}

// ---------------- Purchases table (PDF-shaped, grouped by supplier bill) ----------------

/** Warm, brand-tinted header "shelf" that anchors the columns; sticky on scroll. */
const pHeadRow =
  "border-b border-solid [border-color:color-mix(in_srgb,var(--pos-sb-base)_14%,var(--pos-divider))]";
const pTh =
  "sticky top-0 z-[1] bg-[color-mix(in_srgb,var(--pos-sb-base)_6%,var(--pos-page))] px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[color-mix(in_srgb,var(--pos-sb-base)_40%,var(--pos-text-2))]";
const pThNum = `${pTh} text-right`;

const pCellBase = "px-4 py-1.5 align-middle text-[13px]";
const pCellNum = `${pCellBase} text-right font-mono tabular-nums whitespace-nowrap`;

/** Hairline divider between flat rows (whitespace + a faint rule do the grouping). */
const rowDivider =
  "border-b border-solid [border-color:color-mix(in_srgb,var(--pos-sb-base)_6%,var(--pos-border-hairline))]";

/** Expense Reports–matched table chrome (kept alongside column multi-filters). */
const rHeadRow = "border-b border-solid [border-color:var(--pos-divider)]";
const rTh =
  "sticky top-0 z-[1] bg-[var(--pos-card)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--pos-text-2)]";
const rThNum = `${rTh} text-right`;
const rThCenter = `${rTh} text-center`;
const rCell = "px-3 py-1.5 align-middle text-[12px]";
const rCellNum = `${rCell} text-right tabular-nums whitespace-nowrap`;
const rRow =
  "border-b border-solid [border-color:var(--pos-divider)] cursor-pointer transition-colors hover:bg-[var(--pos-nav-hover)]/25";
const rFoot =
  "sticky bottom-0 z-10 border-t border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]/95 backdrop-blur-sm font-semibold";

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
  filters,
  options,
  onFiltersChange,
  reportChrome = false,
}: {
  rows: ExpenseSummary[];
  totals: { total: number; paid: number; due: number };
  onSelect: (id: string) => void;
  filters: PurchaseColFilters;
  options: {
    dates: FilterOpt[];
    suppliers: FilterOpt[];
    items: FilterOpt[];
    amounts: FilterOpt[];
    paids: FilterOpt[];
    dues: FilterOpt[];
    statuses: FilterOpt[];
  };
  onFiltersChange: (next: PurchaseColFilters) => void;
  reportChrome?: boolean;
}) {
  const patch = (partial: Partial<PurchaseColFilters>) =>
    onFiltersChange({ ...filters, ...partial });
  const headRow = reportChrome ? rHeadRow : pHeadRow;
  const th = reportChrome ? rTh : pTh;
  const thNum = reportChrome ? rThNum : pThNum;
  const thCenter = reportChrome ? rThCenter : `${pTh} text-center`;
  const cell = reportChrome ? rCell : pCellBase;
  const cellNum = reportChrome ? rCellNum : pCellNum;

  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse ${reportChrome ? "min-w-[960px]" : ""}`}>
        <thead>
          <tr className={headRow}>
            <th className={th}>
              <ColumnMultiFilter
                label="Date"
                options={options.dates}
                selected={filters.dates}
                onChange={(dates) => patch({ dates })}
              />
            </th>
            <th className={th}>
              <ColumnMultiFilter
                label="Supplier"
                options={options.suppliers}
                selected={filters.suppliers}
                onChange={(suppliers) => patch({ suppliers })}
              />
            </th>
            <th className={th}>
              <ColumnMultiFilter
                label="Item"
                options={options.items}
                selected={filters.items}
                onChange={(items) => patch({ items })}
              />
            </th>
            <th className={thNum}>Qty</th>
            <th className={thNum}>Rate</th>
            <th className={thNum}>
              <ColumnMultiFilter
                label="Amount"
                options={options.amounts}
                selected={filters.amounts}
                onChange={(amounts) => patch({ amounts })}
                align="right"
              />
            </th>
            <th className={thNum}>
              <ColumnMultiFilter
                label="Paid"
                options={options.paids}
                selected={filters.paids}
                onChange={(paids) => patch({ paids })}
                align="right"
              />
            </th>
            <th className={thNum}>
              <ColumnMultiFilter
                label="Due"
                options={options.dues}
                selected={filters.dues}
                onChange={(dues) => patch({ dues })}
                align="right"
              />
            </th>
            <th className={thCenter}>
              <ColumnMultiFilter
                label="Status"
                options={options.statuses}
                selected={filters.statuses}
                onChange={(statuses) => patch({ statuses })}
                align="center"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={`${cell} py-10 text-center text-[13px] text-[var(--pos-text-2)]`} colSpan={9}>
                No purchases match these filters.
              </td>
            </tr>
          ) : (
            rows.map((bill, billIdx) => {
              const allLines =
                bill.items.length > 0
                  ? bill.items
                  : [{ id: bill.id, name: bill.description || "—", qty: 0, unit: "", rate: 0, total: bill.total }];
              const lines = allLines.filter(
                (it) =>
                  matchesFilter(filters.items, it.name || "—") &&
                  matchesFilter(filters.amounts, String(Math.ceil(Math.abs(it.total)))),
              );
              if (lines.length === 0) return null;
              const span = lines.length;
              const groupBg = !reportChrome && billIdx % 2 === 1 ? " bg-[var(--pos-page)]" : "";
              const rowCls = reportChrome
                ? rRow
                : `cursor-pointer transition-colors duration-150${groupBg} hover:bg-[color-mix(in_srgb,var(--pos-sb-base)_5%,transparent)]`;
              return lines.map((it, idx) => (
                <tr key={it.id} className={rowCls} onClick={() => onSelect(bill.id)}>
                  {idx === 0 ? (
                    <>
                      <td className={`${cellNum} text-left text-[var(--pos-text-2)]`} rowSpan={span}>
                        {formatDateKeyAsDisplay(bill.date)}
                      </td>
                      <td className={`${cell} font-semibold text-[var(--pos-text-1)]`} rowSpan={span}>
                        {bill.supplierName ?? "—"}
                      </td>
                    </>
                  ) : null}
                  <td className={`${cell} text-[var(--pos-text-1)]`}>{it.name || "—"}</td>
                  <td className={`${cellNum} text-[var(--pos-text-2)]`}>
                    {it.qty ? `${it.qty}${it.unit ? ` ${it.unit}` : ""}` : "—"}
                  </td>
                  <td className={`${cellNum} text-[var(--pos-text-2)]`}>
                    {it.rate ? formatMoney(it.rate) : "—"}
                  </td>
                  <td className={`${cellNum} font-medium text-[var(--pos-text-1)]`}>{formatMoney(it.total)}</td>
                  {idx === 0 ? (
                    <>
                      <td className={`${cellNum} text-[var(--pos-text-1)]`} rowSpan={span}>
                        {formatMoney(bill.paid)}
                      </td>
                      <td
                        className={`${cellNum} ${bill.due > 0 ? "font-semibold text-rose-600 dark:text-rose-400" : "text-[var(--pos-text-2)]"}`}
                        rowSpan={span}
                      >
                        {formatMoney(bill.due)}
                      </td>
                      <td className={`${cell} text-center`} rowSpan={span}>
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
            <tr
              className={
                reportChrome
                  ? rFoot
                  : "border-t border-solid [border-color:color-mix(in_srgb,var(--pos-sb-base)_14%,var(--pos-divider))] bg-[color-mix(in_srgb,var(--pos-sb-base)_5%,var(--pos-page))] font-semibold"
              }
            >
              <td className={`${cell} text-[11px] text-[var(--pos-text-2)]`} colSpan={5}>
                {rows.length} {rows.length === 1 ? "bill" : "bills"}
              </td>
              <td className={`${cellNum} text-[var(--pos-text-1)]`}>{formatMoney(totals.total)}</td>
              <td className={`${cellNum} text-[var(--pos-text-1)]`}>{formatMoney(totals.paid)}</td>
              <td className={`${cellNum} ${totals.due > 0 ? "text-rose-600 dark:text-rose-400" : "text-[var(--pos-text-1)]"}`}>
                {formatMoney(totals.due)}
              </td>
              <td className={cell} />
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
  filters,
  options,
  onFiltersChange,
  reportChrome = false,
}: {
  rows: ExpenseSummary[];
  totals: { total: number; paid: number; due: number };
  onSelect: (id: string) => void;
  showCategory: boolean;
  filters: FlatColFilters;
  options: {
    dates: FilterOpt[];
    titles: FilterOpt[];
    categories: FilterOpt[];
    amounts: FilterOpt[];
    paids: FilterOpt[];
    dues: FilterOpt[];
    statuses: FilterOpt[];
  };
  onFiltersChange: (next: FlatColFilters) => void;
  reportChrome?: boolean;
}) {
  const cols = showCategory ? 7 : 6;
  const patch = (partial: Partial<FlatColFilters>) =>
    onFiltersChange({ ...filters, ...partial });
  const headRow = reportChrome ? rHeadRow : pHeadRow;
  const th = reportChrome ? rTh : pTh;
  const thNum = reportChrome ? rThNum : pThNum;
  const thCenter = reportChrome ? rThCenter : `${pTh} text-center`;
  const cell = reportChrome ? rCell : pCellBase;
  const cellNum = reportChrome ? rCellNum : pCellNum;
  const rowCls = reportChrome
    ? rRow
    : `${rowDivider} cursor-pointer transition-colors duration-150 last:border-b-0 hover:bg-[color-mix(in_srgb,var(--pos-sb-base)_5%,transparent)]`;

  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse ${reportChrome ? "min-w-[860px]" : ""}`}>
        <thead>
          <tr className={headRow}>
            <th className={th}>
              <ColumnMultiFilter
                label="Date"
                options={options.dates}
                selected={filters.dates}
                onChange={(dates) => patch({ dates })}
              />
            </th>
            <th className={th}>
              <ColumnMultiFilter
                label="Title"
                options={options.titles}
                selected={filters.titles}
                onChange={(titles) => patch({ titles })}
              />
            </th>
            {showCategory ? (
              <th className={th}>
                <ColumnMultiFilter
                  label="Category"
                  options={options.categories}
                  selected={filters.categories}
                  onChange={(categories) => patch({ categories })}
                />
              </th>
            ) : null}
            <th className={thNum}>
              <ColumnMultiFilter
                label="Amount"
                options={options.amounts}
                selected={filters.amounts}
                onChange={(amounts) => patch({ amounts })}
                align="right"
              />
            </th>
            <th className={thNum}>
              <ColumnMultiFilter
                label="Paid"
                options={options.paids}
                selected={filters.paids}
                onChange={(paids) => patch({ paids })}
                align="right"
              />
            </th>
            <th className={thNum}>
              <ColumnMultiFilter
                label="Due"
                options={options.dues}
                selected={filters.dues}
                onChange={(dues) => patch({ dues })}
                align="right"
              />
            </th>
            <th className={thCenter}>
              <ColumnMultiFilter
                label="Status"
                options={options.statuses}
                selected={filters.statuses}
                onChange={(statuses) => patch({ statuses })}
                align="center"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={`${cell} py-10 text-center text-[13px] text-[var(--pos-text-2)]`} colSpan={cols}>
                No expenses match these filters.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className={rowCls} onClick={() => onSelect(r.id)}>
                <td className={`${cellNum} text-left text-[var(--pos-text-2)]`}>
                  {formatDateKeyAsDisplay(r.date)}
                </td>
                <td className={`${cell} font-semibold text-[var(--pos-text-1)]`}>
                  {r.description || r.supplierName || EXPENSE_KIND_LABEL[r.kind]}
                </td>
                {showCategory ? (
                  <td className={cell}>
                    <span className={catChip}>{r.categoryName ?? EXPENSE_KIND_LABEL[r.kind]}</span>
                  </td>
                ) : null}
                <td className={`${cellNum} font-semibold text-[var(--pos-text-1)]`}>{formatMoney(r.total)}</td>
                <td className={`${cellNum} text-[var(--pos-text-2)]`}>{formatMoney(r.paid)}</td>
                <td className={`${cellNum} ${r.due > 0 ? "font-semibold text-rose-600 dark:text-rose-400" : "text-[var(--pos-text-2)]"}`}>
                  {r.due > 0 ? formatMoney(r.due) : "—"}
                </td>
                <td className={`${cell} text-center`}>
                  <StatusCell status={r.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 ? (
          <tfoot>
            <tr
              className={
                reportChrome
                  ? rFoot
                  : "border-t border-solid [border-color:color-mix(in_srgb,var(--pos-sb-base)_14%,var(--pos-divider))] bg-[color-mix(in_srgb,var(--pos-sb-base)_5%,var(--pos-page))] font-semibold"
              }
            >
              <td className={`${cell} text-[11px] text-[var(--pos-text-2)]`} colSpan={showCategory ? 3 : 2}>
                {rows.length} {rows.length === 1 ? "entry" : "entries"}
              </td>
              <td className={`${cellNum} text-[var(--pos-text-1)]`}>{formatMoney(totals.total)}</td>
              <td className={`${cellNum} text-[var(--pos-text-1)]`}>{formatMoney(totals.paid)}</td>
              <td className={`${cellNum} ${totals.due > 0 ? "text-rose-600 dark:text-rose-400" : "text-[var(--pos-text-1)]"}`}>
                {formatMoney(totals.due)}
              </td>
              <td className={cell} />
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
    <div className="fixed inset-0 z-[130] flex justify-end bg-black/45 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-[-8px_0_32px_rgba(0,0,0,0.12)]"
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
            <SearchableSelect
              className={selectInput}
              value={kind}
              onChange={(v) => setKind(v as ExpenseKind | "salary")}
              options={[
                { value: "item_purchase", label: "Item Purchase" },
                { value: "other_expense", label: "Other Expense" },
                { value: "salary", label: "Employee Salary" },
              ]}
              aria-label="Kind"
            />
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
              <SearchableSelect
                className={selectInput + " flex-1"}
                value={categoryId}
                onChange={setCategoryId}
                placeholder="— none —"
                options={[
                  { value: "", label: "— none —" },
                  ...cats.map((c) => ({ value: c.id, label: c.name })),
                ]}
                aria-label="Category"
              />
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
            <SearchableSelect
              className={selectInput}
              value={supplierId}
              onChange={setSupplierId}
              placeholder="— none —"
              options={[
                { value: "", label: "— none —" },
                ...suppliers.map((s) => ({ value: s.id, label: s.name })),
              ]}
              aria-label="Supplier"
            />
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
                <SearchableSelect
                  className={selectInput}
                  value={method}
                  onChange={(v) => setMethod(v as PaymentMethod)}
                  options={PAYMENT_METHOD_OPTIONS}
                  aria-label="Method"
                />
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
                <SearchableSelect
                  className={selectInput + " mt-0"}
                  value={payMethod}
                  onChange={(v) => setPayMethod(v as PaymentMethod)}
                  options={PAYMENT_METHOD_OPTIONS}
                  aria-label="Payment method"
                />
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
