import {
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Plus, Search, X } from "lucide-react";

export const INVENTORY_LEAF_IDS = new Set(["inv-overview", "inv-adjust"]);

// ——— Design tokens (match expense records) ———
const fieldBaseClass =
  "mt-1 h-9 w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)]";
const inputClass = `${fieldBaseClass} cursor-text`;
const selectClass = `${fieldBaseClass} cursor-pointer`;
const dateInputClass = `${fieldBaseClass} cursor-pointer`;
const labelClass = "text-[11px] text-[var(--pos-text-2)]";

function formatWhole(value: number) {
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(
    Math.round(value),
  );
}

function shortDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function PosSideDrawer({
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
      <div className="min-w-0 flex-1" aria-hidden />
      <div
        className="pointer-events-auto flex h-full w-full max-w-[min(100vw,520px)] shrink-0 flex-col border-l border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-[-12px_0_40px_rgba(0,0,0,0.12)]"
        role="dialog"
        aria-modal="false"
        aria-labelledby="inv-drawer-title"
      >
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <h2
              id="inv-drawer-title"
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

// ——— Stock overview ———
type StockStatus = "ok" | "low" | "out";

type StockItemRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  onHand: number;
  parLevel: number;
  lastCounted: string;
};

const STOCK_CATEGORIES = [
  "Produce",
  "Dairy",
  "Dry goods",
  "Protein",
  "Beverages",
  "Other",
] as const;

const UNITS = ["kg", "g", "L", "ml", "ea", "bx", "cs"] as const;

function stockStatus(row: StockItemRow): StockStatus {
  if (row.onHand <= 0) return "out";
  if (row.onHand < row.parLevel) return "low";
  return "ok";
}

const INITIAL_STOCK: StockItemRow[] = [
  {
    id: "stk-1",
    sku: "PR-001",
    name: "White onion",
    category: "Produce",
    unit: "kg",
    onHand: 12,
    parLevel: 8,
    lastCounted: "2026-04-07",
  },
  {
    id: "stk-2",
    sku: "PR-002",
    name: "Roma tomatoes",
    category: "Produce",
    unit: "kg",
    onHand: 5,
    parLevel: 6,
    lastCounted: "2026-04-08",
  },
  {
    id: "stk-3",
    sku: "DY-100",
    name: "Heavy cream",
    category: "Dairy",
    unit: "L",
    onHand: 8,
    parLevel: 4,
    lastCounted: "2026-04-06",
  },
  {
    id: "stk-4",
    sku: "DR-220",
    name: "Arborio rice",
    category: "Dry goods",
    unit: "kg",
    onHand: 20,
    parLevel: 10,
    lastCounted: "2026-04-05",
  },
  {
    id: "stk-5",
    sku: "PR-030",
    name: "Beef tenderloin",
    category: "Protein",
    unit: "kg",
    onHand: 0,
    parLevel: 4,
    lastCounted: "2026-04-08",
  },
  {
    id: "stk-6",
    sku: "BV-012",
    name: "Sparkling water",
    category: "Beverages",
    unit: "cs",
    onHand: 14,
    parLevel: 8,
    lastCounted: "2026-04-07",
  },
];

type StockDraft = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  onHand: string;
  parLevel: string;
  lastCounted: string;
};

function defaultStockDraft(): StockDraft {
  return {
    sku: "",
    name: "",
    category: STOCK_CATEGORIES[0],
    unit: UNITS[0],
    onHand: "",
    parLevel: "",
    lastCounted: new Date().toISOString().slice(0, 10),
  };
}

// ——— Adjustments ———
type AdjustmentKind = "Receive" | "Waste" | "Correction";

type AdjustmentRow = {
  id: string;
  date: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  kind: AdjustmentKind;
  /** Signed change applied to on-hand (+ receive, − waste, correction as entered). */
  signedQty: number;
  reason: string;
};

const INITIAL_ADJUSTMENTS: AdjustmentRow[] = [
  {
    id: "adj-1",
    date: "2026-04-08",
    itemId: "stk-1",
    itemSku: "PR-001",
    itemName: "White onion",
    kind: "Receive",
    signedQty: 10,
    reason: "Morning market run",
  },
  {
    id: "adj-2",
    date: "2026-04-08",
    itemId: "stk-2",
    itemSku: "PR-002",
    itemName: "Roma tomatoes",
    kind: "Waste",
    signedQty: -2,
    reason: "Prep trim / spoilage",
  },
  {
    id: "adj-3",
    date: "2026-04-07",
    itemId: "stk-4",
    itemSku: "DR-220",
    itemName: "Arborio rice",
    kind: "Correction",
    signedQty: -1,
    reason: "Count correction after audit",
  },
];

type AdjustmentDraft = {
  date: string;
  itemId: string;
  kind: AdjustmentKind;
  qty: string;
  reason: string;
};

function defaultAdjustmentDraft(): AdjustmentDraft {
  return {
    date: new Date().toISOString().slice(0, 10),
    itemId: "",
    kind: "Receive",
    qty: "",
    reason: "",
  };
}

function signedQtyFromDraft(kind: AdjustmentKind, qtyRaw: string): number | null {
  const n = Number.parseFloat(qtyRaw);
  if (!Number.isFinite(n) || n === 0) return null;
  if (kind === "Receive") return Math.abs(n);
  if (kind === "Waste") return -Math.abs(n);
  return n;
}

type InvShellProps = {
  title: string;
  description: string;
  primaryAction: ReactNode;
  filters: ReactNode;
  stats: ReactNode;
  table: ReactNode;
  drawer: ReactNode;
};

function InvShell({
  title,
  description,
  primaryAction,
  filters,
  stats,
  table,
  drawer,
}: InvShellProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
        <div>
          <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">{title}</h1>
          <p className="text-[12px] text-[var(--pos-text-2)]">{description}</p>
        </div>
        {primaryAction}
      </div>
      {filters}
      {stats}
      {table}
      {drawer}
    </div>
  );
}

export function InventoryModuleView({ leafId }: { leafId: string }) {
  const [stockItems, setStockItems] = useState<StockItemRow[]>(INITIAL_STOCK);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>(INITIAL_ADJUSTMENTS);

  if (leafId === "inv-adjust") {
    return (
      <AdjustmentsSection
        stockItems={stockItems}
        setStockItems={setStockItems}
        adjustments={adjustments}
        setAdjustments={setAdjustments}
      />
    );
  }

  return (
    <StockOverviewSection stockItems={stockItems} setStockItems={setStockItems} />
  );
}

function StockOverviewSection({
  stockItems,
  setStockItems,
}: {
  stockItems: StockItemRow[];
  setStockItems: Dispatch<SetStateAction<StockItemRow[]>>;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | StockStatus>("All");
  const [modal, setModal] = useState<"none" | "create" | "edit">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StockDraft>(() => defaultStockDraft());

  const categories = useMemo(() => {
    const s = new Set<string>([...STOCK_CATEGORIES]);
    stockItems.forEach((r) => s.add(r.category));
    return ["All", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [stockItems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stockItems.filter((row) => {
      const text =
        q.length === 0 ||
        row.name.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q);
      const cat = category === "All" || row.category === category;
      const st = stockStatus(row);
      const stOk = statusFilter === "All" || st === statusFilter;
      return text && cat && stOk;
    });
  }, [stockItems, search, category, statusFilter]);

  const lowOrOut = useMemo(
    () => filtered.filter((r) => stockStatus(r) !== "ok").length,
    [filtered],
  );

  function patchDraft(p: Partial<StockDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function closeModal() {
    setModal("none");
    setEditingId(null);
    setDraft(defaultStockDraft());
  }

  function openCreate() {
    setEditingId(null);
    setDraft(defaultStockDraft());
    setModal("create");
  }

  function openEdit(row: StockItemRow) {
    setEditingId(row.id);
    setDraft({
      sku: row.sku,
      name: row.name,
      category: row.category,
      unit: row.unit,
      onHand: String(row.onHand),
      parLevel: String(row.parLevel),
      lastCounted: row.lastCounted,
    });
    setModal("edit");
  }

  function saveStock() {
    const onHand = Number.parseFloat(draft.onHand);
    const par = Number.parseFloat(draft.parLevel);
    if (
      !draft.sku.trim() ||
      !draft.name.trim() ||
      !Number.isFinite(onHand) ||
      onHand < 0 ||
      !Number.isFinite(par) ||
      par < 0
    ) {
      return;
    }
    const row: StockItemRow = {
      id: editingId ?? `stk-${Date.now()}`,
      sku: draft.sku.trim(),
      name: draft.name.trim(),
      category: draft.category,
      unit: draft.unit,
      onHand,
      parLevel: par,
      lastCounted: draft.lastCounted,
    };
    if (modal === "create") {
      setStockItems((prev) => [row, ...prev]);
    } else if (modal === "edit" && editingId) {
      setStockItems((prev) => prev.map((x) => (x.id === editingId ? { ...row, id: editingId } : x)));
    }
    closeModal();
  }

  const saveDisabled =
    !draft.sku.trim() ||
    !draft.name.trim() ||
    draft.onHand.trim() === "" ||
    draft.parLevel.trim() === "" ||
    !Number.isFinite(Number.parseFloat(draft.onHand)) ||
    Number.parseFloat(draft.onHand) < 0 ||
    !Number.isFinite(Number.parseFloat(draft.parLevel)) ||
    Number.parseFloat(draft.parLevel) < 0;

  return (
    <InvShell
      title="Stock overview"
      description="SKU-level counts, par levels, and quick status at a glance."
      primaryAction={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--pos-sb-base)" }}
        >
          <Plus className="size-4" strokeWidth={2.2} />
          Add stock item
        </button>
      }
      filters={
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
              placeholder="Search name, SKU, or category"
              className="h-9 w-full cursor-text rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] pl-9 pr-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)] focus:outline-none"
            />
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)]"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "All" | StockStatus)}
            className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)]"
          >
            <option value="All">All status</option>
            <option value="ok">In stock</option>
            <option value="low">Low</option>
            <option value="out">Out</option>
          </select>
          <div className="ml-auto text-[11px] text-[var(--pos-text-2)]">
            Showing{" "}
            <span className="font-semibold text-[var(--pos-text-1)]">{filtered.length}</span> rows
          </div>
        </div>
      }
      stats={
        <div className="grid grid-cols-2 gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2">
          <div className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2">
            <div className="text-[11px] text-[var(--pos-text-2)]">SKUs (this view)</div>
            <div className="text-[14px] font-semibold text-[var(--pos-text-1)]">
              {formatWhole(filtered.length)}
            </div>
          </div>
          <div className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2">
            <div className="text-[11px] text-[var(--pos-text-2)]">Low or out</div>
            <div className="text-[14px] font-semibold text-[var(--pos-text-1)]">
              {formatWhole(lowOrOut)}
            </div>
          </div>
        </div>
      }
      table={
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[800px] border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
              <tr className="border-b border-solid [border-color:var(--pos-divider)] text-left">
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">SKU</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Name</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                  Category
                </th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Unit</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                  On hand
                </th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Par</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                  Last counted
                </th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const st = stockStatus(row);
                return (
                  <tr
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEdit(row);
                      }
                    }}
                    className="cursor-pointer border-b border-solid [border-color:var(--pos-divider)] text-[12px] transition-colors hover:bg-[var(--pos-nav-hover)]/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pos-sb-base)]"
                  >
                    <td className="px-4 py-2 text-[var(--pos-text-1)]">{row.sku}</td>
                    <td className="px-4 py-2 font-medium text-[var(--pos-text-1)]">{row.name}</td>
                    <td className="px-4 py-2 text-[var(--pos-text-2)]">{row.category}</td>
                    <td className="px-4 py-2 text-[var(--pos-text-2)]">{row.unit}</td>
                    <td className="px-4 py-2 tabular-nums text-[var(--pos-text-1)]">
                      {formatWhole(row.onHand)}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-[var(--pos-text-2)]">
                      {formatWhole(row.parLevel)}
                    </td>
                    <td className="px-4 py-2 text-[var(--pos-text-2)]">
                      {shortDate(row.lastCounted)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background:
                            st === "ok"
                              ? "rgba(31, 162, 92, 0.16)"
                              : st === "low"
                                ? "rgba(255, 159, 67, 0.16)"
                                : "rgba(231, 76, 60, 0.16)",
                          color:
                            st === "ok"
                              ? "#1d7f4e"
                              : st === "low"
                                ? "#ad6a1c"
                                : "#9f3023",
                        }}
                      >
                        {st === "ok" ? "In stock" : st === "low" ? "Low" : "Out"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      }
      drawer={
        modal !== "none" ? (
          <PosSideDrawer
            title={modal === "edit" ? "Edit stock item" : "Add stock item"}
            subtitle={
              modal === "edit" && editingId ? (
                <p className="text-[11px] text-[var(--pos-text-2)]">{editingId}</p>
              ) : null
            }
            onClose={closeModal}
            footer={
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] px-3 text-[12px] text-[var(--pos-text-1)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveStock}
                  disabled={saveDisabled}
                  className="h-9 cursor-pointer rounded-[9px] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ backgroundColor: "var(--pos-sb-base)" }}
                >
                  {modal === "edit" ? "Save changes" : "Save item"}
                </button>
              </div>
            }
          >
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={labelClass}>
                  SKU
                  <input
                    value={draft.sku}
                    onChange={(e) => patchDraft({ sku: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. PR-001"
                  />
                </label>
                <label className={labelClass}>
                  Last counted
                  <input
                    type="date"
                    value={draft.lastCounted}
                    onChange={(e) => patchDraft({ lastCounted: e.target.value })}
                    className={dateInputClass}
                  />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Item name
                  <input
                    value={draft.name}
                    onChange={(e) => patchDraft({ name: e.target.value })}
                    className={inputClass}
                    placeholder="Ingredient or product name"
                  />
                </label>
                <label className={labelClass}>
                  Category
                  <select
                    value={draft.category}
                    onChange={(e) => patchDraft({ category: e.target.value })}
                    className={selectClass}
                  >
                    {Array.from(
                      new Set([...STOCK_CATEGORIES, draft.category]),
                    ).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Unit
                  <select
                    value={draft.unit}
                    onChange={(e) => patchDraft({ unit: e.target.value })}
                    className={selectClass}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  On hand
                  <input
                    type="number"
                    inputMode="numeric"
                    value={draft.onHand}
                    onChange={(e) => patchDraft({ onHand: e.target.value })}
                    className={inputClass}
                    min={0}
                  />
                </label>
                <label className={labelClass}>
                  Par / reorder level
                  <input
                    type="number"
                    inputMode="numeric"
                    value={draft.parLevel}
                    onChange={(e) => patchDraft({ parLevel: e.target.value })}
                    className={inputClass}
                    min={0}
                  />
                </label>
              </div>
            </div>
          </PosSideDrawer>
        ) : null
      }
    />
  );
}

function AdjustmentsSection({
  stockItems,
  setStockItems,
  adjustments,
  setAdjustments,
}: {
  stockItems: StockItemRow[];
  setStockItems: Dispatch<SetStateAction<StockItemRow[]>>;
  adjustments: AdjustmentRow[];
  setAdjustments: Dispatch<SetStateAction<AdjustmentRow[]>>;
}) {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"All" | AdjustmentKind>("All");
  const [modal, setModal] = useState<"none" | "create" | "edit">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdjustmentDraft>(() => defaultAdjustmentDraft());
  const [prevSigned, setPrevSigned] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return adjustments.filter((row) => {
      const text =
        q.length === 0 ||
        row.itemName.toLowerCase().includes(q) ||
        row.itemSku.toLowerCase().includes(q) ||
        row.reason.toLowerCase().includes(q);
      const k = kindFilter === "All" || row.kind === kindFilter;
      return text && k;
    });
  }, [adjustments, search, kindFilter]);

  const netChange = useMemo(
    () => filtered.reduce((s, r) => s + r.signedQty, 0),
    [filtered],
  );

  function patchDraft(p: Partial<AdjustmentDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function closeModal() {
    setModal("none");
    setEditingId(null);
    setPrevSigned(null);
    setDraft(defaultAdjustmentDraft());
  }

  function applyToStock(itemId: string, delta: number) {
    setStockItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, onHand: Math.max(0, it.onHand + delta) } : it,
      ),
    );
  }

  function openCreate() {
    setEditingId(null);
    setPrevSigned(null);
    setDraft(defaultAdjustmentDraft());
    setModal("create");
  }

  function openEdit(row: AdjustmentRow) {
    setEditingId(row.id);
    setPrevSigned(row.signedQty);
    setDraft({
      date: row.date,
      itemId: row.itemId,
      kind: row.kind,
      qty:
        row.kind === "Correction"
          ? String(row.signedQty)
          : String(Math.abs(row.signedQty)),
      reason: row.reason,
    });
    setModal("edit");
  }

  function saveAdjustment() {
    const signed =
      draft.kind === "Correction"
        ? Number.parseFloat(draft.qty)
        : signedQtyFromDraft(draft.kind, draft.qty);
    if (
      !draft.itemId ||
      signed === null ||
      !Number.isFinite(signed) ||
      signed === 0 ||
      !draft.reason.trim()
    ) {
      return;
    }
    const item = stockItems.find((s) => s.id === draft.itemId);
    if (!item) return;

    if (modal === "create") {
      applyToStock(draft.itemId, signed);
      const id = `adj-${Date.now()}`;
      setAdjustments((prev) => [
        {
          id,
          date: draft.date,
          itemId: draft.itemId,
          itemSku: item.sku,
          itemName: item.name,
          kind: draft.kind,
          signedQty: signed,
          reason: draft.reason.trim(),
        },
        ...prev,
      ]);
    } else if (modal === "edit" && editingId && prevSigned !== null) {
      const diff = signed - prevSigned;
      if (diff !== 0) applyToStock(draft.itemId, diff);
      setAdjustments((prev) =>
        prev.map((r) =>
          r.id === editingId
            ? {
                ...r,
                date: draft.date,
                itemId: draft.itemId,
                itemSku: item.sku,
                itemName: item.name,
                kind: draft.kind,
                signedQty: signed,
                reason: draft.reason.trim(),
              }
            : r,
        ),
      );
    }
    closeModal();
  }

  const qtyInvalid =
    draft.qty.trim() === "" ||
    !Number.isFinite(Number.parseFloat(draft.qty)) ||
    (draft.kind !== "Correction" && Number.parseFloat(draft.qty) <= 0);
  const saveDisabled =
    !draft.itemId || qtyInvalid || !draft.reason.trim();

  const itemPicker = (
    <label className={labelClass}>
      Item
      <select
        value={draft.itemId}
        onChange={(e) => patchDraft({ itemId: e.target.value })}
        className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-60`}
        disabled={modal === "edit"}
      >
        <option value="">Select item…</option>
        {stockItems.map((s) => (
          <option key={s.id} value={s.id}>
            {s.sku} — {s.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <InvShell
      title="Stock adjustments"
      description="Receipts, waste, and corrections — same drawer flow as expenses."
      primaryAction={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--pos-sb-base)" }}
        >
          <Plus className="size-4" strokeWidth={2.2} />
          Record adjustment
        </button>
      }
      filters={
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
              placeholder="Search item, SKU, or reason"
              className="h-9 w-full cursor-text rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] pl-9 pr-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)] focus:outline-none"
            />
          </label>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as "All" | AdjustmentKind)}
            className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)]"
          >
            <option value="All">All types</option>
            <option value="Receive">Receive</option>
            <option value="Waste">Waste</option>
            <option value="Correction">Correction</option>
          </select>
          <div className="ml-auto text-[11px] text-[var(--pos-text-2)]">
            Showing{" "}
            <span className="font-semibold text-[var(--pos-text-1)]">{filtered.length}</span> rows
          </div>
        </div>
      }
      stats={
        <div className="grid grid-cols-2 gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2">
          <div className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2">
            <div className="text-[11px] text-[var(--pos-text-2)]">Rows (this view)</div>
            <div className="text-[14px] font-semibold text-[var(--pos-text-1)]">
              {formatWhole(filtered.length)}
            </div>
          </div>
          <div className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2">
            <div className="text-[11px] text-[var(--pos-text-2)]">Net qty (filtered)</div>
            <div className="text-[14px] font-semibold text-[var(--pos-text-1)]">
              {netChange >= 0 ? "+" : ""}
              {formatWhole(netChange)}
            </div>
          </div>
        </div>
      }
      table={
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
              <tr className="border-b border-solid [border-color:var(--pos-divider)] text-left">
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Date</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">SKU</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Item</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Type</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Δ Qty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEdit(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEdit(row);
                    }
                  }}
                  className="cursor-pointer border-b border-solid [border-color:var(--pos-divider)] text-[12px] transition-colors hover:bg-[var(--pos-nav-hover)]/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pos-sb-base)]"
                >
                  <td className="px-4 py-2 text-[var(--pos-text-2)]">{shortDate(row.date)}</td>
                  <td className="px-4 py-2 text-[var(--pos-text-1)]">{row.itemSku}</td>
                  <td className="px-4 py-2 font-medium text-[var(--pos-text-1)]">{row.itemName}</td>
                  <td className="px-4 py-2 text-[var(--pos-text-2)]">{row.kind}</td>
                  <td
                    className={`px-4 py-2 tabular-nums ${
                      row.signedQty >= 0 ? "text-[var(--pos-text-1)]" : "text-[var(--pos-text-2)]"
                    }`}
                  >
                    {row.signedQty >= 0 ? "+" : ""}
                    {formatWhole(row.signedQty)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
      drawer={
        modal !== "none" ? (
          <PosSideDrawer
            title={modal === "edit" ? "Edit adjustment" : "Record adjustment"}
            subtitle={
              modal === "edit" && editingId ? (
                <p className="text-[11px] text-[var(--pos-text-2)]">{editingId}</p>
              ) : null
            }
            onClose={closeModal}
            footer={
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] px-3 text-[12px] text-[var(--pos-text-1)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAdjustment}
                  disabled={saveDisabled}
                  className="h-9 cursor-pointer rounded-[9px] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ backgroundColor: "var(--pos-sb-base)" }}
                >
                  {modal === "edit" ? "Save changes" : "Save"}
                </button>
              </div>
            }
          >
            <div className="space-y-3">
              <p className="text-[11px] leading-relaxed text-[var(--pos-text-2)]">
                <span className="font-medium text-[var(--pos-text-1)]">Receive</span> adds on-hand;{" "}
                <span className="font-medium text-[var(--pos-text-1)]">Waste</span> subtracts.{" "}
                <span className="font-medium text-[var(--pos-text-1)]">Correction</span> use a signed
                number (e.g. −2 or 3).
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={labelClass}>
                  Date
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(e) => patchDraft({ date: e.target.value })}
                    className={dateInputClass}
                  />
                </label>
                <div className={`${labelClass} sm:col-span-2`}>{itemPicker}</div>
                <label className={labelClass}>
                  Type
                  <select
                    value={draft.kind}
                    onChange={(e) =>
                      patchDraft({ kind: e.target.value as AdjustmentKind, qty: "" })
                    }
                    className={selectClass}
                  >
                    <option value="Receive">Receive</option>
                    <option value="Waste">Waste</option>
                    <option value="Correction">Correction</option>
                  </select>
                </label>
                <label className={labelClass}>
                  {draft.kind === "Correction" ? "Quantity (signed)" : "Quantity"}
                  <input
                    type="number"
                    inputMode="decimal"
                    value={draft.qty}
                    onChange={(e) => patchDraft({ qty: e.target.value })}
                    className={inputClass}
                    placeholder={draft.kind === "Correction" ? "e.g. -2 or 5" : "e.g. 10"}
                  />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Reason
                  <input
                    value={draft.reason}
                    onChange={(e) => patchDraft({ reason: e.target.value })}
                    className={inputClass}
                    placeholder="Required — e.g. market receipt, spoilage"
                  />
                </label>
              </div>
            </div>
          </PosSideDrawer>
        ) : null
      }
    />
  );
}
