import {
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Minus, Plus, Search, X } from "lucide-react";
import {
  type InventoryStore,
  type LedgerMovement,
  type StockDirection,
  type StockItemMeta,
  balanceForItem,
} from "../../lib/inventoryLedger";
import {
  createStockItemOnApi,
  createStockMovementOnApi,
  useStockInventory,
} from "@/features/inventory";

export const INVENTORY_LEAF_IDS = new Set(["inv-overview", "inv-adjust"]);

const fieldBaseClass =
  "mt-1 h-9 w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)]";
const inputClass = `${fieldBaseClass} cursor-text`;
const selectClass = `${fieldBaseClass} cursor-pointer`;
const dateInputClass = `${fieldBaseClass} cursor-pointer`;
const labelClass = "text-[11px] text-[var(--pos-text-2)]";

function formatQty(value: number) {
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 3 }).format(value);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(Math.round(value));
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

type StockStatus = "ok" | "low" | "out";

type OverviewRow = StockItemMeta & { balance: number };

const STOCK_CATEGORIES = [
  "Produce",
  "Dairy",
  "Dry goods",
  "Protein",
  "Beverages",
  "Other",
] as const;

const UNITS = ["kg", "g", "L", "ml", "ea", "bx", "cs"] as const;

function stockStatus(balance: number, parLevel: number): StockStatus {
  if (balance <= 0) return "out";
  if (balance < parLevel) return "low";
  return "ok";
}

type StockDraft = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  parLevel: string;
  lastCounted: string;
  openingQty: string;
};

function defaultStockDraft(): StockDraft {
  return {
    sku: "",
    name: "",
    category: STOCK_CATEGORIES[0],
    unit: UNITS[0],
    parLevel: "",
    lastCounted: new Date().toISOString().slice(0, 10),
    openingQty: "",
  };
}

type MovementDraft = {
  date: string;
  itemId: string;
  direction: StockDirection;
  qty: string;
  note: string;
};

function defaultMovementDraft(): MovementDraft {
  return {
    date: new Date().toISOString().slice(0, 10),
    itemId: "",
    direction: "IN",
    qty: "",
    note: "",
  };
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
      {stats}
      {filters}
      {table}
      {drawer}
    </div>
  );
}

export function InventoryModuleView({ leafId }: { leafId: string }) {
  const { store, setStore, loading, error, refresh } = useStockInventory();

  if (loading) {
    return (
      <p className="px-4 py-8 text-[13px] text-[var(--pos-text-2)]">Loading inventory…</p>
    );
  }
  if (error) {
    return (
      <p className="px-4 py-8 text-[13px] text-red-600" role="alert">
        {error}
      </p>
    );
  }

  if (leafId === "inv-adjust") {
    return (
      <MovementsSection store={store} setStore={setStore} refresh={refresh} />
    );
  }

  return <StockOverviewSection store={store} setStore={setStore} refresh={refresh} />;
}

function StockOverviewSection({
  store,
  setStore,
  refresh,
}: {
  store: InventoryStore;
  setStore: Dispatch<SetStateAction<InventoryStore>>;
  refresh: () => Promise<void>;
}) {
  const { items, movements } = store;

  const rows: OverviewRow[] = useMemo(
    () =>
      items.map((it) => ({
        ...it,
        balance: balanceForItem(movements, it.id),
      })),
    [items, movements],
  );

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | StockStatus>("All");
  const [modal, setModal] = useState<"none" | "create" | "edit">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StockDraft>(() => defaultStockDraft());

  const categories = useMemo(() => {
    const s = new Set<string>([...STOCK_CATEGORIES]);
    rows.forEach((r) => s.add(r.category));
    return ["All", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const text =
        q.length === 0 ||
        row.name.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q);
      const cat = category === "All" || row.category === category;
      const st = stockStatus(row.balance, row.parLevel);
      const stOk = statusFilter === "All" || st === statusFilter;
      return text && cat && stOk;
    });
  }, [rows, search, category, statusFilter]);

  const lowOrOut = useMemo(
    () => filtered.filter((r) => stockStatus(r.balance, r.parLevel) !== "ok").length,
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

  function openEdit(row: OverviewRow) {
    setEditingId(row.id);
    setDraft({
      sku: row.sku,
      name: row.name,
      category: row.category,
      unit: row.unit,
      parLevel: String(row.parLevel),
      lastCounted: row.lastCounted,
      openingQty: "",
    });
    setModal("edit");
  }

  async function saveStock() {
    const par = Number.parseFloat(draft.parLevel);
    if (
      !draft.sku.trim() ||
      !draft.name.trim() ||
      !Number.isFinite(par) ||
      par < 0
    ) {
      return;
    }

    if (modal === "create") {
      const openingRaw = draft.openingQty.trim();
      const opening =
        openingRaw === "" ? 0 : Number.parseFloat(openingRaw);
      if (openingRaw !== "" && (!Number.isFinite(opening) || opening < 0)) return;

      await createStockItemOnApi({
        sku: draft.sku.trim(),
        name: draft.name.trim(),
        category: draft.category,
        unit: draft.unit,
        parLevel: par,
        openingQuantity: opening > 0 ? opening : undefined,
        openingReason: opening > 0 ? "Opening balance" : undefined,
      });
      await refresh();
    } else if (modal === "edit" && editingId) {
      setStore((prev) => ({
        ...prev,
        items: prev.items.map((it) =>
          it.id === editingId
            ? {
                ...it,
                sku: draft.sku.trim(),
                name: draft.name.trim(),
                category: draft.category,
                unit: draft.unit,
                parLevel: par,
                lastCounted: draft.lastCounted,
              }
            : it,
        ),
      }));
    }
    closeModal();
  }

  const saveDisabled =
    !draft.sku.trim() ||
    !draft.name.trim() ||
    draft.parLevel.trim() === "" ||
    !Number.isFinite(Number.parseFloat(draft.parLevel)) ||
    Number.parseFloat(draft.parLevel) < 0;

  const editBalance =
    editingId != null ? balanceForItem(movements, editingId) : null;

  return (
    <InvShell
      title="Stock overview"
      description="Balances are calculated from every stock IN and OUT. Edit items for SKU details and par level only."
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
              {formatCount(filtered.length)}
            </div>
          </div>
          <div className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2">
            <div className="text-[11px] text-[var(--pos-text-2)]">Low or out</div>
            <div className="text-[14px] font-semibold text-[var(--pos-text-1)]">
              {formatCount(lowOrOut)}
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
                  Balance
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
                const st = stockStatus(row.balance, row.parLevel);
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
                      {formatQty(row.balance)}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-[var(--pos-text-2)]">
                      {formatQty(row.parLevel)}
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
                <div className="space-y-1">
                  <p className="text-[11px] text-[var(--pos-text-2)]">{editingId}</p>
                  {editBalance !== null ? (
                    <p className="text-[11px] text-[var(--pos-text-1)]">
                      Current balance:{" "}
                      <span className="font-semibold tabular-nums">{formatQty(editBalance)}</span>{" "}
                      (from movements — change under Stock in &amp; out)
                    </p>
                  ) : null}
                </div>
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
                {modal === "create" ? (
                  <label className={`${labelClass} sm:col-span-2`}>
                    Opening stock IN (optional)
                    <input
                      type="number"
                      inputMode="decimal"
                      value={draft.openingQty}
                      onChange={(e) => patchDraft({ openingQty: e.target.value })}
                      className={inputClass}
                      min={0}
                      placeholder="Leave empty to start at zero; creates one IN line"
                    />
                  </label>
                ) : null}
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

function MovementsSection({
  store,
  setStore,
  refresh,
}: {
  store: InventoryStore;
  setStore: Dispatch<SetStateAction<InventoryStore>>;
  refresh: () => Promise<void>;
}) {
  const { items, movements } = store;

  const [search, setSearch] = useState("");
  const [dirFilter, setDirFilter] = useState<"All" | StockDirection>("All");
  const [modal, setModal] = useState<"none" | "create" | "edit">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MovementDraft>(() => defaultMovementDraft());
  const [prevRow, setPrevRow] = useState<LedgerMovement | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [createDirectionLocked, setCreateDirectionLocked] = useState(false);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const enriched = useMemo(
    () =>
      movements.map((m) => {
        const it = itemById.get(m.stockItemId);
        return {
          ...m,
          itemSku: it?.sku ?? "—",
          itemName: it?.name ?? "Removed item",
        };
      }),
    [movements, itemById],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((row) => {
      const text =
        q.length === 0 ||
        row.itemName.toLowerCase().includes(q) ||
        row.itemSku.toLowerCase().includes(q) ||
        row.note.toLowerCase().includes(q);
      const d = dirFilter === "All" || row.direction === dirFilter;
      return text && d;
    });
  }, [enriched, search, dirFilter]);

  const netChange = useMemo(() => {
    return filtered.reduce((s, r) => {
      const q = r.quantity;
      return s + (r.direction === "IN" ? q : -q);
    }, 0);
  }, [filtered]);

  /** For OUT, max removable = on-hand; when editing an OUT line, add that line’s qty back. */
  const outAvailabilityHint = useMemo(() => {
    if (!draft.itemId || draft.direction !== "OUT") return null;
    let b = balanceForItem(movements, draft.itemId);
    if (
      modal === "edit" &&
      editingId &&
      prevRow &&
      prevRow.stockItemId === draft.itemId &&
      prevRow.direction === "OUT"
    ) {
      b += prevRow.quantity;
    }
    return b;
  }, [draft.itemId, draft.direction, movements, modal, editingId, prevRow]);

  const selectedItemUnit = draft.itemId
    ? items.find((i) => i.id === draft.itemId)?.unit
    : undefined;

  const qtyParsedForStep = Number.parseFloat(draft.qty.trim());
  const qtyNumForStep =
    Number.isFinite(qtyParsedForStep) && qtyParsedForStep > 0 ? qtyParsedForStep : 0;
  const qtyStepMinusDisabled = !Number.isFinite(qtyParsedForStep) || qtyParsedForStep <= 0.0001;
  const qtyStepPlusDisabled =
    draft.direction === "OUT" &&
    outAvailabilityHint !== null &&
    qtyNumForStep >= outAvailabilityHint - 1e-9;

  function patchDraft(p: Partial<MovementDraft>) {
    setMoveError(null);
    setDraft((d) => ({ ...d, ...p }));
  }

  function stepMovementQty(delta: 1 | -1) {
    const parsed = Number.parseFloat(draft.qty.trim());
    const minQty = 0.0001;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      if (delta > 0) {
        patchDraft({ qty: "1" });
      }
      return;
    }
    let next = parsed + delta;
    if (next < minQty) {
      next = minQty;
    }
    if (draft.direction === "OUT" && outAvailabilityHint !== null) {
      next = Math.min(next, outAvailabilityHint);
    }
    const rounded = Math.round(next * 10000) / 10000;
    patchDraft({
      qty: Number.isInteger(rounded) ? String(rounded) : String(rounded),
    });
  }

  function closeModal() {
    setModal("none");
    setEditingId(null);
    setPrevRow(null);
    setMoveError(null);
    setCreateDirectionLocked(false);
    setDraft(defaultMovementDraft());
  }

  function balanceAfterMovements(list: LedgerMovement[], itemId: string): number {
    return balanceForItem(list, itemId);
  }

  function openCreateWithDirection(direction: StockDirection) {
    setEditingId(null);
    setPrevRow(null);
    setMoveError(null);
    setDraft({ ...defaultMovementDraft(), direction });
    setCreateDirectionLocked(true);
    setModal("create");
  }

  function openEdit(row: LedgerMovement & { itemSku: string; itemName: string }) {
    setCreateDirectionLocked(false);
    setEditingId(row.id);
    setPrevRow({
      id: row.id,
      stockItemId: row.stockItemId,
      direction: row.direction,
      quantity: row.quantity,
      date: row.date,
      note: row.note,
    });
    setMoveError(null);
    setDraft({
      date: row.date,
      itemId: row.stockItemId,
      direction: row.direction,
      qty: String(row.quantity),
      note: row.note,
    });
    setModal("edit");
  }

  async function saveMovement() {
    const qty = Number.parseFloat(draft.qty);
    if (
      !draft.itemId ||
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !draft.note.trim()
    ) {
      return;
    }

    const item = items.find((s) => s.id === draft.itemId);
    if (!item) return;

    if (modal === "create") {
      const trialQty =
        draft.direction === "OUT"
          ? balanceForItem(movements, draft.itemId) - qty
          : balanceForItem(movements, draft.itemId) + qty;
      if (draft.direction === "OUT" && trialQty < 0) {
        setMoveError("OUT quantity is greater than the current balance for this item.");
        return;
      }
      await createStockMovementOnApi(draft.itemId, {
        direction: draft.direction,
        quantity: qty,
        note: draft.note.trim(),
      });
      await refresh();
    } else if (modal === "edit" && editingId && prevRow) {
      const updated: LedgerMovement = {
        id: editingId,
        stockItemId: draft.itemId,
        direction: draft.direction,
        quantity: qty,
        date: draft.date,
        note: draft.note.trim(),
      };
      const trial = movements.map((m) => (m.id === editingId ? updated : m));
      if (balanceAfterMovements(trial, draft.itemId) < 0) {
        setMoveError("This change would make balance negative. Reduce OUT or add IN first.");
        return;
      }
      setStore((prev) => ({
        ...prev,
        movements: prev.movements.map((m) => (m.id === editingId ? updated : m)),
      }));
    }
    closeModal();
  }

  const qtyInvalid =
    draft.qty.trim() === "" ||
    !Number.isFinite(Number.parseFloat(draft.qty)) ||
    Number.parseFloat(draft.qty) <= 0;
  const saveDisabled = !draft.itemId || qtyInvalid || !draft.note.trim();

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
        {items.map((s) => (
          <option key={s.id} value={s.id}>
            {s.sku} — {s.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <InvShell
      title="Stock in & out"
      description="Record every receipt as IN and every use, waste, or adjustment as OUT. Balance on the overview updates from these lines."
      primaryAction={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => openCreateWithDirection("IN")}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--pos-sb-base)" }}
          >
            <Plus className="size-4" strokeWidth={2.2} />
            Stock in
          </button>
          <button
            type="button"
            onClick={() => openCreateWithDirection("OUT")}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-solid border-[#c0392b]/55 bg-[rgba(192,57,43,0.08)] px-4 text-[12px] font-semibold text-[#9f3023] transition-colors hover:border-[#9f3023] hover:bg-[rgba(192,57,43,0.14)]"
          >
            <Minus className="size-4" strokeWidth={2.2} />
            Stock out
          </button>
        </div>
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
              placeholder="Search item, SKU, or note"
              className="h-9 w-full cursor-text rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] pl-9 pr-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)] focus:outline-none"
            />
          </label>
          <select
            value={dirFilter}
            onChange={(e) => setDirFilter(e.target.value as "All" | StockDirection)}
            className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)]"
          >
            <option value="All">All directions</option>
            <option value="IN">IN only</option>
            <option value="OUT">OUT only</option>
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
              {formatCount(filtered.length)}
            </div>
          </div>
          <div className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2">
            <div className="text-[11px] text-[var(--pos-text-2)]">Net qty (filtered)</div>
            <div className="text-[14px] font-semibold text-[var(--pos-text-1)]">
              {netChange >= 0 ? "+" : ""}
              {formatQty(netChange)}
            </div>
          </div>
        </div>
      }
      table={
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
              <tr className="border-b border-solid [border-color:var(--pos-divider)] text-left">
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Date</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">SKU</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Item</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Direction</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Qty</th>
                <th className="px-4 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]">Note</th>
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
                  <td className="px-4 py-2 text-[var(--pos-text-2)]">
                    {row.direction === "IN" ? (
                      <span className="font-semibold text-[#1d7f4e]">IN</span>
                    ) : (
                      <span className="font-semibold text-[#9f3023]">OUT</span>
                    )}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-[var(--pos-text-1)]">
                    {formatQty(row.quantity)}
                  </td>
                  <td className="px-4 py-2 text-[var(--pos-text-2)]">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
      drawer={
        modal !== "none" ? (
          <PosSideDrawer
            title={
              modal === "edit"
                ? "Edit movement"
                : createDirectionLocked && draft.direction === "IN"
                  ? "Stock in"
                  : createDirectionLocked && draft.direction === "OUT"
                    ? "Stock out"
                    : "Record movement"
            }
            subtitle={
              modal === "edit" && editingId ? (
                <p className="text-[11px] text-[var(--pos-text-2)]">Ref: {editingId}</p>
              ) : modal === "create" && createDirectionLocked ? (
                <p className="text-[11px] text-[var(--pos-text-2)]">
                  {draft.direction === "IN"
                    ? "Adds to on-hand quantity"
                    : "Removes from on-hand quantity"}
                </p>
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
                  onClick={saveMovement}
                  disabled={saveDisabled}
                  className={
                    modal === "create" && draft.direction === "OUT"
                      ? "h-9 cursor-pointer rounded-[9px] border border-solid border-[#c0392b]/55 bg-[#c0392b] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                      : "h-9 cursor-pointer rounded-[9px] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                  }
                  style={
                    modal === "create" && draft.direction === "OUT"
                      ? undefined
                      : { backgroundColor: "var(--pos-sb-base)" }
                  }
                >
                  {modal === "edit" ? "Save changes" : "Save"}
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              {moveError ? (
                <p className="rounded-[8px] border border-solid border-[#e74c3c]/40 bg-[#e74c3c]/10 px-3 py-2 text-[11px] text-[#9f3023]">
                  {moveError}
                </p>
              ) : null}
              {modal === "edit" ? (
                <p className="text-[11px] leading-relaxed text-[var(--pos-text-2)]">
                  IN increases balance; OUT decreases it. For OUT, quantity cannot exceed availability
                  for that item.
                </p>
              ) : null}

              {modal === "edit" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className={labelClass}>
                    Date
                    <input
                      type="date"
                      value={draft.date}
                      onChange={(e) => patchDraft({ date: e.target.value })}
                      className={dateInputClass}
                    />
                  </label>
                  <label className={labelClass}>
                    Direction
                    <select
                      value={draft.direction}
                      onChange={(e) =>
                        patchDraft({ direction: e.target.value as StockDirection, qty: "" })
                      }
                      className={selectClass}
                    >
                      <option value="IN">IN (stock in)</option>
                      <option value="OUT">OUT (stock out)</option>
                    </select>
                  </label>
                  <div className={`${labelClass} sm:col-span-2`}>{itemPicker}</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className={labelClass}>
                    Date
                    <input
                      type="date"
                      value={draft.date}
                      onChange={(e) => patchDraft({ date: e.target.value })}
                      className={dateInputClass}
                    />
                  </label>
                  {itemPicker}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
                <label className={labelClass}>
                  Quantity
                  <div className="mt-1 flex h-8 items-center justify-center gap-0.5 rounded-[7px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-0.5">
                    <button
                      type="button"
                      onClick={() => stepMovementQty(-1)}
                      disabled={qtyStepMinusDisabled}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full border border-solid [border-color:var(--pos-border-medium)] text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="size-3" strokeWidth={2} />
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={draft.qty}
                      onChange={(e) => patchDraft({ qty: e.target.value })}
                      className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-center font-mono text-[11px] text-[var(--pos-text-1)] [appearance:textfield] placeholder:text-[var(--pos-text-2)] focus:outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      placeholder="0"
                      min={0}
                    />
                    <button
                      type="button"
                      onClick={() => stepMovementQty(1)}
                      disabled={qtyStepPlusDisabled}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full border border-solid [border-color:var(--pos-border-medium)] text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Increase quantity"
                    >
                      <Plus className="size-3" strokeWidth={2} />
                    </button>
                  </div>
                  {draft.direction === "OUT" && draft.itemId && outAvailabilityHint !== null ? (
                    <span className="mt-1 block text-[10px] leading-snug text-[var(--pos-text-2)]">
                      Cannot exceed availability shown opposite.
                    </span>
                  ) : null}
                </label>
                {draft.itemId && draft.direction === "OUT" && outAvailabilityHint !== null ? (
                  <div
                    className="flex flex-col justify-center rounded-[9px] border border-solid border-[#c0392b]/30 bg-[rgba(192,57,43,0.06)] px-3 py-2 sm:min-h-[52px]"
                    aria-live="polite"
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[#9f3023]/90">
                      Available to remove
                    </span>
                    <span className="text-[18px] font-semibold tabular-nums text-[var(--pos-text-1)]">
                      {formatQty(outAvailabilityHint)}
                      {selectedItemUnit ? (
                        <span className="ml-1 text-[13px] font-medium text-[var(--pos-text-2)]">
                          {selectedItemUnit}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ) : draft.itemId && draft.direction === "IN" ? (
                  <div className="flex flex-col justify-center rounded-[9px] border border-solid border-[#1d7f4e]/25 bg-[rgba(31,162,92,0.06)] px-3 py-2 sm:min-h-[52px]">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[#1d7f4e]">
                      On hand now
                    </span>
                    <span className="text-[18px] font-semibold tabular-nums text-[var(--pos-text-1)]">
                      {formatQty(balanceForItem(movements, draft.itemId))}
                      {selectedItemUnit ? (
                        <span className="ml-1 text-[13px] font-medium text-[var(--pos-text-2)]">
                          {selectedItemUnit}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ) : (
                  <div className="hidden sm:block" aria-hidden />
                )}
              </div>

              <label className={labelClass}>
                Note
                <input
                  value={draft.note}
                  onChange={(e) => patchDraft({ note: e.target.value })}
                  className={inputClass}
                  placeholder={
                    draft.direction === "IN"
                      ? "Required — e.g. supplier invoice, delivery batch, market run"
                      : "Required — e.g. prep waste, spoilage, kitchen use, comps"
                  }
                />
              </label>
            </div>
          </PosSideDrawer>
        ) : null
      }
    />
  );
}
