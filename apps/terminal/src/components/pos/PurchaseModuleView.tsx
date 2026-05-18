import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Pencil,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";

/** Match ExpenseRecordsView layout: bordered card, calm header, filter strip, stats on page bg, scrollable table. */
const purchaseShell =
  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]";
const purchaseHead =
  "flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3";
const purchaseFilters =
  "flex flex-wrap items-center gap-2 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3";
const purchaseStats =
  "grid grid-cols-2 gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2 sm:grid-cols-4";
const purchaseStatCell =
  "rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2";
const purchaseSearchInput =
  "h-9 w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] pl-9 pr-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)] focus:outline-none";
const purchaseSelect =
  "h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)]";
const purchaseField =
  "mt-1 h-9 w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)]";
const purchaseLabel = "text-[11px] text-[var(--pos-text-2)]";
const purchaseTh = "px-4 py-2 text-left text-[11px] font-semibold text-[var(--pos-text-2)]";

export const PURCHASE_LEAF_IDS = new Set([
  "pu-ledger",
  "pu-suppliers",
  "pu-return",
]);

type Supplier = {
  id: string;
  name: string;
  /** Primary contact at the supplier (person name). */
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

type PurchaseLine = {
  id: string;
  description: string;
  qty: number;
  unit: string;
  unitCostCents: number;
};

type PurchaseOrder = {
  kind: "purchase";
  id: string;
  ref: string;
  supplierId: string;
  date: string;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  lines: PurchaseLine[];
};

type ReturnLine = {
  id: string;
  description: string;
  qty: number;
  unit: string;
  creditCents: number;
};

type PurchaseReturn = {
  kind: "return";
  id: string;
  ref: string;
  supplierId: string;
  linkedPurchaseId: string;
  date: string;
  reason: string;
  status: "draft" | "credited" | "cancelled";
  lines: ReturnLine[];
};

type StockMove = PurchaseOrder | PurchaseReturn;

/** Native `<select>` options for line unit; keep in sensible kitchen / purchasing order. */
const PURCHASE_UNIT_OPTIONS: readonly string[] = [
  "each",
  "case",
  "box",
  "bag",
  "kg",
  "g",
  "lb",
  "oz",
  "L",
  "mL",
  "pack",
  "dozen",
  "bottle",
  "can",
  "crate",
  "pair",
  "set",
  "roll",
];

function purchaseUnitSelectOptions(currentUnit: string): string[] {
  const t = currentUnit.trim();
  if (!t || PURCHASE_UNIT_OPTIONS.includes(t)) {
    return [...PURCHASE_UNIT_OPTIONS];
  }
  return [...PURCHASE_UNIT_OPTIONS, t];
}

type LedgerEntry = {
  id: string;
  supplierId: string;
  date: string;
  type: "invoice" | "payment" | "return_credit" | "adjustment";
  ref: string;
  memo: string;
  /** Positive: amount payable increases. Negative: payment or credit. */
  amountCents: number;
};

type Workspace = {
  suppliers: Supplier[];
  moves: StockMove[];
  ledger: LedgerEntry[];
  ledgerSupplierFilter: string;
  /** Supplier list → open ledger drawer on New bill with lines for this vendor. */
  ledgerInvoiceDrawerPrefillSupplierId: string | null;
};

function formatMoney(cents: number): string {
  const n = cents / 100;
  const sign = n < 0 ? "-" : "";
  return `${sign}৳${Math.abs(n).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Whole taka, no decimals — summary tiles only. */
function formatMoneyWholeTaka(cents: number): string {
  const n = Math.round(cents / 100);
  const sign = n < 0 ? "-" : "";
  return `${sign}৳${Math.abs(n).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextId(prefix: string, existing: string[]): string {
  const nums = existing
    .map((id) => {
      const m = id.match(new RegExp(`^${prefix}-(\\d+)$`));
      return m ? Number(m[1]) : 0;
    })
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

const initialWorkspace: Workspace = {
  suppliers: [],
  moves: [],
  ledger: [],
  ledgerSupplierFilter: "",
  ledgerInvoiceDrawerPrefillSupplierId: null,
};

let workspaceSnapshot: Workspace = structuredClone(initialWorkspace);
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function getWorkspace(): Workspace {
  return workspaceSnapshot;
}

function setWorkspace(updater: (w: Workspace) => Workspace) {
  workspaceSnapshot = updater(workspaceSnapshot);
  emit();
}

function subscribeWorkspace(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function useWorkspace(): Workspace {
  return useSyncExternalStore(subscribeWorkspace, getWorkspace, getWorkspace);
}

function supplierBalance(supplierId: string, ledger: LedgerEntry[]): number {
  return ledger
    .filter((e) => e.supplierId === supplierId)
    .reduce((s, e) => s + e.amountCents, 0);
}

function purchaseTotalCents(p: PurchaseOrder): number {
  return p.lines.reduce((s, l) => s + l.qty * l.unitCostCents, 0);
}

function linkedPurchaseForLedgerEntry(
  e: LedgerEntry,
  moves: StockMove[],
): PurchaseOrder | null {
  if (e.type !== "invoice") return null;
  const hit = moves.find(
    (m): m is PurchaseOrder =>
      m.kind === "purchase" && m.supplierId === e.supplierId && m.ref === e.ref,
  );
  return hit ?? null;
}

function linkedReturnForLedgerEntry(
  e: LedgerEntry,
  moves: StockMove[],
): PurchaseReturn | null {
  if (e.type !== "return_credit") return null;
  const hit = moves.find(
    (m): m is PurchaseReturn =>
      m.kind === "return" && m.supplierId === e.supplierId && m.ref === e.ref,
  );
  return hit ?? null;
}

function returnCreditTotalCents(r: PurchaseReturn): number {
  return r.lines.reduce((s, l) => s + l.creditCents, 0);
}

/** Right sheet: ledger row detail (purchase/return lines when linked). */
function LedgerDetailSlideOver({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex justify-end">
      <div className="min-w-0 flex-1" aria-hidden />
      <div
        className="pointer-events-auto flex h-full w-full max-w-[min(100vw,520px)] shrink-0 flex-col border-l border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-[-12px_0_40px_rgba(0,0,0,0.12)]"
        role="dialog"
        aria-modal="false"
        aria-labelledby="ledger-detail-slide-title"
      >
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <h2
              id="ledger-detail-slide-title"
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
      </div>
    </div>
  );
}

function LedgerEntryDetailContent({
  entry,
  moves,
  supplierLabel,
}: {
  entry: LedgerEntry;
  moves: StockMove[];
  supplierLabel: string;
}) {
  const po = linkedPurchaseForLedgerEntry(entry, moves);
  const ret = linkedReturnForLedgerEntry(entry, moves);

  if (po) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)]">
              Line items
            </p>
            <p className="mt-1 text-[12px] text-[var(--pos-text-2)]">
              {supplierLabel} · {po.date}
            </p>
            <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
              Status ·{" "}
              <span className="font-medium capitalize text-[var(--pos-text-1)]">{po.status}</span>
            </p>
          </div>
          <div className="text-right">
            <p className={purchaseLabel}>Document total</p>
            <p className="text-[15px] font-semibold tabular-nums text-[var(--pos-text-1)]">
              {formatMoney(purchaseTotalCents(po))}
            </p>
          </div>
        </div>
        {po.lines.length === 0 ? (
          <p className="text-[12px] text-[var(--pos-text-2)]">No line items on this purchase.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-solid [border-color:var(--pos-divider)]">
                  <th className={`${purchaseTh} pl-0`}>Description</th>
                  <th className={`${purchaseTh} text-right`}>Qty</th>
                  <th className={purchaseTh}>Unit</th>
                  <th className={`${purchaseTh} text-right`}>Unit price</th>
                  <th className={`${purchaseTh} pr-0 text-right`}>Line total</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((line) => {
                  const lineTotal = line.qty * line.unitCostCents;
                  return (
                    <tr
                      key={line.id}
                      className="border-b border-solid [border-color:var(--pos-divider)]"
                    >
                      <td className="max-w-[200px] px-0 py-2 font-medium text-[var(--pos-text-1)]">
                        {line.description}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--pos-text-1)]">
                        {line.qty}
                      </td>
                      <td className="px-2 py-2 text-[var(--pos-text-2)]">{line.unit}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--pos-text-1)]">
                        {formatMoney(line.unitCostCents)}
                      </td>
                      <td className="px-0 py-2 text-right tabular-nums font-medium text-[var(--pos-text-1)]">
                        {formatMoney(lineTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2.5">
          <p className={purchaseLabel}>Ledger memo</p>
          <p className="mt-1 text-[12px] text-[var(--pos-text-1)]">{entry.memo.trim() || "—"}</p>
        </div>
      </>
    );
  }

  if (ret) {
    const linkedPo = moves.find(
      (m): m is PurchaseOrder =>
        m.kind === "purchase" && m.id === ret.linkedPurchaseId,
    );
    return (
      <>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)]">
              Credit lines
            </p>
            <p className="mt-1 text-[12px] text-[var(--pos-text-2)]">
              {supplierLabel} · {ret.date}
            </p>
            <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
              Reason · <span className="text-[var(--pos-text-1)]">{ret.reason}</span>
            </p>
            <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
              Linked purchase ·{" "}
              <span className="font-mono text-[var(--pos-text-1)]">
                {linkedPo?.ref ?? ret.linkedPurchaseId}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
              Status ·{" "}
              <span className="font-medium capitalize text-[var(--pos-text-1)]">{ret.status}</span>
            </p>
          </div>
          <div className="text-right">
            <p className={purchaseLabel}>Credit total</p>
            <p className="text-[15px] font-semibold tabular-nums text-[var(--pos-text-1)]">
              {formatMoney(returnCreditTotalCents(ret))}
            </p>
          </div>
        </div>
        {ret.lines.length === 0 ? (
          <p className="text-[12px] text-[var(--pos-text-2)]">No credit lines.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-solid [border-color:var(--pos-divider)]">
                  <th className={`${purchaseTh} pl-0`}>Description</th>
                  <th className={`${purchaseTh} text-right`}>Qty</th>
                  <th className={purchaseTh}>Unit</th>
                  <th className={`${purchaseTh} pr-0 text-right`}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {ret.lines.map((line) => (
                  <tr key={line.id} className="border-b border-solid [border-color:var(--pos-divider)]">
                    <td className="max-w-[200px] px-0 py-2 font-medium text-[var(--pos-text-1)]">
                      {line.description}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--pos-text-1)]">
                      {line.qty}
                    </td>
                    <td className="px-2 py-2 text-[var(--pos-text-2)]">{line.unit}</td>
                    <td className="px-0 py-2 text-right tabular-nums font-medium text-[var(--pos-text-1)]">
                      {formatMoney(line.creditCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2.5">
          <p className={purchaseLabel}>Ledger line</p>
          <p className="mt-1 font-mono text-[12px] tabular-nums text-[var(--pos-text-1)]">
            {formatMoney(entry.amountCents)}
          </p>
        </div>
      </>
    );
  }

  return (
    <dl className="space-y-3 text-[12px]">
      <div>
        <dt className={purchaseLabel}>Supplier</dt>
        <dd className="mt-0.5 font-medium text-[var(--pos-text-1)]">{supplierLabel}</dd>
      </div>
      <div>
        <dt className={purchaseLabel}>Date</dt>
        <dd className="mt-0.5 text-[var(--pos-text-1)]">{entry.date}</dd>
      </div>
      <div>
        <dt className={purchaseLabel}>Reference</dt>
        <dd className="mt-0.5 font-mono text-[var(--pos-text-1)]">{entry.ref}</dd>
      </div>
      <div>
        <dt className={purchaseLabel}>Amount</dt>
        <dd className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-[var(--pos-text-1)]">
          {entry.amountCents >= 0 ? "+" : ""}
          {formatMoney(entry.amountCents)}
        </dd>
      </div>
      <div>
        <dt className={purchaseLabel}>Memo</dt>
        <dd className="mt-0.5 text-[var(--pos-text-1)]">{entry.memo.trim() || "—"}</dd>
      </div>
    </dl>
  );
}

function ModuleTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="min-w-0">
      <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">{title}</h1>
      <p className="text-[12px] text-[var(--pos-text-2)]">{subtitle}</p>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  type = "button",
  showPlus = true,
  disabled = false,
  size = "md",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  showPlus?: boolean;
  disabled?: boolean;
  size?: "md" | "sm";
}) {
  const h = size === "md" ? "h-10" : "h-9";
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex ${h} cursor-pointer items-center gap-2 rounded-[10px] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45`}
      style={{ backgroundColor: "var(--pos-sb-base)" }}
    >
      {showPlus ? <Plus className="size-4" strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-card)] px-3 text-[12px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-nav-hover)]/40"
    >
      {children}
    </button>
  );
}

function DangerGhostButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[8px] border border-solid border-[#c45a5a]/50 bg-[var(--pos-card)] px-2.5 py-1.5 text-[11px] font-medium text-[#8a3030] transition-colors hover:bg-[#f5e4e4]/80"
    >
      {children}
    </button>
  );
}


function ReturnPurchaseForm() {
  const ws = useWorkspace();
  const purchases = useMemo(
    () => ws.moves.filter((m): m is PurchaseOrder => m.kind === "purchase"),
    [ws.moves],
  );
  const [supplierId, setSupplierId] = useState(ws.suppliers[0]?.id ?? "");
  const [linkedPurchaseId, setLinkedPurchaseId] = useState(purchases[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayIso());
  const [lines, setLines] = useState<ReturnLine[]>([
    {
      id: "r1",
      description: "",
      qty: 1,
      unit: "each",
      creditCents: 0,
    },
  ]);

  const supplierName = useCallback(
    (id: string) => ws.suppliers.find((s) => s.id === id)?.name ?? id,
    [ws.suppliers],
  );

  const purchasesForSupplier = useMemo(
    () => purchases.filter((p) => p.supplierId === supplierId),
    [purchases, supplierId],
  );

  const addLine = useCallback(() => {
    setLines((L) => [
      ...L,
      {
        id: `r-${Date.now()}`,
        description: "",
        qty: 1,
        unit: "each",
        creditCents: 0,
      },
    ]);
  }, []);

  const totalCredit = useMemo(() => lines.reduce((s, l) => s + l.creditCents, 0), [lines]);

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!supplierId || !linkedPurchaseId) return;
      const okLines = lines.filter((l) => l.description.trim());
      if (!okLines.length) return;
      setWorkspace((w) => {
        const ids = w.moves.filter((m) => m.kind === "return").map((m) => m.id);
        const id = nextId("pr", ids);
        const ref = `PR-${date.replace(/-/g, "")}-${String(ids.length + 1).padStart(3, "0")}`;
        const ret: PurchaseReturn = {
          kind: "return",
          id,
          ref,
          supplierId,
          linkedPurchaseId,
          date,
          reason: reason.trim() || "—",
          status: "draft",
          lines: okLines.map((l) => ({
            ...l,
            unit: l.unit.trim() || "each",
          })),
        };
        const led: LedgerEntry = {
          id: nextId(
            "lg",
            w.ledger.map((x) => x.id),
          ),
          supplierId,
          date,
          type: "return_credit",
          ref,
          memo: reason.trim() || "Supplier return",
          amountCents: -okLines.reduce((s, l) => s + l.creditCents, 0),
        };
        return {
          ...w,
          moves: [ret, ...w.moves],
          ledger: [led, ...w.ledger],
        };
      });
      setReason("");
      setLines([
        {
          id: `r-${Date.now()}`,
          description: "",
          qty: 1,
          unit: "each",
          creditCents: 0,
        },
      ]);
    },
    [supplierId, linkedPurchaseId, reason, date, lines],
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-[11px] text-[var(--pos-text-2)]">
        <span className="font-medium text-[var(--pos-text-1)]">Total</span> = qty × unit credit. Set{" "}
        <span className="font-medium text-[var(--pos-text-1)]">Unit</span> (case, box, kg…) to match the purchase.
        Pick a supplier with a purchase.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={purchaseLabel}>Supplier</span>
          <select
            value={supplierId}
            onChange={(e) => {
              const v = e.target.value;
              setSupplierId(v);
              const firstPo = purchases.find((p) => p.supplierId === v);
              setLinkedPurchaseId(firstPo?.id ?? "");
            }}
            required
            className={purchaseField}
          >
            {ws.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={purchaseLabel}>Link to purchase</span>
          <select
            value={linkedPurchaseId}
            onChange={(e) => setLinkedPurchaseId(e.target.value)}
            required
            className={purchaseField}
          >
            {purchasesForSupplier.length === 0 ? (
              <option value="">No purchase for this supplier</option>
            ) : (
              purchasesForSupplier.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.ref} · {p.date} · {formatMoney(purchaseTotalCents(p))}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={purchaseLabel}>Reason / memo</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why items are going back"
            className={`${purchaseField} placeholder:text-[var(--pos-text-2)]`}
          />
        </label>
        <label className="block">
          <span className={purchaseLabel}>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={purchaseField}
          />
        </label>
      </div>

      <div className="border-t border-solid [border-color:var(--pos-divider)] pt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className={purchaseLabel}>Credit lines</span>
          <GhostButton type="button" onClick={addLine}>
            Add line
          </GhostButton>
        </div>
        <div className="space-y-2 overflow-auto">
          <div
            className="grid min-w-[700px] grid-cols-[1fr_64px_104px_104px_104px_36px] gap-2 px-2"
            aria-hidden
          >
            <span className={purchaseLabel}>Description</span>
            <span className={purchaseLabel}>Qty</span>
            <span className={purchaseLabel}>Unit</span>
            <span className={`${purchaseLabel} text-right`}>Unit credit (৳)</span>
            <span className={`${purchaseLabel} text-right`}>Total (৳)</span>
            <span className="sr-only">Remove line</span>
          </div>
          {lines.map((line, idx) => {
            const unitCreditTaka =
              line.qty > 0 ? line.creditCents / line.qty / 100 : 0;
            return (
            <div
              key={line.id}
              className="grid min-w-[700px] grid-cols-[1fr_64px_104px_104px_104px_36px] gap-2 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-2"
            >
              <input
                value={line.description}
                onChange={(e) =>
                  setLines((L) =>
                    L.map((x) =>
                      x.id === line.id ? { ...x, description: e.target.value } : x,
                    ),
                  )
                }
                placeholder="Item / lot"
                className={`${purchaseField} !mt-0`}
                aria-label="Description"
              />
              <input
                type="number"
                min={1}
                value={line.qty}
                onChange={(e) =>
                  setLines((L) =>
                    L.map((x) => {
                      if (x.id !== line.id) return x;
                      const oldQty = x.qty;
                      const newQty = Math.max(1, Number(e.target.value) || 1);
                      if (oldQty <= 0) return { ...x, qty: newQty };
                      const nextCredit = Math.round((x.creditCents / oldQty) * newQty);
                      return { ...x, qty: newQty, creditCents: nextCredit };
                    }),
                  )
                }
                className={`${purchaseField} !mt-0`}
                aria-label="Quantity"
              />
              <select
                value={line.unit.trim() || "each"}
                onChange={(e) =>
                  setLines((L) =>
                    L.map((x) =>
                      x.id === line.id ? { ...x, unit: e.target.value } : x,
                    ),
                  )
                }
                className={`${purchaseSelect} mt-0 h-9 w-full min-w-0`}
                aria-label="Unit"
              >
                {purchaseUnitSelectOptions(line.unit).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={0.01}
                value={unitCreditTaka}
                onChange={(e) =>
                  setLines((L) =>
                    L.map((x) =>
                      x.id === line.id
                        ? {
                            ...x,
                            creditCents:
                              Math.round((Number(e.target.value) || 0) * 100) * x.qty,
                          }
                        : x,
                    ),
                  )
                }
                className={`${purchaseField} !mt-0 font-mono`}
                aria-label="Unit credit in taka"
              />
              <div
                className="flex h-9 items-center justify-end font-mono text-[12px] tabular-nums text-[var(--pos-text-1)]"
                aria-label="Line credit total"
              >
                {formatMoney(line.creditCents)}
              </div>
              <button
                type="button"
                onClick={() => setLines((L) => L.filter((x) => x.id !== line.id))}
                disabled={lines.length <= 1}
                className="flex items-center justify-center rounded-[9px] text-[var(--pos-text-2)] hover:bg-[var(--pos-card)] hover:text-[#8a3030] disabled:opacity-30"
                aria-label={`Remove return line ${idx + 1}`}
              >
                <Trash2 className="size-4" strokeWidth={2} />
              </button>
            </div>
            );
          })}
        </div>
        <p className="mt-3 text-right text-[12px] font-medium text-[var(--pos-text-1)]">
          Credit total · <span className="font-mono tabular-nums">{formatMoney(totalCredit)}</span>
        </p>
      </div>

      {purchasesForSupplier.length === 0 ? (
        <p className="text-[12px] text-[var(--pos-text-2)]">
          No purchases for {supplierName(supplierId)}. Add a bill with line items from Supplier
          ledger first, then record the return.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <PrimaryButton type="submit" disabled={!linkedPurchaseId}>
          Save return
        </PrimaryButton>
      </div>
    </form>
  );
}

function SupplierReturnView() {
  return (
    <div className={purchaseShell}>
      <div className={purchaseHead}>
        <ModuleTitle
          title="Supplier return"
          subtitle="Link to a purchase you recorded in the ledger, then log credits. They also appear in Bills & payments."
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <ReturnPurchaseForm />
      </div>
    </div>
  );
}

function SupplierListView() {
  const ws = useWorkspace();
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Supplier>>({});

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = ws.suppliers;
    if (t) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(t) ||
          s.contactPerson.toLowerCase().includes(t) ||
          s.email.toLowerCase().includes(t) ||
          s.phone.includes(t),
      );
    }
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [ws.suppliers, q]);

  const startCreate = useCallback(() => {
    const id = `v-${Date.now()}`;
    setDraft({
      id,
      name: "",
      contactPerson: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
    });
    setEditingId(id);
  }, []);

  const startEdit = useCallback((s: Supplier) => {
    setEditingId(s.id);
    setDraft({ ...s });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft({});
  }, []);

  const saveSupplier = useCallback(() => {
    if (!draft.name?.trim() || !draft.id) return;
    const row: Supplier = {
      id: draft.id,
      name: draft.name.trim(),
      contactPerson: draft.contactPerson?.trim() ?? "",
      phone: draft.phone?.trim() ?? "",
      email: draft.email?.trim() ?? "",
      address: draft.address?.trim() ?? "",
      notes: draft.notes?.trim() ?? "",
    };
    setWorkspace((w) => {
      const exists = w.suppliers.some((s) => s.id === row.id);
      return {
        ...w,
        suppliers: exists
          ? w.suppliers.map((s) => (s.id === row.id ? row : s))
          : [...w.suppliers, row],
      };
    });
    cancelEdit();
  }, [draft, cancelEdit]);

  const openLedger = useCallback((supplierId: string) => {
    setWorkspace((w) => ({
      ...w,
      ledgerSupplierFilter: supplierId,
    }));
    window.dispatchEvent(
      new CustomEvent("pos-select-leaf", { detail: { leafId: "pu-ledger" } }),
    );
  }, []);

  const startNewPurchaseFor = useCallback((supplierId: string) => {
    setWorkspace((w) => ({
      ...w,
      ledgerSupplierFilter: supplierId,
      ledgerInvoiceDrawerPrefillSupplierId: supplierId,
    }));
    window.dispatchEvent(
      new CustomEvent("pos-select-leaf", { detail: { leafId: "pu-ledger" } }),
    );
  }, []);

  const isForm = editingId !== null;
  const openPayableCount = ws.suppliers.filter(
    (s) => supplierBalance(s.id, ws.ledger) > 0,
  ).length;

  return (
    <div className={purchaseShell}>
      <div className={purchaseHead}>
        <ModuleTitle
          title="Suppliers"
          subtitle="Directory for everyone you buy from. Balances come from Bills & payments."
        />
        <PrimaryButton type="button" onClick={startCreate}>
          Add supplier
        </PrimaryButton>
      </div>

      <div className={purchaseFilters}>
        <label className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pos-text-2)]"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, contact, email, phone…"
            className={purchaseSearchInput}
            aria-label="Filter suppliers"
          />
        </label>
        <div className="ml-auto text-[11px] text-[var(--pos-text-2)]">
          Showing{" "}
          <span className="font-semibold text-[var(--pos-text-1)]">{rows.length}</span> suppliers
        </div>
      </div>

      <div className={`${purchaseStats} sm:grid-cols-2`}>
        <div className={purchaseStatCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">On file</div>
          <div className="mt-0.5 text-[14px] font-semibold text-[var(--pos-text-1)]">
            {ws.suppliers.length}
          </div>
        </div>
        <div className={purchaseStatCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">With open payable</div>
          <div className="mt-0.5 text-[14px] font-semibold text-[var(--pos-text-1)]">
            {openPayableCount}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
            <tr className="border-b border-solid [border-color:var(--pos-divider)]">
              <th className={purchaseTh}>Name</th>
              <th className={purchaseTh}>Contact</th>
              <th className={`${purchaseTh} text-right`}>Payable</th>
              <th className={`${purchaseTh} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-[12px] text-[var(--pos-text-2)]"
                >
                  No suppliers match. Add one or clear the search.
                </td>
              </tr>
            ) : (
              rows.map((s) => {
                const bal = supplierBalance(s.id, ws.ledger);
                return (
                  <tr
                    key={s.id}
                    className="border-b border-solid [border-color:var(--pos-divider)] transition-colors hover:bg-[var(--pos-nav-hover)]/35"
                  >
                    <td className="px-4 py-2">
                      <p className="font-medium text-[var(--pos-text-1)]">{s.name}</p>
                      <p className="mt-0.5 max-w-[280px] truncate text-[11px] text-[var(--pos-text-2)]">
                        {s.address || "—"}
                      </p>
                    </td>
                    <td className="max-w-[220px] px-4 py-2 text-[11px] text-[var(--pos-text-2)]">
                      {s.contactPerson ? (
                        <div className="mb-0.5 truncate font-medium text-[var(--pos-text-1)]">
                          {s.contactPerson}
                        </div>
                      ) : null}
                      <div className="truncate">{s.phone}</div>
                      <div className="truncate">{s.email}</div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--pos-text-1)]">
                      {formatMoney(bal)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <GhostButton onClick={() => startEdit(s)}>
                          <span className="inline-flex items-center gap-1">
                            <Pencil className="size-3.5" strokeWidth={2} />
                            Edit
                          </span>
                        </GhostButton>
                        <GhostButton onClick={() => openLedger(s.id)}>
                          <span className="inline-flex items-center gap-1">
                            <Receipt className="size-3.5" strokeWidth={2} />
                            Bills
                          </span>
                        </GhostButton>
                        <GhostButton onClick={() => startNewPurchaseFor(s.id)}>
                          <span className="inline-flex items-center gap-1">
                            <ShoppingCart className="size-3.5" strokeWidth={2} />
                            Add bill
                          </span>
                        </GhostButton>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isForm ? (
        <LedgerDrawerFrame
          title={
            ws.suppliers.some((s) => s.id === draft.id) ? "Edit supplier" : "New supplier"
          }
          titleId="supplier-drawer-title"
          subtitle={
            draft.id ? (
              <p className="text-[11px] font-mono text-[var(--pos-text-2)]">{draft.id}</p>
            ) : null
          }
          onClose={cancelEdit}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] px-3 text-[12px] text-[var(--pos-text-1)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveSupplier}
                className="h-9 cursor-pointer rounded-[9px] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                style={{ backgroundColor: "var(--pos-sb-base)" }}
                disabled={!draft.name?.trim()}
              >
                Save
              </button>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={purchaseLabel}>Name</span>
              <input
                value={draft.name ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className={purchaseField}
                required
                autoFocus
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={purchaseLabel}>Contact person</span>
              <input
                value={draft.contactPerson ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, contactPerson: e.target.value }))}
                placeholder="Who to call or email about orders"
                className={`${purchaseField} placeholder:text-[var(--pos-text-2)]`}
              />
            </label>
            <label className="block">
              <span className={purchaseLabel}>Phone</span>
              <input
                value={draft.phone ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                className={purchaseField}
              />
            </label>
            <label className="block">
              <span className={purchaseLabel}>Email</span>
              <input
                value={draft.email ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                className={purchaseField}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={purchaseLabel}>Address</span>
              <input
                value={draft.address ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                className={purchaseField}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={purchaseLabel}>Notes</span>
              <textarea
                value={draft.notes ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                rows={2}
                className="mt-1 min-h-[72px] w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 py-2 text-[12px] text-[var(--pos-text-1)]"
              />
            </label>
          </div>
        </LedgerDrawerFrame>
      ) : null}
    </div>
  );
}

/** Plain-language labels for staff who don’t think in “ledger” terms. */
function ledgerKindForDisplay(t: LedgerEntry["type"]): string {
  switch (t) {
    case "invoice":
      return "New bill";
    case "payment":
      return "Payment";
    case "return_credit":
      return "Return credit";
    case "adjustment":
      return "Correction";
    default:
      return t;
  }
}

function ledgerRowDetails(e: LedgerEntry): string {
  const memo = e.memo.trim();
  if (memo && e.ref) return `${e.ref} · ${memo}`;
  return e.ref || memo || "—";
}

const LEDGER_PAYMENT_METHODS = [
  "Card",
  "Cash",
  "Bank Transfer",
  "Mobile Banking",
] as const;

const LEDGER_DRAWER_KINDS: { value: LedgerEntry["type"]; label: string }[] = [
  { value: "invoice", label: "New bill (line items)" },
  { value: "payment", label: "Payment" },
  { value: "return_credit", label: "Return credit" },
  { value: "adjustment", label: "Correction" },
];

type LedgerEntryDraft = {
  supplierId: string;
  date: string;
  kind: LedgerEntry["type"];
  amount: string;
  method: (typeof LEDGER_PAYMENT_METHODS)[number];
  notes: string;
  invoiceRefDraft: string;
  invoiceLines: PurchaseLine[];
};

function defaultLedgerEntryDraft(prefillSupplierId: string): LedgerEntryDraft {
  return {
    supplierId: prefillSupplierId,
    date: todayIso(),
    kind: "invoice",
    amount: "",
    method: LEDGER_PAYMENT_METHODS[0],
    notes: "",
    invoiceRefDraft: "",
    invoiceLines: [
      { id: "nl-1", description: "", qty: 1, unit: "each", unitCostCents: 0 },
    ],
  };
}

function paymentMemoFromDraft(d: LedgerEntryDraft): string {
  const n = d.notes.trim();
  if (n) return `${d.method} · ${n}`;
  return d.method;
}

function ledgerRefForKind(kind: LedgerEntry["type"]): string {
  const tail = Date.now().toString(36).toUpperCase().slice(-6);
  switch (kind) {
    case "payment":
      return `PV-${tail}`;
    case "invoice":
      return `PO-${tail}`;
    case "return_credit":
      return `PR-${tail}`;
    case "adjustment":
      return `ADJ-${tail}`;
    default:
      return `LG-${tail}`;
  }
}

function memoFromLedgerDraft(d: LedgerEntryDraft): string {
  const notes = d.notes.trim();
  if (d.kind === "invoice") {
    const parts = d.invoiceLines
      .filter((l) => l.description.trim())
      .map((l) => `${l.description.trim()} ×${l.qty} ${l.unit.trim() || "each"}`);
    if (notes && parts.length) return `${notes} · ${parts.join("; ")}`;
    return notes || parts.join("; ") || "Purchase";
  }
  switch (d.kind) {
    case "payment":
      return paymentMemoFromDraft(d);
    case "return_credit":
      return notes || "Return credit";
    case "adjustment":
      return notes || "Correction";
    default:
      return notes || "—";
  }
}

function amountCentsFromLedgerDraft(d: LedgerEntryDraft): number | null {
  if (d.kind === "invoice") {
    const ok = d.invoiceLines.filter((l) => l.description.trim());
    if (!ok.length) return null;
    const total = ok.reduce((s, l) => s + l.qty * l.unitCostCents, 0);
    return total > 0 ? total : null;
  }
  const n = Number.parseFloat(d.amount);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  switch (d.kind) {
    case "payment":
    case "return_credit":
      if (cents <= 0) return null;
      return -cents;
    case "adjustment":
      if (cents === 0) return null;
      return cents;
    default:
      return null;
  }
}

/** Same right drawer shell as Other expenses (`ExpenseModalFrame`). */
function LedgerDrawerFrame({
  title,
  subtitle,
  children,
  footer,
  onClose,
  titleId,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  titleId: string;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex justify-end">
      <div className="min-w-0 flex-1" aria-hidden />
      <div
        className="pointer-events-auto flex h-full w-full max-w-[min(100vw,600px)] shrink-0 flex-col border-l border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-[-12px_0_40px_rgba(0,0,0,0.12)]"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
      >
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <h2
              id={titleId}
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

function SupplierLedgerView() {
  const ws = useWorkspace();
  const filter = ws.ledgerSupplierFilter;
  const [ledgerDrawerOpen, setLedgerDrawerOpen] = useState(false);
  const [ledgerDraft, setLedgerDraft] = useState<LedgerEntryDraft>(() =>
    defaultLedgerEntryDraft(""),
  );
  const [ledgerSearchQ, setLedgerSearchQ] = useState("");
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<"all" | LedgerEntry["type"]>("all");
  const [ledgerDateFrom, setLedgerDateFrom] = useState("");
  const [ledgerDateTo, setLedgerDateTo] = useState("");
  const [selectedLedgerEntryId, setSelectedLedgerEntryId] = useState<string | null>(null);

  const selectedLedgerEntry = useMemo(
    () => ws.ledger.find((e) => e.id === selectedLedgerEntryId) ?? null,
    [ws.ledger, selectedLedgerEntryId],
  );

  useEffect(() => {
    if (
      selectedLedgerEntryId &&
      !ws.ledger.some((e) => e.id === selectedLedgerEntryId)
    ) {
      setSelectedLedgerEntryId(null);
    }
  }, [ws.ledger, selectedLedgerEntryId]);

  useEffect(() => {
    const sid = ws.ledgerInvoiceDrawerPrefillSupplierId;
    if (!sid) return;
    if (!getWorkspace().suppliers.some((s) => s.id === sid)) {
      setWorkspace((w) => ({ ...w, ledgerInvoiceDrawerPrefillSupplierId: null }));
      return;
    }
    setLedgerDraft({
      ...defaultLedgerEntryDraft(sid),
      kind: "invoice",
    });
    setLedgerDrawerOpen(true);
    setWorkspace((w) => ({ ...w, ledgerInvoiceDrawerPrefillSupplierId: null }));
  }, [ws.ledgerInvoiceDrawerPrefillSupplierId]);

  const supplierName = useCallback(
    (id: string) => ws.suppliers.find((s) => s.id === id)?.name ?? id,
    [ws.suppliers],
  );

  const entries = useMemo(() => {
    let e = ws.ledger.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    if (filter) e = e.filter((x) => x.supplierId === filter);
    if (ledgerTypeFilter !== "all") {
      e = e.filter((x) => x.type === ledgerTypeFilter);
    }
    const q = ledgerSearchQ.trim().toLowerCase();
    if (q) {
      e = e.filter((x) => {
        const kindLabel = ledgerKindForDisplay(x.type).toLowerCase();
        return (
          x.ref.toLowerCase().includes(q) ||
          x.memo.toLowerCase().includes(q) ||
          supplierName(x.supplierId).toLowerCase().includes(q) ||
          x.type.includes(q) ||
          kindLabel.includes(q)
        );
      });
    }
    if (ledgerDateFrom) e = e.filter((x) => x.date >= ledgerDateFrom);
    if (ledgerDateTo) e = e.filter((x) => x.date <= ledgerDateTo);
    return e;
  }, [
    ws.ledger,
    filter,
    ledgerTypeFilter,
    ledgerSearchQ,
    ledgerDateFrom,
    ledgerDateTo,
    supplierName,
  ]);

  /** Running balance after each line, in date order — only when one supplier is selected. */
  const balanceAfterByEntryId = useMemo(() => {
    if (!filter) return null;
    const chron = ws.ledger
      .filter((x) => x.supplierId === filter)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const map = new Map<string, number>();
    let run = 0;
    for (const row of chron) {
      run += row.amountCents;
      map.set(row.id, run);
    }
    return map;
  }, [ws.ledger, filter]);

  const runningBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of ws.suppliers) {
      map.set(s.id, supplierBalance(s.id, ws.ledger));
    }
    return map;
  }, [ws.suppliers, ws.ledger]);

  /** Payable when all suppliers = sum of positive balances; one supplier = net balance (may be negative). */
  const dueCents = useMemo(() => {
    if (filter) return runningBySupplier.get(filter) ?? 0;
    let sumPositive = 0;
    for (const s of ws.suppliers) {
      const b = runningBySupplier.get(s.id) ?? 0;
      if (b > 0) sumPositive += b;
    }
    return sumPositive;
  }, [filter, ws.suppliers, runningBySupplier]);

  const ledgerEntriesViewStats = useMemo(() => {
    let billsAddedCents = 0;
    let paidOutCents = 0;
    for (const e of entries) {
      if (e.type === "invoice") billsAddedCents += e.amountCents;
      else if (e.type === "payment" || e.type === "return_credit") paidOutCents += -e.amountCents;
    }
    return { billsAddedCents, paidOutCents };
  }, [entries]);

  const hasActiveLedgerFilters =
    ledgerSearchQ.trim() !== "" ||
    ledgerTypeFilter !== "all" ||
    ledgerDateFrom !== "" ||
    ledgerDateTo !== "";

  const clearLedgerFilters = useCallback(() => {
    setLedgerSearchQ("");
    setLedgerTypeFilter("all");
    setLedgerDateFrom("");
    setLedgerDateTo("");
  }, []);

  function patchLedgerDraft(patch: Partial<LedgerEntryDraft>) {
    setLedgerDraft((d) => ({ ...d, ...patch }));
  }

  function openLedgerDrawer() {
    const initial = filter || ws.suppliers[0]?.id || "";
    setLedgerDraft(defaultLedgerEntryDraft(initial));
    setLedgerDrawerOpen(true);
  }

  function closeLedgerDrawer() {
    setLedgerDrawerOpen(false);
    setLedgerDraft(defaultLedgerEntryDraft(""));
  }

  const saveLedgerFromDrawer = useCallback(() => {
    const supplierId = ledgerDraft.supplierId;
    if (!supplierId) return;

    if (ledgerDraft.kind === "invoice") {
      const okLines = ledgerDraft.invoiceLines.filter((l) => l.description.trim());
      if (!okLines.length) return;
      const total = okLines.reduce((s, l) => s + l.qty * l.unitCostCents, 0);
      if (total <= 0) return;

      setWorkspace((w) => {
        const poIds = w.moves.filter((m) => m.kind === "purchase").map((m) => m.id);
        const date = ledgerDraft.date;
        const ref =
          ledgerDraft.invoiceRefDraft.trim() ||
          `PO-${date.replace(/-/g, "")}-${String(poIds.length + 1).padStart(3, "0")}`;
        const id = nextId("po", poIds);
        const po: PurchaseOrder = {
          kind: "purchase",
          id,
          ref,
          supplierId,
          date,
          status: "draft",
          lines: okLines.map((l) => ({
            ...l,
            unit: l.unit.trim() || "each",
            id: l.id.startsWith("nl-") ? `l-${l.id}` : l.id,
          })),
        };
        const inv: LedgerEntry = {
          id: nextId("lg", w.ledger.map((x) => x.id)),
          supplierId,
          date,
          type: "invoice",
          ref,
          memo: memoFromLedgerDraft(ledgerDraft),
          amountCents: total,
        };
        return {
          ...w,
          moves: [po, ...w.moves],
          ledger: [inv, ...w.ledger],
        };
      });
      setLedgerDrawerOpen(false);
      setLedgerDraft(defaultLedgerEntryDraft(""));
      return;
    }

    const amountCents = amountCentsFromLedgerDraft(ledgerDraft);
    if (amountCents === null) return;
    const kind = ledgerDraft.kind;
    setWorkspace((w) => ({
      ...w,
      ledger: [
        {
          id: nextId("lg", w.ledger.map((x) => x.id)),
          supplierId,
          date: ledgerDraft.date,
          type: kind,
          ref: ledgerRefForKind(kind),
          memo: memoFromLedgerDraft(ledgerDraft),
          amountCents,
        },
        ...w.ledger,
      ],
    }));
    setLedgerDrawerOpen(false);
    setLedgerDraft(defaultLedgerEntryDraft(""));
  }, [ledgerDraft]);

  const removeEntry = useCallback((id: string) => {
    if (!window.confirm("Remove this line? Only do this if it was entered by mistake.")) return;
    setWorkspace((w) => ({ ...w, ledger: w.ledger.filter((e) => e.id !== id) }));
  }, []);

  const isLedgerSaveDisabled = (() => {
    if (!ledgerDraft.supplierId) return true;
    if (ledgerDraft.kind === "invoice") {
      return amountCentsFromLedgerDraft(ledgerDraft) === null;
    }
    if (!ledgerDraft.amount.trim()) return true;
    return amountCentsFromLedgerDraft(ledgerDraft) === null;
  })();

  return (
    <div className={purchaseShell}>
      <div className={purchaseHead}>
        <ModuleTitle
          title="Bills & payments"
          subtitle="New bills: add line items here (same as a purchase). Log payments, return credits, and corrections. Filter the register; pick one supplier for running balance."
        />
        <button
          type="button"
          onClick={openLedgerDrawer}
          disabled={ws.suppliers.length === 0}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          style={{ backgroundColor: "var(--pos-sb-base)" }}
        >
          <Plus className="size-4" strokeWidth={2.2} />
          Add entry
        </button>
      </div>

      <div className={`${purchaseFilters} items-end`}>
        <label className="block min-w-[200px] flex-1 sm:max-w-sm">
          <span className={purchaseLabel}>Search</span>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pos-text-2)]"
              strokeWidth={2}
              aria-hidden
            />
            <input
              type="search"
              value={ledgerSearchQ}
              onChange={(e) => setLedgerSearchQ(e.target.value)}
              placeholder="Ref, memo, supplier, type…"
              className={purchaseSearchInput}
              aria-label="Search ledger"
            />
          </div>
        </label>
        <label className="block min-w-[180px] max-w-[220px] flex-1">
          <span className={purchaseLabel}>Supplier</span>
          <select
            value={filter}
            onChange={(e) =>
              setWorkspace((w) => ({ ...w, ledgerSupplierFilter: e.target.value }))
            }
            className={purchaseField}
            aria-label="Filter by supplier"
          >
            <option value="">All suppliers</option>
            {ws.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · due {formatMoney(runningBySupplier.get(s.id) ?? 0)}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[140px] max-w-[180px]">
          <span className={purchaseLabel}>Entry type</span>
          <select
            value={ledgerTypeFilter}
            onChange={(e) =>
              setLedgerTypeFilter(e.target.value as "all" | LedgerEntry["type"])
            }
            className={purchaseField}
            aria-label="Filter by entry type"
          >
            <option value="all">All types</option>
            <option value="invoice">New bill</option>
            <option value="payment">Payment</option>
            <option value="return_credit">Return credit</option>
            <option value="adjustment">Correction</option>
          </select>
        </label>
        <label className="block min-w-[132px] max-w-[160px]">
          <span className={purchaseLabel}>From</span>
          <input
            type="date"
            value={ledgerDateFrom}
            onChange={(e) => setLedgerDateFrom(e.target.value)}
            className={purchaseField}
            aria-label="From date"
          />
        </label>
        <label className="block min-w-[132px] max-w-[160px]">
          <span className={purchaseLabel}>To</span>
          <input
            type="date"
            value={ledgerDateTo}
            onChange={(e) => setLedgerDateTo(e.target.value)}
            className={purchaseField}
            aria-label="To date"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {hasActiveLedgerFilters ? (
            <GhostButton type="button" onClick={clearLedgerFilters}>
              Clear filters
            </GhostButton>
          ) : null}
          <div className="text-[11px] text-[var(--pos-text-2)]">
            <span className="font-semibold text-[var(--pos-text-1)]">{entries.length}</span>{" "}
            {entries.length === 1 ? "line" : "lines"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2 sm:grid-cols-3">
        <div className={purchaseStatCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">
            {filter ? "Balance" : "Payable total"}
          </div>
          <div className="mt-0.5 text-[14px] font-semibold text-[var(--pos-text-1)]">
            {formatMoneyWholeTaka(dueCents)}
          </div>
        </div>
        <div className={purchaseStatCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Bills in view</div>
          <div className="mt-0.5 text-[14px] font-semibold text-[var(--pos-text-1)]">
            {formatMoneyWholeTaka(ledgerEntriesViewStats.billsAddedCents)}
          </div>
        </div>
        <div className={purchaseStatCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Paid out (view)</div>
          <div className="mt-0.5 text-[14px] font-semibold text-[var(--pos-text-1)]">
            {formatMoneyWholeTaka(ledgerEntriesViewStats.paidOutCents)}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
            <tr className="border-b border-solid [border-color:var(--pos-divider)]">
              <th className={purchaseTh}>Date</th>
              <th className={purchaseTh}>Supplier</th>
              <th className={purchaseTh}>Entry type</th>
              <th className={purchaseTh}>Details</th>
              <th className={`${purchaseTh} text-right`}>Due</th>
              {filter ? (
                <th className={`${purchaseTh} text-right`}>Balance after</th>
              ) : null}
              <th className={`${purchaseTh} text-right`}> </th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan={filter ? 7 : 6}
                  className="px-4 py-10 text-center text-[12px] text-[var(--pos-text-2)]"
                >
                  {ws.ledger.length === 0
                    ? "No activity yet."
                    : "No entries match your filters — adjust search, supplier, type, or dates."}
                </td>
              </tr>
            ) : (
              entries.map((e) => {
                const rowOpen = selectedLedgerEntryId === e.id;
                return (
                  <tr
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setSelectedLedgerEntryId((prev) => (prev === e.id ? null : e.id))
                    }
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        setSelectedLedgerEntryId((prev) => (prev === e.id ? null : e.id));
                      }
                    }}
                    aria-expanded={rowOpen}
                    aria-label={`${ledgerKindForDisplay(e.type)}, ${e.ref}, show details`}
                    className={`cursor-pointer border-b border-solid [border-color:var(--pos-divider)] transition-colors hover:bg-[var(--pos-nav-hover)]/35 ${
                      rowOpen ? "bg-[var(--pos-nav-hover)]/50" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--pos-text-2)]">
                      {e.date}
                    </td>
                    <td className="max-w-[140px] truncate px-4 py-2 font-medium text-[var(--pos-text-1)]">
                      {supplierName(e.supplierId)}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex rounded-full bg-[var(--pos-nav-hover)]/50 px-2 py-0.5 text-[10px] font-semibold text-[var(--pos-text-2)]">
                        {ledgerKindForDisplay(e.type)}
                      </span>
                    </td>
                    <td
                      className="max-w-[240px] truncate px-4 py-2 text-[11px] text-[var(--pos-text-2)]"
                      title={ledgerRowDetails(e)}
                    >
                      {ledgerRowDetails(e)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono text-[12px] tabular-nums ${
                        e.amountCents >= 0 ? "text-[#6a3030]" : "text-[#1a5c40]"
                      }`}
                    >
                      {e.amountCents >= 0 ? "+" : ""}
                      {formatMoney(e.amountCents)}
                    </td>
                    {filter && balanceAfterByEntryId ? (
                      <td className="px-4 py-2 text-right font-mono text-[12px] tabular-nums text-[var(--pos-text-1)]">
                        {formatMoney(balanceAfterByEntryId.get(e.id) ?? 0)}
                      </td>
                    ) : null}
                    <td
                      className="px-4 py-2 text-right"
                      onClick={(ev) => ev.stopPropagation()}
                      onKeyDown={(ev) => ev.stopPropagation()}
                    >
                      <DangerGhostButton onClick={() => removeEntry(e.id)}>
                        Remove
                      </DangerGhostButton>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedLedgerEntry ? (
        <LedgerDetailSlideOver
          title={ledgerKindForDisplay(selectedLedgerEntry.type)}
          subtitle={
            <p className="font-mono text-[12px] text-[var(--pos-text-1)]">
              {selectedLedgerEntry.ref}
            </p>
          }
          onClose={() => setSelectedLedgerEntryId(null)}
        >
          <LedgerEntryDetailContent
            entry={selectedLedgerEntry}
            moves={ws.moves}
            supplierLabel={supplierName(selectedLedgerEntry.supplierId)}
          />
        </LedgerDetailSlideOver>
      ) : null}

      {ledgerDrawerOpen ? (
        <LedgerDrawerFrame
          title="Add ledger entry"
          titleId="ledger-entry-drawer-title"
          subtitle={
            ledgerDraft.supplierId ? (
              <p className="text-[11px] text-[var(--pos-text-2)]">
                {supplierName(ledgerDraft.supplierId)} — saved under &quot;
                {ledgerKindForDisplay(ledgerDraft.kind)}&quot;.
                {ledgerDraft.kind === "invoice"
                  ? " Total follows from your line items."
                  : null}
              </p>
            ) : (
              <p className="text-[11px] text-[var(--pos-text-2)]">
                New bills use line items; payments and other types use a single amount.
              </p>
            )
          }
          onClose={closeLedgerDrawer}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeLedgerDrawer}
                className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] px-3 text-[12px] text-[var(--pos-text-1)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveLedgerFromDrawer}
                className="h-9 cursor-pointer rounded-[9px] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                style={{ backgroundColor: "var(--pos-sb-base)" }}
                disabled={isLedgerSaveDisabled}
              >
                Save
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className={purchaseLabel}>Supplier</span>
                <select
                  value={ledgerDraft.supplierId}
                  onChange={(e) => patchLedgerDraft({ supplierId: e.target.value })}
                  className={purchaseField}
                >
                  <option value="">Select supplier…</option>
                  {ws.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className={purchaseLabel}>Entry type</span>
                <select
                  value={ledgerDraft.kind}
                  onChange={(e) => {
                    const kind = e.target.value as LedgerEntry["type"];
                    setLedgerDraft((d) => ({
                      ...d,
                      kind,
                      ...(kind === "invoice" && d.invoiceLines.length === 0
                        ? {
                            invoiceLines: [
                              {
                                id: "nl-1",
                                description: "",
                                qty: 1,
                                unit: "each",
                                unitCostCents: 0,
                              },
                            ],
                          }
                        : {}),
                    }));
                  }}
                  className={purchaseField}
                >
                  {LEDGER_DRAWER_KINDS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              {ledgerDraft.supplierId ? (
                <div className="rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2.5 sm:col-span-2">
                  <div className={purchaseLabel}>Total Payable (৳)</div>
                  <div className="mt-1 font-mono text-[14px] font-semibold tabular-nums text-[var(--pos-text-1)]">
                    {formatMoney(
                      Math.max(
                        0,
                        runningBySupplier.get(ledgerDraft.supplierId) ?? 0,
                      ),
                    )}
                  </div>
                  {(runningBySupplier.get(ledgerDraft.supplierId) ?? 0) < 0 ? (
                    <p className="mt-1 text-[10px] text-[var(--pos-text-2)]">
                      Credit on file — nothing owed right now.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <label className="block min-w-0">
                <span className={purchaseLabel}>Date</span>
                <input
                  type="date"
                  value={ledgerDraft.date}
                  onChange={(e) => patchLedgerDraft({ date: e.target.value })}
                  className={purchaseField}
                />
              </label>
              {ledgerDraft.kind === "invoice" ? (
                <>
                  <label className="block min-w-0 sm:col-span-2">
                    <span className={purchaseLabel}>Reference (optional)</span>
                    <input
                      value={ledgerDraft.invoiceRefDraft}
                      onChange={(e) =>
                        patchLedgerDraft({ invoiceRefDraft: e.target.value })
                      }
                      placeholder="Auto if empty"
                      className={`${purchaseField} font-mono placeholder:text-[var(--pos-text-2)]`}
                    />
                  </label>
                  <div className="border-t border-solid [border-color:var(--pos-divider)] pt-3 sm:col-span-2">
                    <p className="mb-2 text-[11px] text-[var(--pos-text-2)]">
                      <span className="font-medium text-[var(--pos-text-1)]">Line total</span> = qty ×
                      unit price (case, kg, each…). Creates the ledger bill and a purchase you can
                      link from Supplier return.
                    </p>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className={purchaseLabel}>Line items</span>
                      <GhostButton
                        type="button"
                        onClick={() =>
                          setLedgerDraft((d) => ({
                            ...d,
                            invoiceLines: [
                              ...d.invoiceLines,
                              {
                                id: `nl-${Date.now()}`,
                                description: "",
                                qty: 1,
                                unit: "each",
                                unitCostCents: 0,
                              },
                            ],
                          }))
                        }
                      >
                        Add line
                      </GhostButton>
                    </div>
                    <div className="space-y-2 overflow-auto">
                      <div
                        className="grid min-w-[640px] grid-cols-[1fr_56px_96px_96px_96px_36px] gap-2 px-2"
                        aria-hidden
                      >
                        <span className={purchaseLabel}>Description</span>
                        <span className={purchaseLabel}>Qty</span>
                        <span className={purchaseLabel}>Unit</span>
                        <span className={`${purchaseLabel} text-right`}>Unit ৳</span>
                        <span className={`${purchaseLabel} text-right`}>Total ৳</span>
                        <span className="sr-only">Remove</span>
                      </div>
                      {ledgerDraft.invoiceLines.map((line, idx) => {
                        const lineTotalCents = line.qty * line.unitCostCents;
                        return (
                          <div
                            key={line.id}
                            className="grid min-w-[640px] grid-cols-[1fr_56px_96px_96px_96px_36px] gap-2 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-2"
                          >
                            <input
                              value={line.description}
                              onChange={(e) =>
                                setLedgerDraft((d) => ({
                                  ...d,
                                  invoiceLines: d.invoiceLines.map((x) =>
                                    x.id === line.id
                                      ? { ...x, description: e.target.value }
                                      : x,
                                  ),
                                }))
                              }
                              placeholder="Description"
                              className={`${purchaseField} !mt-0`}
                              aria-label="Description"
                            />
                            <input
                              type="number"
                              min={1}
                              value={line.qty}
                              onChange={(e) =>
                                setLedgerDraft((d) => ({
                                  ...d,
                                  invoiceLines: d.invoiceLines.map((x) => {
                                    if (x.id !== line.id) return x;
                                    const nextQty = Math.max(1, Number(e.target.value) || 1);
                                    return { ...x, qty: nextQty };
                                  }),
                                }))
                              }
                              className={`${purchaseField} !mt-0`}
                              aria-label="Quantity"
                            />
                            <select
                              value={line.unit.trim() || "each"}
                              onChange={(e) =>
                                setLedgerDraft((d) => ({
                                  ...d,
                                  invoiceLines: d.invoiceLines.map((x) =>
                                    x.id === line.id ? { ...x, unit: e.target.value } : x,
                                  ),
                                }))
                              }
                              className={`${purchaseSelect} mt-0 h-9 w-full min-w-0`}
                              aria-label="Unit"
                            >
                              {purchaseUnitSelectOptions(line.unit).map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={line.unitCostCents / 100}
                              onChange={(e) =>
                                setLedgerDraft((d) => ({
                                  ...d,
                                  invoiceLines: d.invoiceLines.map((x) =>
                                    x.id === line.id
                                      ? {
                                          ...x,
                                          unitCostCents: Math.round(
                                            (Number(e.target.value) || 0) * 100,
                                          ),
                                        }
                                      : x,
                                  ),
                                }))
                              }
                              className={`${purchaseField} !mt-0 font-mono`}
                              aria-label="Unit price in taka"
                            />
                            <div
                              className="flex h-9 items-center justify-end font-mono text-[12px] tabular-nums text-[var(--pos-text-1)]"
                              aria-label="Line total"
                            >
                              {formatMoney(lineTotalCents)}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setLedgerDraft((d) => ({
                                  ...d,
                                  invoiceLines: d.invoiceLines.filter((x) => x.id !== line.id),
                                }))
                              }
                              disabled={ledgerDraft.invoiceLines.length <= 1}
                              className="flex items-center justify-center rounded-[9px] text-[var(--pos-text-2)] hover:bg-[var(--pos-card)] hover:text-[#8a3030] disabled:opacity-30"
                              aria-label={`Remove line ${idx + 1}`}
                            >
                              <Trash2 className="size-4" strokeWidth={2} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-right text-[12px] font-medium text-[var(--pos-text-1)]">
                      Document total ·{" "}
                      <span className="font-mono tabular-nums">
                        {formatMoney(
                          ledgerDraft.invoiceLines.reduce(
                            (s, l) => s + l.qty * l.unitCostCents,
                            0,
                          ),
                        )}
                      </span>
                    </p>
                  </div>
                </>
              ) : (
                <div className="block min-w-0">
                  <span className={purchaseLabel}>
                    {ledgerDraft.kind === "payment"
                      ? "Amount paid (৳)"
                      : ledgerDraft.kind === "return_credit"
                        ? "Credit amount (৳)"
                        : "Correction (৳)"}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={ledgerDraft.kind === "adjustment" ? undefined : 0}
                    step={0.01}
                    value={ledgerDraft.amount}
                    onChange={(e) => patchLedgerDraft({ amount: e.target.value })}
                    placeholder={
                      ledgerDraft.kind === "adjustment"
                        ? "e.g. 5000 or -500"
                        : "e.g. 5000"
                    }
                    className={`${purchaseField} font-mono placeholder:text-[var(--pos-text-2)]`}
                  />
                  {ledgerDraft.kind === "adjustment" ? (
                    <p className="mt-1 text-[10px] leading-relaxed text-[var(--pos-text-2)]">
                      Use + to increase amount due, − to decrease (same as the list below).
                    </p>
                  ) : null}
                </div>
              )}
              {ledgerDraft.kind === "payment" ? (
                <label className="block min-w-0 sm:col-span-2">
                  <span className={purchaseLabel}>Payment method</span>
                  <select
                    value={ledgerDraft.method}
                    onChange={(e) =>
                      patchLedgerDraft({
                        method: e.target.value as LedgerEntryDraft["method"],
                      })
                    }
                    className={purchaseField}
                  >
                    {LEDGER_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block min-w-0 sm:col-span-2">
                <span className={purchaseLabel}>
                  {ledgerDraft.kind === "payment"
                    ? "Notes (optional)"
                    : ledgerDraft.kind === "invoice"
                      ? "Header note (optional)"
                      : "Details / memo"}
                </span>
                <input
                  value={ledgerDraft.notes}
                  onChange={(e) => patchLedgerDraft({ notes: e.target.value })}
                  placeholder={
                    ledgerDraft.kind === "payment"
                      ? "Reference, invoice #, etc."
                      : ledgerDraft.kind === "invoice"
                        ? "Shown before line list in the memo"
                        : ledgerDraft.kind === "return_credit"
                          ? "What was returned, reason…"
                          : "Brief reason for this correction"
                  }
                  className={`${purchaseField} placeholder:text-[var(--pos-text-2)]`}
                />
              </label>
            </div>
          </div>
        </LedgerDrawerFrame>
      ) : null}
    </div>
  );
}

export function PurchaseModuleView({ leafId }: { leafId: string }) {
  switch (leafId) {
    case "pu-suppliers":
      return <SupplierListView />;
    case "pu-return":
      return <SupplierReturnView />;
    case "pu-ledger":
      return <SupplierLedgerView />;
    default:
      return <SupplierLedgerView />;
  }
}
