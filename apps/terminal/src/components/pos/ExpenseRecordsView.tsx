import { useMemo, useState, type ReactNode } from "react";
import { Plus, Search, X } from "lucide-react";

/** One row = a fully paid other expense (amount = what left the business). */
type ExpenseRow = {
  id: string;
  reason: string;
  date: string;
  vendor: string;
  category: string;
  method: string;
  /** Amount paid in full (no partial / due tracking here). */
  billTotal: number;
  notes?: string;
};

/** Single source of truth for form + defaults — edit one list, both create & edit follow. */
const CATEGORY_OPTIONS = [
  "Inventory",
  "Utilities",
  "Packaging",
  "Maintenance",
  "Transport",
  "Marketing",
] as const;

const PAYMENT_METHOD_OPTIONS = [
  "Card",
  "Cash",
  "Bank Transfer",
  "Mobile Banking",
] as const;

type ExpenseDraft = {
  reason: string;
  date: string;
  vendor: string;
  category: string;
  method: string;
  billTotal: string;
  notes: string;
};

const fieldBaseClass =
  "mt-1 h-9 w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)]";
/** Text / number fields — I-beam for typing */
const inputClass = `${fieldBaseClass} cursor-text`;
/** Dropdowns & date pickers — hand cursor */
const selectClass = `${fieldBaseClass} cursor-pointer`;
const dateInputClass = `${fieldBaseClass} cursor-pointer`;

const labelClass = "text-[11px] text-[var(--pos-text-2)]";

function categorySelectOptions(current: string): string[] {
  const set = new Set<string>([...CATEGORY_OPTIONS, current]);
  return Array.from(set);
}

function paymentMethodSelectOptions(current: string): string[] {
  const set = new Set<string>([...PAYMENT_METHOD_OPTIONS, current]);
  return Array.from(set);
}

const VENDOR_SELECT_NEW = "__new_vendor__";

/** Whole taka, no decimals, no currency prefix/code. */
function formatMoney(value: number) {
  return new Intl.NumberFormat("en-BD", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function defaultExpenseDraft(): ExpenseDraft {
  return {
    reason: "",
    date: new Date().toISOString().slice(0, 10),
    vendor: "",
    category: CATEGORY_OPTIONS[0],
    method: PAYMENT_METHOD_OPTIONS[0],
    billTotal: "",
    notes: "",
  };
}

function expenseDraftFromRow(row: ExpenseRow): ExpenseDraft {
  return {
    reason: row.reason,
    date: row.date,
    vendor: row.vendor,
    category: row.category,
    method: row.method,
    billTotal: String(row.billTotal),
    notes: row.notes ?? "",
  };
}

function rowFromDraft(id: string, draft: ExpenseDraft): ExpenseRow {
  const bill = Number.parseFloat(draft.billTotal);
  return {
    id,
    reason: draft.reason.trim(),
    date: draft.date,
    vendor: draft.vendor.trim(),
    category: draft.category,
    method: draft.method,
    billTotal: bill,
    notes: draft.notes.trim() || undefined,
  };
}

/** Shared form body: create and edit both render this — one place for labels, grid, and options. */
function ExpenseFormFields({
  draft,
  onDraftChange,
  vendorOptions,
}: {
  draft: ExpenseDraft;
  onDraftChange: (patch: Partial<ExpenseDraft>) => void;
  /** Unique payee names from saved rows (sorted). */
  vendorOptions: string[];
}) {
  const vendorInList = draft.vendor !== "" && vendorOptions.includes(draft.vendor);

  const [vendorCustomMode, setVendorCustomMode] = useState(
    () => draft.vendor !== "" && !vendorOptions.includes(draft.vendor),
  );

  const payeeSelectValue = vendorInList
    ? draft.vendor
    : vendorCustomMode || draft.vendor !== ""
      ? VENDOR_SELECT_NEW
      : "";

  return (
    <div className="space-y-3">
      <label className={labelClass}>
        Reason
        <input
          type="text"
          value={draft.reason}
          onChange={(e) => onDraftChange({ reason: e.target.value })}
          placeholder="What this expense is for"
          className={inputClass}
          autoComplete="off"
        />
      </label>
      <p className="text-[11px] leading-relaxed text-[var(--pos-text-2)]">
        Record the full amount paid. Open balances for suppliers belong under Bills & payments.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={labelClass}>
          Date
          <input
            type="date"
            value={draft.date}
            onChange={(e) => onDraftChange({ date: e.target.value })}
            className={dateInputClass}
          />
        </label>
        <div className={labelClass}>
          <span className="block">Payee</span>
          <select
            value={payeeSelectValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === VENDOR_SELECT_NEW) {
                setVendorCustomMode(true);
                onDraftChange({ vendor: "" });
                return;
              }
              setVendorCustomMode(false);
              onDraftChange({ vendor: v });
            }}
            className={selectClass}
          >
            <option value="">Select payee…</option>
            {vendorOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={VENDOR_SELECT_NEW}>+ New payee…</option>
          </select>
          {!vendorInList && (vendorCustomMode || draft.vendor !== "") ? (
            <input
              type="text"
              value={draft.vendor}
              onChange={(e) => onDraftChange({ vendor: e.target.value })}
              placeholder="Landlord, utility company, service provider…"
              className={`${inputClass} mt-2`}
              autoComplete="off"
            />
          ) : null}
        </div>
        <label className={`${labelClass} sm:col-span-2`}>
          Amount paid
          <input
            type="number"
            inputMode="decimal"
            value={draft.billTotal}
            onChange={(e) => onDraftChange({ billTotal: e.target.value })}
            placeholder="e.g. 400"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Category
          <select
            value={draft.category}
            onChange={(e) => onDraftChange({ category: e.target.value })}
            className={selectClass}
          >
            {categorySelectOptions(draft.category).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Payment method
          <select
            value={draft.method}
            onChange={(e) => onDraftChange({ method: e.target.value })}
            className={selectClass}
          >
            {paymentMethodSelectOptions(draft.method).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Notes (optional)
          <input
            type="text"
            value={draft.notes}
            onChange={(e) => onDraftChange({ notes: e.target.value })}
            placeholder="What you bought, receipt #, etc."
            className={inputClass}
          />
        </label>
      </div>
    </div>
  );
}

const STARTING_ROWS: ExpenseRow[] = [
  {
    id: "EXP-9021",
    reason: "Weekly dairy and produce restock",
    date: "2026-04-08",
    vendor: "FreshFarm Suppliers",
    category: "Inventory",
    method: "Bank Transfer",
    billTotal: 12850,
    notes: "Dairy and produce",
  },
  {
    id: "EXP-9020",
    reason: "Electricity bill",
    date: "2026-04-07",
    vendor: "City Power",
    category: "Utilities",
    method: "Card",
    billTotal: 3900,
  },
  {
    id: "EXP-9019",
    reason: "Takeaway boxes and bags",
    date: "2026-04-07",
    vendor: "Rapid Packaging",
    category: "Packaging",
    method: "Cash",
    billTotal: 1720,
  },
  {
    id: "EXP-9018",
    reason: "Kitchen equipment repair",
    date: "2026-04-06",
    vendor: "FixIt Services",
    category: "Maintenance",
    method: "Bank Transfer",
    billTotal: 5650,
    notes: "Paid in full after service",
  },
  {
    id: "EXP-9017",
    reason: "Ice delivery",
    date: "2026-04-05",
    vendor: "Metro Ice",
    category: "Inventory",
    method: "Cash",
    billTotal: 2100,
  },
];

function shortDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ExpenseModalFrame({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex justify-end">
      {/* Spacer keeps layout; pointer-events-none so the list behind stays scrollable & clickable */}
      <div className="min-w-0 flex-1" aria-hidden />
      <div
        className="pointer-events-auto flex h-full w-full max-w-[min(100vw,520px)] shrink-0 flex-col border-l border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-[-12px_0_40px_rgba(0,0,0,0.12)]"
        role="dialog"
        aria-modal="false"
        aria-labelledby="expense-modal-title"
      >
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <h2
              id="expense-modal-title"
              className="text-[15px] font-semibold text-[var(--pos-text-1)]"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-solid [border-color:var(--pos-input-border)] text-[var(--pos-text-2)] transition-colors hover:border-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)]"
              aria-label="Close"
            >
              <X className="size-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
          {subtitle ? <div className="mt-2">{subtitle}</div> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        <div className="shrink-0 border-t border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-4 py-3">
          {footer}
        </div>
      </div>
    </div>
  );
}

export function ExpenseRecordsView() {
  const [rows, setRows] = useState<ExpenseRow[]>(STARTING_ROWS);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [expenseModal, setExpenseModal] = useState<"none" | "create" | "edit">("none");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [draft, setDraft] = useState<ExpenseDraft>(() => defaultExpenseDraft());

  const categories = useMemo(() => {
    const out = new Set<string>([...CATEGORY_OPTIONS]);
    rows.forEach((r) => out.add(r.category));
    return ["All", ...Array.from(out)];
  }, [rows]);

  const vendorOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.vendor.trim()) s.add(r.vendor.trim());
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const textMatch =
        q.length === 0 ||
        row.reason.toLowerCase().includes(q) ||
        row.vendor.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q);
      const categoryMatch = category === "All" || row.category === category;
      return textMatch && categoryMatch;
    });
  }, [rows, search, category]);

  const totalSpent = useMemo(
    () => filtered.reduce((sum, row) => sum + row.billTotal, 0),
    [filtered],
  );

  function patchDraft(patch: Partial<ExpenseDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function openCreateModal() {
    setDraft(defaultExpenseDraft());
    setEditingId(null);
    setExpenseModal("create");
  }

  function openEditModal(row: ExpenseRow) {
    setEditingId(row.id);
    setDraft(expenseDraftFromRow(row));
    setExpenseModal("edit");
  }

  function closeExpenseModal() {
    setExpenseModal("none");
    setEditingId(null);
    setDraft(defaultExpenseDraft());
  }

  function saveExpenseModal() {
    const bill = Number.parseFloat(draft.billTotal);
    if (!draft.vendor.trim() || !Number.isFinite(bill) || bill <= 0) {
      return;
    }

    if (expenseModal === "create") {
      const nextId = `EXP-${9000 + rows.length + 1}`;
      setRows((prev) => [rowFromDraft(nextId, draft), ...prev]);
    } else if (expenseModal === "edit" && editingId) {
      setRows((prev) =>
        prev.map((row) => (row.id === editingId ? rowFromDraft(editingId, draft) : row)),
      );
    }
    closeExpenseModal();
  }

  const isSaveDisabled = (() => {
    if (!draft.reason.trim()) return true;
    if (!draft.vendor.trim() || !draft.billTotal.trim()) return true;
    const bill = Number.parseFloat(draft.billTotal);
    if (!Number.isFinite(bill) || bill <= 0) return true;
    return false;
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
        <div>
          <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">
            Other expenses
          </h1>
          <p className="text-[12px] text-[var(--pos-text-2)]">
            Fully paid costs only. Supplier open balances — use Bills & payments.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--pos-sb-base)" }}
        >
          <Plus className="size-4" strokeWidth={2.2} />
          Add other expense
        </button>
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
            placeholder="Search reason, payee, category, or ID"
            className="h-9 w-full cursor-text rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] pl-9 pr-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)] focus:outline-none"
          />
        </label>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)]"
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <div className="ml-auto text-[11px] text-[var(--pos-text-2)]">
          Showing <span className="font-semibold text-[var(--pos-text-1)]">{filtered.length}</span>{" "}
          rows
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2">
        <div className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2">
          <div className="text-[11px] text-[var(--pos-text-2)]">Total paid (this view)</div>
          <div className="text-[14px] font-semibold text-[var(--pos-text-1)]">
            {formatMoney(totalSpent)}
          </div>
        </div>
        <div className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2">
          <div className="text-[11px] text-[var(--pos-text-2)]">Entries (this view)</div>
          <div className="text-[14px] font-semibold text-[var(--pos-text-1)]">
            {filtered.length}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
            <tr className="border-b border-solid [border-color:var(--pos-divider)] text-left">
              <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Date</th>
              <th className="min-w-[140px] max-w-[220px] px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                Reason
              </th>
              <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                Payee
              </th>
              <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                Category
              </th>
              <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                Method
              </th>
              <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                Amount paid
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => openEditModal(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openEditModal(row);
                  }
                }}
                className="cursor-pointer border-b border-solid [border-color:var(--pos-divider)] text-[12px] transition-colors hover:bg-[var(--pos-nav-hover)]/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pos-sb-base)]"
              >
                <td className="px-4 py-2 text-[var(--pos-text-2)]">{shortDate(row.date)}</td>
                <td className="max-w-[220px] truncate px-4 py-2 text-[var(--pos-text-1)]" title={row.reason}>
                  {row.reason}
                </td>
                <td className="px-4 py-2 font-medium text-[var(--pos-text-1)]">{row.vendor}</td>
                <td className="px-4 py-2 text-[var(--pos-text-2)]">{row.category}</td>
                <td className="px-4 py-2 text-[var(--pos-text-2)]">{row.method}</td>
                <td className="px-4 py-2 tabular-nums text-[var(--pos-text-1)]">
                  {formatMoney(row.billTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {expenseModal !== "none" ? (
        <ExpenseModalFrame
          title={expenseModal === "edit" ? "Edit other expense" : "Add other expense"}
          subtitle={
            expenseModal === "edit" && editingId ? (
              <p className="text-[11px] text-[var(--pos-text-2)]">{editingId}</p>
            ) : null
          }
          onClose={closeExpenseModal}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeExpenseModal}
                className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] px-3 text-[12px] text-[var(--pos-text-1)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveExpenseModal}
                className="h-9 cursor-pointer rounded-[9px] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                style={{ backgroundColor: "var(--pos-sb-base)" }}
                disabled={isSaveDisabled}
              >
                {expenseModal === "edit" ? "Save changes" : "Save"}
              </button>
            </div>
          }
        >
          <ExpenseFormFields
            key={`${expenseModal}-${editingId ?? "new"}`}
            draft={draft}
            onDraftChange={patchDraft}
            vendorOptions={vendorOptions}
          />
        </ExpenseModalFrame>
      ) : null}
    </div>
  );
}
