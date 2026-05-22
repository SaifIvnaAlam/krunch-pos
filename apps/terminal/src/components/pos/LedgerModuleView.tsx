import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  Banknote,
  BookOpen,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { sanitizeNonNegativeDecimalInput } from "../../lib/moneyInput";
import { uploadFileToStorage, resolveMediaUrl } from "@/features/storage";
import { StorageImage } from "@/features/storage/StorageImage";
import { isStorageRef } from "@/features/storage/storageRef";

/** Bordered card, calm header, filter strip, stats on page bg, scrollable table. */
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
const purchaseField =
  "mt-1 h-9 w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)]";
const purchaseLabel = "text-[11px] text-[var(--pos-text-2)]";
const purchaseTh = "px-4 py-2 text-left text-[11px] font-semibold text-[var(--pos-text-2)]";

export const LEDGER_LEAF_IDS = new Set([
  "lm-management",
  "lm-suppliers",
  "lm-ledger",
]);

export type LedgerPanelTab = "books" | "bills";

const LEDGER_TAB_EVENT = "pos-ledger-tab";

function selectLedgerTab(tab: LedgerPanelTab) {
  window.dispatchEvent(
    new CustomEvent(LEDGER_TAB_EVENT, { detail: { tab } }),
  );
}

function ledgerTabFromLeafId(leafId: string): LedgerPanelTab {
  return leafId === "lm-ledger" ? "bills" : "books";
}

/** Why this ledger book exists — vendor AP, owner equity/draws, or employee advances/payables. */
export type LedgerBookPurpose = "vendor" | "owners" | "employees";

export const LEDGER_BOOK_PURPOSE_OPTIONS: {
  value: LedgerBookPurpose;
  label: string;
}[] = [
  { value: "vendor", label: "Vendor" },
  { value: "owners", label: "Owners" },
  { value: "employees", label: "Employees" },
];

/** Ledger book title prefix for employees (matches owner-style “Owner — …” naming). */
export const EMPLOYEE_LEDGER_BOOK_NAME_PREFIX = "Staff — ";

/** Line category for employee books (not vendor bill / payment / return). */
export type EmployeeLedgerLineKind =
  | "salary"
  | "service_charge"
  | "bonus"
  | "overtime";

export const EMPLOYEE_LEDGER_LINE_OPTIONS: {
  value: EmployeeLedgerLineKind;
  label: string;
}[] = [
  { value: "salary", label: "Salary" },
  { value: "service_charge", label: "Service Charge" },
  { value: "bonus", label: "Bonus" },
  { value: "overtime", label: "Overtime" },
];

type Supplier = {
  id: string;
  name: string;
  bookPurpose: LedgerBookPurpose;
  /** Named individual at this book (full person name — not a role or department). */
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

type PurchaseOrder = {
  kind: "purchase";
  id: string;
  ref: string;
  supplierId: string;
  date: string;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  /** Total bill amount in cents (no line-item breakdown). */
  amountCents: number;
  note: string;
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

/** Receipt / invoice image or PDF stored in-browser (data URL). */
type LedgerAttachment = {
  fileName: string;
  mimeType: string;
  dataUrl: string;
};

const LEDGER_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const LEDGER_ATTACHMENT_ACCEPT = "image/*,.pdf,application/pdf,.heic,.heif";

type LedgerEntry = {
  id: string;
  supplierId: string;
  date: string;
  type: "invoice" | "payment" | "return_credit" | "adjustment";
  ref: string;
  memo: string;
  /** Positive: amount payable increases. Negative: payment or credit. */
  amountCents: number;
  attachment?: LedgerAttachment;
  /** When set, this row belongs to an employee book (salary, service charge, bonus, overtime). */
  employeeLineKind?: EmployeeLedgerLineKind;
};

type Workspace = {
  suppliers: Supplier[];
  moves: StockMove[];
  ledger: LedgerEntry[];
  ledgerSupplierFilter: string;
  /** Ledger book list → open ledger drawer on New bill with lines for this book. */
  ledgerInvoiceDrawerPrefillSupplierId: string | null;
  /** Ledger book list → open ledger drawer with Payment selected for this book. */
  ledgerPaymentDrawerPrefillSupplierId: string | null;
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
  ledgerPaymentDrawerPrefillSupplierId: null,
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

let ledgerBookNamesCacheKey = "";
let ledgerBookNamesCache: string[] = [];

/** Sorted unique names from Ledger books — for Daily Entry vendor lines and pickers. */
export function subscribeLedgerWorkspace(cb: () => void): () => void {
  return subscribeWorkspace(cb);
}

export function getLedgerBookNamesSnapshot(
  purpose: LedgerBookPurpose | "all" = "all",
): string[] {
  const names = workspaceSnapshot.suppliers
    .filter((s) => purpose === "all" || (s.bookPurpose ?? "vendor") === purpose)
    .map((s) => s.name.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const key = `${purpose}\0${names.join("\0")}`;
  if (key !== ledgerBookNamesCacheKey) {
    ledgerBookNamesCacheKey = key;
    ledgerBookNamesCache = names;
  }
  return ledgerBookNamesCache;
}

/** Match a ledger book display name to its id (for Daily Entry lines). */
export function resolveLedgerSupplierIdByBookName(bookName: string): string | null {
  const t = bookName.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const hit = workspaceSnapshot.suppliers.find((s) => s.name.trim().toLowerCase() === lower);
  return hit?.id ?? null;
}

function supplierBookPurpose(supplierId: string): LedgerBookPurpose | undefined {
  return getWorkspace().suppliers.find((s) => s.id === supplierId)?.bookPurpose;
}

function isEmployeesBookSupplierId(supplierId: string): boolean {
  return supplierBookPurpose(supplierId) === "employees";
}

/** Daily Entry / reports: true when this supplier id is a Staff (employees) ledger book. */
export function isEmployeesLedgerSupplierId(supplierId: string): boolean {
  return isEmployeesBookSupplierId(supplierId);
}

const LEGACY_EMPLOYEE_LINE_KIND_LABEL: Record<string, string> = {
  house_rent: "House rent",
  deal: "Deal / one-off",
  advance: "Advance",
  other: "Other",
};

export function employeeLedgerLineKindLabel(
  k: EmployeeLedgerLineKind | string | undefined,
): string {
  if (!k) return "—";
  const hit = EMPLOYEE_LEDGER_LINE_OPTIONS.find((o) => o.value === k);
  if (hit) return hit.label;
  return LEGACY_EMPLOYEE_LINE_KIND_LABEL[k] ?? k;
}

function supplierBalance(supplierId: string, ledger: LedgerEntry[]): number {
  return ledger
    .filter((e) => e.supplierId === supplierId)
    .reduce((s, e) => s + e.amountCents, 0);
}

function ledgerBookPurposeLabel(p: LedgerBookPurpose | undefined): string {
  const v = p ?? "vendor";
  return LEDGER_BOOK_PURPOSE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

function purchaseTotalCents(p: PurchaseOrder): number {
  return p.amountCents;
}

function linkedPurchaseForLedgerEntry(
  e: LedgerEntry,
  moves: StockMove[],
): PurchaseOrder | null {
  if (e.employeeLineKind) return null;
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
  if (e.employeeLineKind) return null;
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

function LedgerAttachmentDetail({ attachment }: { attachment: LedgerAttachment }) {
  const isImage = attachment.mimeType.startsWith("image/");
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void resolveMediaUrl(attachment.dataUrl).then((url) => {
      if (!cancelled) setHref(url);
    });
    return () => {
      cancelled = true;
    };
  }, [attachment.dataUrl]);

  return (
    <div className="mt-4 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2.5">
      <p className={purchaseLabel}>Attachment</p>
      {isImage &&
      (isStorageRef(attachment.dataUrl) || attachment.dataUrl.startsWith("data:")) ? (
        <StorageImage
          mediaRef={attachment.dataUrl}
          alt=""
          className="mt-2 max-h-40 w-full rounded-[6px] border border-solid [border-color:var(--pos-divider)] object-contain"
        />
      ) : null}
      {href ? (
        <a
          href={href}
          download={attachment.fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--pos-sb-base)" }}
        >
          <Paperclip className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          {attachment.fileName}
        </a>
      ) : (
        <p className="mt-2 text-[12px] text-[var(--pos-text-2)]">{attachment.fileName}</p>
      )}
    </div>
  );
}

function LedgerEntryAttachmentField({
  attachment,
  onChange,
}: {
  attachment: LedgerAttachment | null;
  onChange: (next: LedgerAttachment | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (file.size > LEDGER_ATTACHMENT_MAX_BYTES) {
        setError(`Max ${Math.round(LEDGER_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB`);
        return;
      }
      setError(null);
      void (async () => {
        try {
          const dataUrl = await uploadFileToStorage(file, "ledger", file.name);
          onChange({
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            dataUrl,
          });
        } catch {
          setError("Could not upload file");
        }
      })();
    },
    [onChange],
  );

  return (
    <div className="min-w-0">
      <input
        ref={fileInputRef}
        type="file"
        accept={LEDGER_ATTACHMENT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onFile}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={attachment ? "Change attachment" : "Attach receipt or file"}
          className="inline-flex h-10 w-full min-w-0 flex-1 items-center justify-center gap-2 rounded-[9px] border border-solid [border-color:var(--pos-sb-base)] bg-[var(--pos-page)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-nav-hover)]/40"
        >
          <Paperclip className="size-4 shrink-0" strokeWidth={2} aria-hidden />
          {attachment ? "Change attachment" : "Attach receipt or file"}
        </button>
        {attachment ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              onChange(null);
            }}
            className="inline-flex h-10 shrink-0 items-center rounded-[9px] border border-solid border-[#c45a5a]/45 px-3 text-[11px] font-medium text-[#8a3030] hover:bg-[#f5e4e4]/60"
          >
            Clear
          </button>
        ) : null}
      </div>
      {attachment ? (
        <p
          className="mt-2 truncate text-[11px] text-[var(--pos-text-2)]"
          title={attachment.fileName}
        >
          {attachment.fileName}
        </p>
      ) : (
        <p className="mt-2 text-[10px] leading-snug text-[var(--pos-text-2)]">
          Photo, PDF, or HEIC — up to 5 MB
        </p>
      )}
      {attachment?.mimeType.startsWith("image/") &&
      (isStorageRef(attachment.dataUrl) || attachment.dataUrl.startsWith("data:")) ? (
        <StorageImage
          mediaRef={attachment.dataUrl}
          alt=""
          className="mt-2 max-h-28 w-full rounded-[6px] border border-solid [border-color:var(--pos-divider)] object-cover"
        />
      ) : null}
      {error ? <p className="mt-2 text-[11px] text-[#8a3030]">{error}</p> : null}
    </div>
  );
}

/** Right sheet: ledger row detail (linked bill or return when available). */
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
  const att = entry.attachment;

  if (entry.employeeLineKind) {
    const empKind = employeeLedgerLineKindLabel(entry.employeeLineKind);
    const flowLabel =
      entry.type === "adjustment" ? "Accrual or correction" : "Payment to employee";
    return (
      <>
        <div className="mb-4 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)]">
            Staff ledger
          </p>
          <p className="mt-1 text-[14px] font-semibold text-[var(--pos-text-1)]">{empKind}</p>
          <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">{flowLabel}</p>
        </div>
        <dl className="space-y-3 text-[12px]">
          <div>
            <dt className={purchaseLabel}>Ledger book</dt>
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
        {att ? <LedgerAttachmentDetail attachment={att} /> : null}
      </>
    );
  }

  if (po) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)]">
              Bill
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
            <p className={purchaseLabel}>Amount</p>
            <p className="text-[15px] font-semibold tabular-nums text-[var(--pos-text-1)]">
              {formatMoney(purchaseTotalCents(po))}
            </p>
          </div>
        </div>
        <div className="rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2.5">
          <p className={purchaseLabel}>Note on file</p>
          <p className="mt-1 text-[12px] text-[var(--pos-text-1)]">{po.note.trim() || "—"}</p>
        </div>
        <div className="mt-3 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2.5">
          <p className={purchaseLabel}>Ledger memo</p>
          <p className="mt-1 text-[12px] text-[var(--pos-text-1)]">{entry.memo.trim() || "—"}</p>
        </div>
        {att ? <LedgerAttachmentDetail attachment={att} /> : null}
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
        {att ? <LedgerAttachmentDetail attachment={att} /> : null}
      </>
    );
  }

  return (
    <>
    <dl className="space-y-3 text-[12px]">
      <div>
        <dt className={purchaseLabel}>Ledger book</dt>
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
    {att ? <LedgerAttachmentDetail attachment={att} /> : null}
    </>
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

const BOOK_TYPE_FILTER_OPTIONS: {
  value: "all" | LedgerBookPurpose;
  label: string;
}[] = [{ value: "all", label: "All types" }, ...LEDGER_BOOK_PURPOSE_OPTIONS];

function ChoiceChips<T extends string>({
  label,
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={`block min-w-0 ${className}`.trim()}>
      <span className={purchaseLabel}>{label}</span>
      <div
        role="group"
        aria-label={ariaLabel ?? label}
        className="mt-1 flex flex-wrap gap-1.5"
      >
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={[
                "h-8 cursor-pointer rounded-full border border-solid px-3 text-[11px] font-medium transition-colors",
                active
                  ? "border-[var(--pos-sb-base)] bg-[var(--pos-sb-base)]/12 font-semibold text-[var(--pos-text-1)]"
                  : "border-[color:var(--pos-input-border)] bg-[var(--pos-input-bg)] text-[var(--pos-text-2)] hover:border-[var(--pos-sb-base)]/45 hover:text-[var(--pos-text-1)]",
              ].join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
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


function SupplierListView() {
  const ws = useWorkspace();
  const [q, setQ] = useState("");
  const [purposeFilter, setPurposeFilter] = useState<"all" | LedgerBookPurpose>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Supplier>>({});

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = ws.suppliers;
    if (purposeFilter !== "all") {
      list = list.filter((s) => (s.bookPurpose ?? "vendor") === purposeFilter);
    }
    if (t) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(t) ||
          s.contactPerson.toLowerCase().includes(t) ||
          s.email.toLowerCase().includes(t) ||
          s.phone.includes(t) ||
          ledgerBookPurposeLabel(s.bookPurpose).toLowerCase().includes(t),
      );
    }
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [ws.suppliers, q, purposeFilter]);

  const startCreate = useCallback(() => {
    const id = `v-${Date.now()}`;
    setDraft({
      id,
      name: "",
      bookPurpose: "vendor",
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
    if (!draft.name?.trim() || !draft.contactPerson?.trim() || !draft.id) return;
    const row: Supplier = {
      id: draft.id,
      name: draft.name.trim(),
      bookPurpose: draft.bookPurpose ?? "vendor",
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

  const startNewPurchaseFor = useCallback((supplierId: string) => {
    setWorkspace((w) => ({
      ...w,
      ledgerSupplierFilter: supplierId,
      ledgerInvoiceDrawerPrefillSupplierId: supplierId,
      ledgerPaymentDrawerPrefillSupplierId: null,
    }));
    selectLedgerTab("bills");
  }, []);

  const startPaymentFor = useCallback((supplierId: string) => {
    setWorkspace((w) => ({
      ...w,
      ledgerSupplierFilter: supplierId,
      ledgerPaymentDrawerPrefillSupplierId: supplierId,
      ledgerInvoiceDrawerPrefillSupplierId: null,
    }));
    selectLedgerTab("bills");
  }, []);

  const isForm = editingId !== null;
  const openPayableCount = ws.suppliers.filter(
    (s) => supplierBalance(s.id, ws.ledger) > 0,
  ).length;

  return (
    <div className={purchaseShell}>
      <div className={purchaseHead}>
        <ModuleTitle
          title="Ledger Books"
          subtitle="Tag each book as vendor, owners, or employees. Balances come from Bills & Payments."
        />
        <PrimaryButton type="button" onClick={startCreate}>
          Add ledger book
        </PrimaryButton>
      </div>

      <div className={`${purchaseFilters} flex-col items-stretch gap-3`}>
        <div className="flex w-full flex-wrap items-center gap-2">
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
              aria-label="Filter ledger books"
            />
          </label>
          <p className="text-[11px] text-[var(--pos-text-2)] sm:ml-auto">
            Showing{" "}
            <span className="font-semibold text-[var(--pos-text-1)]">{rows.length}</span> ledger books
          </p>
        </div>
        <ChoiceChips
          label="Book type"
          value={purposeFilter}
          options={BOOK_TYPE_FILTER_OPTIONS}
          onChange={setPurposeFilter}
          ariaLabel="Filter by book type"
        />
      </div>

      <div className={`${purchaseStats} sm:grid-cols-2`}>
        <div className={purchaseStatCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Books on file</div>
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
        <table className="w-full min-w-[900px] border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
            <tr className="border-b border-solid [border-color:var(--pos-divider)]">
              <th className={purchaseTh}>Name</th>
              <th className={purchaseTh}>Book type</th>
              <th className={purchaseTh}>Contact</th>
              <th className={`${purchaseTh} text-right`}>Payable</th>
              <th className={`${purchaseTh} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-[12px] text-[var(--pos-text-2)]"
                >
                  No ledger books match. Add one or clear the search.
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
                    <td className="whitespace-nowrap px-4 py-2">
                      <span className="inline-flex rounded-full bg-[var(--pos-nav-hover)]/50 px-2 py-0.5 text-[10px] font-semibold text-[var(--pos-text-2)]">
                        {ledgerBookPurposeLabel(s.bookPurpose)}
                      </span>
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
                        {s.bookPurpose !== "employees" ? (
                          <GhostButton onClick={() => startNewPurchaseFor(s.id)}>
                            <span className="inline-flex items-center gap-1">
                              <Receipt className="size-3.5" strokeWidth={2} />
                              Bill
                            </span>
                          </GhostButton>
                        ) : null}
                        <GhostButton onClick={() => startPaymentFor(s.id)}>
                          <span className="inline-flex items-center gap-1">
                            <Banknote className="size-3.5" strokeWidth={2} />
                            Pay
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
          width="wide"
          title={
            ws.suppliers.some((s) => s.id === draft.id) ? "Edit ledger book" : "New ledger book"
          }
          titleId="ledger-book-drawer-title"
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
                disabled={!draft.name?.trim() || !draft.contactPerson?.trim()}
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
                placeholder={
                  (draft.bookPurpose ?? "vendor") === "employees"
                    ? `${EMPLOYEE_LEDGER_BOOK_NAME_PREFIX}Full name`
                    : undefined
                }
              />
              {(draft.bookPurpose ?? "vendor") === "employees" ? (
                <p className="mt-1 text-[10px] leading-snug text-[var(--pos-text-2)]">
                  Use <span className="font-medium text-[var(--pos-text-1)]">
                    {EMPLOYEE_LEDGER_BOOK_NAME_PREFIX}
                  </span>
                  then the employee’s full name — one ledger book per person.
                </p>
              ) : null}
            </label>
            <div className="sm:col-span-2">
              <ChoiceChips
                label="Book type"
                value={draft.bookPurpose ?? "vendor"}
                options={LEDGER_BOOK_PURPOSE_OPTIONS}
                onChange={(bookPurpose) => setDraft((d) => ({ ...d, bookPurpose }))}
                ariaLabel="Ledger book type"
              />
              <p className="mt-1 text-[10px] leading-snug text-[var(--pos-text-2)]">
                {(draft.bookPurpose ?? "vendor") === "vendor"
                  ? "Vendor · supplier bills and trade payables."
                  : (draft.bookPurpose ?? "vendor") === "owners"
                    ? "Owners · partner draws, capital, and equity-style movements."
                    : `Employees · salary, service charge, bonus, and overtime (name the book “${EMPLOYEE_LEDGER_BOOK_NAME_PREFIX.trimEnd()} …”).`}
              </p>
            </div>
            <label className="block sm:col-span-2">
              <span className={purchaseLabel}>Contact person</span>
              <input
                value={draft.contactPerson ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, contactPerson: e.target.value }))}
                required
                placeholder={
                  (draft.bookPurpose ?? "vendor") === "employees"
                    ? "e.g. Faisal Mahmud"
                    : (draft.bookPurpose ?? "vendor") === "owners"
                      ? "e.g. Nadia Rahman"
                      : "e.g. Roksana Ahmed"
                }
                className={`${purchaseField} placeholder:text-[var(--pos-text-2)]`}
              />
              <p className="mt-1 text-[10px] leading-snug text-[var(--pos-text-2)]">
                Enter one individual’s full name — not a department, job title, or desk name. Use
                notes for roles or account codes.
              </p>
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

/** Table / chips: employee books show salary, service charge, etc.; vendors show bill / payment / … */
function ledgerEntryLineLabel(e: LedgerEntry): string {
  if (e.employeeLineKind) {
    return employeeLedgerLineKindLabel(e.employeeLineKind);
  }
  return ledgerKindForDisplay(e.type);
}

function ledgerDraftSummaryLabel(d: LedgerEntryDraft): string {
  if (d.supplierId && isEmployeesBookSupplierId(d.supplierId)) {
    if (d.employeeLineKind) {
      return employeeLedgerLineKindLabel(d.employeeLineKind as EmployeeLedgerLineKind);
    }
    return "Staff ledger";
  }
  return ledgerKindForDisplay(d.kind);
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

/** Kinds exposed when adding a line (vendor books). Return / adjustment stay in data & detail views only. */
export type LedgerEntryDrawerKind = Extract<LedgerEntry["type"], "invoice" | "payment">;

export const LEDGER_DRAWER_KINDS: { value: LedgerEntryDrawerKind; label: string }[] = [
  { value: "invoice", label: "Bill" },
  { value: "payment", label: "Payment" },
];

type LedgerEntryDraft = {
  supplierId: string;
  date: string;
  /** Vendor drawer: invoice | payment only. Staff books always commit as payment. */
  kind: LedgerEntry["type"];
  amount: string;
  method: (typeof LEDGER_PAYMENT_METHODS)[number];
  notes: string;
  attachment: LedgerAttachment | null;
  /** Set on employee ledger books — salary, service charge, bonus, overtime. */
  employeeLineKind: "" | EmployeeLedgerLineKind;
};

function defaultLedgerEntryDraft(prefillSupplierId: string): LedgerEntryDraft {
  const sup = getWorkspace().suppliers.find((s) => s.id === prefillSupplierId);
  const isEmp = sup?.bookPurpose === "employees";
  return {
    supplierId: prefillSupplierId,
    date: todayIso(),
    kind: isEmp ? "payment" : "invoice",
    amount: "",
    method: LEDGER_PAYMENT_METHODS[0],
    notes: "",
    attachment: null,
    employeeLineKind: isEmp ? "salary" : "",
  };
}

function memoFromEmployeeLedgerDraft(d: LedgerEntryDraft): string {
  const k = d.employeeLineKind as EmployeeLedgerLineKind;
  const kindLabel = employeeLedgerLineKindLabel(k);
  return `${kindLabel} · ${paymentMemoFromDraft(d)}`;
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
    return notes || "Purchase";
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
  const nRaw = Number.parseFloat(d.amount);
  if (!Number.isFinite(nRaw)) return null;
  const n = Math.max(0, nRaw);
  if (isEmployeesBookSupplierId(d.supplierId) && d.employeeLineKind) {
    const cents = Math.round(n * 100);
    if (cents <= 0) return null;
    return -cents;
  }
  const cents = Math.round(n * 100);
  switch (d.kind) {
    case "invoice":
      if (cents <= 0) return null;
      return cents;
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

function isLedgerDraftSaveDisabled(d: LedgerEntryDraft): boolean {
  if (!d.supplierId) return true;
  if (!d.amount.trim()) return true;
  if (isEmployeesBookSupplierId(d.supplierId)) {
    if (!d.employeeLineKind) return true;
    return amountCentsFromLedgerDraft(d) === null;
  }
  return amountCentsFromLedgerDraft(d) === null;
}

export type DailyLedgerCommitResult =
  | { ok: true; ledgerEntryId: string; purchaseOrderId?: string }
  | { ok: false };

/** Persists a bills & payments line from the drawer. */
function commitLedgerEntryDraft(draft: LedgerEntryDraft): DailyLedgerCommitResult {
  const supplierId = draft.supplierId;
  if (!supplierId) return { ok: false };

  if (draft.kind === "invoice") {
    if (isEmployeesBookSupplierId(supplierId)) return { ok: false };
    const total = amountCentsFromLedgerDraft(draft);
    if (total === null) return { ok: false };

    const w0 = getWorkspace();
    const poIds = w0.moves.filter((m) => m.kind === "purchase").map((m) => m.id);
    const date = draft.date;
    const ref = `PO-${date.replace(/-/g, "")}-${String(poIds.length + 1).padStart(3, "0")}`;
    const poId = nextId("po", poIds);
    const lgId = nextId("lg", w0.ledger.map((x) => x.id));
    const note = draft.notes.trim();
    const po: PurchaseOrder = {
      kind: "purchase",
      id: poId,
      ref,
      supplierId,
      date,
      status: "draft",
      amountCents: total,
      note,
    };
    const inv: LedgerEntry = {
      id: lgId,
      supplierId,
      date,
      type: "invoice",
      ref,
      memo: memoFromLedgerDraft(draft),
      amountCents: total,
      ...(draft.attachment ? { attachment: draft.attachment } : {}),
    };
    setWorkspace((w) => ({
      ...w,
      moves: [po, ...w.moves],
      ledger: [inv, ...w.ledger],
    }));
    return { ok: true, ledgerEntryId: lgId, purchaseOrderId: poId };
  }

  const amountCents = amountCentsFromLedgerDraft(draft);
  if (amountCents === null) return { ok: false };

  const w0 = getWorkspace();
  const lgId = nextId("lg", w0.ledger.map((x) => x.id));

  if (isEmployeesBookSupplierId(supplierId)) {
    if (!draft.employeeLineKind) return { ok: false };
    const kind: LedgerEntry["type"] = "payment";
    const ref = `EM-${Date.now().toString(36).toUpperCase().slice(-8)}`;
    const memo = memoFromEmployeeLedgerDraft(draft);
    setWorkspace((w) => ({
      ...w,
      ledger: [
        {
          id: lgId,
          supplierId,
          date: draft.date,
          type: kind,
          ref,
          memo,
          amountCents,
          employeeLineKind: draft.employeeLineKind as EmployeeLedgerLineKind,
          ...(draft.attachment ? { attachment: draft.attachment } : {}),
        },
        ...w.ledger,
      ],
    }));
    return { ok: true, ledgerEntryId: lgId };
  }

  const kind = draft.kind;
  setWorkspace((w) => ({
    ...w,
    ledger: [
      {
        id: lgId,
        supplierId,
        date: draft.date,
        type: kind,
        ref: ledgerRefForKind(kind),
        memo: memoFromLedgerDraft(draft),
        amountCents,
        ...(draft.attachment ? { attachment: draft.attachment } : {}),
      },
      ...w.ledger,
    ],
  }));
  return { ok: true, ledgerEntryId: lgId };
}

/** Same rules as the ledger drawer amount field — used to validate before daily save posts a line. */
export function validateLedgerAmountForKind(
  kind: LedgerEntry["type"],
  amountStr: string,
): string | null {
  const cents = amountCentsFromLedgerDraft({
    supplierId: "_",
    date: "2000-01-01",
    kind,
    amount: amountStr,
    method: LEDGER_PAYMENT_METHODS[0],
    notes: "",
    attachment: null,
    employeeLineKind: "",
  });
  if (cents !== null) return null;
  if (!amountStr.trim()) return "Enter an amount for this ledger line.";
  if (kind === "adjustment") return "Adjustment amount cannot be zero.";
  return "Enter a valid amount (greater than zero) for this type.";
}

/** Validates amount for a daily expense line that posts to Bills & payments (vendor + staff rules). */
export function validateDailyExpenseLedgerAmount(params: {
  supplierId: string;
  amountStr: string;
  kind: LedgerEntry["type"];
  employeeLineKind: "" | EmployeeLedgerLineKind;
}): string | null {
  const d: LedgerEntryDraft = {
    supplierId: params.supplierId,
    date: "2000-01-01",
    kind: params.kind,
    amount: params.amountStr,
    method: LEDGER_PAYMENT_METHODS[0],
    notes: "",
    attachment: null,
    employeeLineKind: params.employeeLineKind,
  };
  if (isEmployeesBookSupplierId(params.supplierId)) {
    if (!params.employeeLineKind) return "Select a payment type.";
    if (!params.amountStr.trim()) return "Enter an amount for this ledger line.";
    const cents = amountCentsFromLedgerDraft(d);
    if (cents !== null) return null;
    return "Enter a valid amount (greater than zero) for this payment.";
  }
  return validateLedgerAmountForKind(params.kind, params.amountStr);
}

export function commitLedgerFromDailyExpenseLine(params: {
  supplierId: string;
  entryDateIso: string;
  amountStr: string;
  kind: LedgerEntry["type"];
  notes: string;
  employeeLineKind?: EmployeeLedgerLineKind;
}): DailyLedgerCommitResult {
  return commitLedgerEntryDraft({
    supplierId: params.supplierId,
    date: params.entryDateIso,
    kind: params.kind,
    amount: params.amountStr,
    method: LEDGER_PAYMENT_METHODS[0],
    notes: params.notes,
    attachment: null,
    employeeLineKind: params.employeeLineKind ?? "",
  });
}

/** Removes ledger (and draft PO for bills) created from Daily Entry so edits stay in sync. */
export function removeDailyLedgerExpenseLink(link: {
  ledgerEntryId: string;
  purchaseOrderId?: string;
}): void {
  setWorkspace((w) => ({
    ...w,
    ledger: w.ledger.filter((e) => e.id !== link.ledgerEntryId),
    moves: link.purchaseOrderId
      ? w.moves.filter((m) => m.id !== link.purchaseOrderId)
      : w.moves,
  }));
}

const LEDGER_DRAWER_WIDTH = {
  /** Add entry / compact forms */
  narrow: "max-w-[min(100vw,380px)]",
  /** Edit ledger book (wider fields) */
  wide: "max-w-[min(100vw,520px)]",
} as const;

/** Same right drawer shell as Other expenses (`ExpenseModalFrame`). */
function LedgerDrawerFrame({
  title,
  subtitle,
  children,
  footer,
  onClose,
  titleId,
  overlayClassName = "z-50",
  width = "narrow",
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  titleId: string;
  /** z-index for stacking over other POS overlays (e.g. Daily Entry). */
  overlayClassName?: string;
  /** `narrow` keeps add-entry panels compact; `wide` fits edit-book two-column layout. */
  width?: keyof typeof LEDGER_DRAWER_WIDTH;
}) {
  return (
    <div
      className={`pointer-events-none fixed inset-0 flex justify-end ${overlayClassName}`}
    >
      <div className="min-w-0 flex-1" aria-hidden />
      <div
        className={`pointer-events-auto flex h-full w-full shrink-0 flex-col border-l border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-[-8px_0_24px_rgba(0,0,0,0.08)] ${LEDGER_DRAWER_WIDTH[width]}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
      >
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <h2
              id={titleId}
              className="text-[14px] font-semibold leading-snug text-[var(--pos-text-1)]"
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
          {subtitle ? <div className="mt-1.5">{subtitle}</div> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">{children}</div>
        <div className="shrink-0 border-t border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2.5">
          {footer}
        </div>
      </div>
    </div>
  );
}

function formatLedgerDateReadonly(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function LedgerEntryDrawerForm({
  ledgerDraft,
  patchLedgerDraft,
  ws,
  supplierName,
  runningBySupplier,
  bookField,
  dateField = "editable",
}: {
  ledgerDraft: LedgerEntryDraft;
  patchLedgerDraft: (patch: Partial<LedgerEntryDraft>) => void;
  ws: Workspace;
  supplierName: (id: string) => string;
  runningBySupplier: Map<string, number>;
  bookField: "select" | "readonly";
  /** Daily Entry overlay: date is the entry day and cannot be changed. */
  dateField?: "editable" | "readonly";
}) {
  const activeSupplier = ws.suppliers.find((s) => s.id === ledgerDraft.supplierId);
  const isEmployeeBook = activeSupplier?.bookPurpose === "employees";

  const onBookChange = (newId: string) => {
    const sup = ws.suppliers.find((s) => s.id === newId);
    const emp = sup?.bookPurpose === "employees";
    patchLedgerDraft({
      supplierId: newId,
      kind: emp ? "payment" : "invoice",
      amount: "",
      employeeLineKind: emp ? "salary" : "",
    });
  };

  const amountLabel = isEmployeeBook ? "Amount paid (৳)" : "Amount (৳)";

  const running = ledgerDraft.supplierId
    ? (runningBySupplier.get(ledgerDraft.supplierId) ?? 0)
    : 0;
  const balanceDisplay = isEmployeeBook
    ? formatMoney(running)
    : formatMoney(Math.max(0, running));

  const dateControl =
    dateField === "readonly" ? (
      <div className="min-w-0 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2">
        <span className={purchaseLabel}>Date</span>
        <p className="mt-0.5 text-[13px] font-medium leading-snug text-[var(--pos-text-1)]">
          {formatLedgerDateReadonly(ledgerDraft.date)}
        </p>
      </div>
    ) : (
      <label className="min-w-0">
        <span className={purchaseLabel}>Date</span>
        <input
          type="date"
          value={ledgerDraft.date}
          onChange={(e) => patchLedgerDraft({ date: e.target.value })}
          className={purchaseField}
        />
      </label>
    );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {bookField === "select" ? (
          <label className="col-span-2 block min-w-0">
            <span className={purchaseLabel}>Book</span>
            <select
              value={ledgerDraft.supplierId}
              onChange={(e) => onBookChange(e.target.value)}
              className={purchaseField}
            >
              <option value="">Select…</option>
              {ws.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({ledgerBookPurposeLabel(s.bookPurpose)})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="col-span-2 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2">
            <span className={purchaseLabel}>Book</span>
            <p className="mt-0.5 text-[13px] font-medium leading-snug text-[var(--pos-text-1)]">
              {ledgerDraft.supplierId ? supplierName(ledgerDraft.supplierId) : "—"}
            </p>
          </div>
        )}
        {ledgerDraft.supplierId ? (
          <div className="col-span-2 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2">
            <span className={purchaseLabel}>{isEmployeeBook ? "Balance" : "Owed"}</span>
            <p className="mt-0.5 font-mono text-[14px] font-semibold tabular-nums leading-snug text-[var(--pos-text-1)]">
              {balanceDisplay}
            </p>
            {isEmployeeBook ? (
              <p className="mt-1 text-[10px] leading-snug text-[var(--pos-text-2)]">
                + means more owed to this person · − means net paid ahead or reduced obligation
              </p>
            ) : null}
          </div>
        ) : null}

        {isEmployeeBook ? (
          <>
            <label className="col-span-2 block min-w-0">
              <span className={purchaseLabel}>Payment type</span>
              <select
                value={ledgerDraft.employeeLineKind}
                onChange={(e) =>
                  patchLedgerDraft({
                    employeeLineKind: e.target.value as EmployeeLedgerLineKind,
                  })
                }
                className={purchaseField}
              >
                {EMPLOYEE_LEDGER_LINE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {dateControl}
            <>
              <div className="min-w-0">
                <span className={purchaseLabel}>{amountLabel}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={ledgerDraft.amount}
                  onChange={(e) =>
                    patchLedgerDraft({
                      amount: sanitizeNonNegativeDecimalInput(e.target.value),
                    })
                  }
                  placeholder="0"
                  className={`${purchaseField} font-mono placeholder:text-[var(--pos-text-2)]`}
                />
              </div>
              <label className="min-w-0">
                <span className={purchaseLabel}>Via</span>
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
            </>
            <label className="col-span-2 block min-w-0">
              <span className={purchaseLabel}>Memo</span>
              <textarea
                value={ledgerDraft.notes}
                onChange={(e) => patchLedgerDraft({ notes: e.target.value })}
                rows={2}
                placeholder="Period, ref #, notes…"
                className="mt-1 min-h-[40px] w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 py-1.5 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)]"
              />
            </label>
          </>
        ) : (
          <>
            <label className="min-w-0">
              <span className={purchaseLabel}>Type</span>
              <select
                value={ledgerDraft.kind}
                onChange={(e) => {
                  const kind = e.target.value as LedgerEntryDrawerKind;
                  patchLedgerDraft({ kind });
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
            {dateControl}
            {ledgerDraft.kind === "payment" ? (
              <>
                <div className="min-w-0">
                  <span className={purchaseLabel}>{amountLabel}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={ledgerDraft.amount}
                    onChange={(e) =>
                      patchLedgerDraft({
                        amount: sanitizeNonNegativeDecimalInput(e.target.value),
                      })
                    }
                    placeholder="0"
                    className={`${purchaseField} font-mono placeholder:text-[var(--pos-text-2)]`}
                  />
                </div>
                <label className="min-w-0">
                  <span className={purchaseLabel}>Via</span>
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
              </>
            ) : (
              <div className="col-span-2 min-w-0">
                <span className={purchaseLabel}>{amountLabel}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={ledgerDraft.amount}
                  onChange={(e) =>
                    patchLedgerDraft({
                      amount: sanitizeNonNegativeDecimalInput(e.target.value),
                    })
                  }
                  placeholder="0"
                  className={`${purchaseField} font-mono placeholder:text-[var(--pos-text-2)]`}
                />
              </div>
            )}
            <label className="col-span-2 block min-w-0">
              <span className={purchaseLabel}>
                {ledgerDraft.kind === "invoice" ? "Note" : "Memo"}
              </span>
              <textarea
                value={ledgerDraft.notes}
                onChange={(e) => patchLedgerDraft({ notes: e.target.value })}
                rows={2}
                placeholder={
                  ledgerDraft.kind === "payment" ? "Ref #, invoice #…" : "Short description"
                }
                className="mt-1 min-h-[40px] w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 py-1.5 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)]"
              />
            </label>
          </>
        )}
      </div>
      <div className="rounded-[10px] border border-dashed border-[var(--pos-input-border)] bg-[var(--pos-page)] px-3 py-3">
        <p className={`${purchaseLabel} mb-2 font-semibold text-[var(--pos-text-1)]`}>
          Attachment (optional)
        </p>
        <LedgerEntryAttachmentField
          attachment={ledgerDraft.attachment}
          onChange={(next) => patchLedgerDraft({ attachment: next })}
        />
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
  /** "payment" includes legacy return credits in the list. Corrections (adjustment) only under All. */
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<"all" | "invoice" | "payment">("all");
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
    const invSid = ws.ledgerInvoiceDrawerPrefillSupplierId;
    const paySid = ws.ledgerPaymentDrawerPrefillSupplierId;
    const sid = invSid || paySid;
    if (!sid) return;
    if (!getWorkspace().suppliers.some((s) => s.id === sid)) {
      setWorkspace((w) => ({
        ...w,
        ledgerInvoiceDrawerPrefillSupplierId: null,
        ledgerPaymentDrawerPrefillSupplierId: null,
      }));
      return;
    }
    if (invSid) {
      setLedgerDraft(defaultLedgerEntryDraft(invSid));
    } else {
      const base = defaultLedgerEntryDraft(sid);
      setLedgerDraft({ ...base, kind: "payment" });
    }
    setLedgerDrawerOpen(true);
    setWorkspace((w) => ({
      ...w,
      ledgerInvoiceDrawerPrefillSupplierId: null,
      ledgerPaymentDrawerPrefillSupplierId: null,
    }));
  }, [ws.ledgerInvoiceDrawerPrefillSupplierId, ws.ledgerPaymentDrawerPrefillSupplierId]);

  const supplierName = useCallback(
    (id: string) => ws.suppliers.find((s) => s.id === id)?.name ?? id,
    [ws.suppliers],
  );

  const filterSupplier = filter ? ws.suppliers.find((s) => s.id === filter) : null;
  const viewingEmployeeBook = filterSupplier?.bookPurpose === "employees";

  const entries = useMemo(() => {
    let e = ws.ledger.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    if (filter) e = e.filter((x) => x.supplierId === filter);
    if (ledgerTypeFilter === "invoice") {
      e = e.filter((x) => x.type === "invoice");
    } else if (ledgerTypeFilter === "payment") {
      e = e.filter((x) => x.type === "payment" || x.type === "return_credit");
    }
    const q = ledgerSearchQ.trim().toLowerCase();
    if (q) {
      e = e.filter((x) => {
        const kindLabel = ledgerEntryLineLabel(x).toLowerCase();
        const empKindQ = x.employeeLineKind
          ? employeeLedgerLineKindLabel(x.employeeLineKind).toLowerCase()
          : "";
        const purposeLabel = ledgerBookPurposeLabel(
          ws.suppliers.find((s) => s.id === x.supplierId)?.bookPurpose,
        ).toLowerCase();
        return (
          x.ref.toLowerCase().includes(q) ||
          x.memo.toLowerCase().includes(q) ||
          supplierName(x.supplierId).toLowerCase().includes(q) ||
          x.type.includes(q) ||
          kindLabel.includes(q) ||
          empKindQ.includes(q) ||
          purposeLabel.includes(q)
        );
      });
    }
    if (ledgerDateFrom) e = e.filter((x) => x.date >= ledgerDateFrom);
    if (ledgerDateTo) e = e.filter((x) => x.date <= ledgerDateTo);
    return e;
  }, [
    ws.ledger,
    ws.suppliers,
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
      if (e.employeeLineKind) {
        if (e.amountCents > 0) billsAddedCents += e.amountCents;
        else paidOutCents += -e.amountCents;
      } else {
        if (e.type === "invoice") billsAddedCents += e.amountCents;
        else if (e.type === "payment" || e.type === "return_credit") paidOutCents += -e.amountCents;
      }
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
    if (!commitLedgerEntryDraft(ledgerDraft).ok) return;
    setLedgerDrawerOpen(false);
    setLedgerDraft(defaultLedgerEntryDraft(""));
  }, [ledgerDraft]);

  const removeEntry = useCallback((id: string) => {
    if (!window.confirm("Remove this line? Only do this if it was entered by mistake.")) return;
    setWorkspace((w) => ({ ...w, ledger: w.ledger.filter((e) => e.id !== id) }));
  }, []);

  const isLedgerSaveDisabled = isLedgerDraftSaveDisabled(ledgerDraft);

  return (
    <div className={purchaseShell}>
      <div className={purchaseHead}>
        <ModuleTitle
          title={viewingEmployeeBook ? "Staff Ledger" : "Bills & Payments"}
          subtitle={
            viewingEmployeeBook
              ? "Record salary, service charge, bonus, and overtime — not vendor bills."
              : "Add a bill with one amount and a note, record payments and credits, and filter by book for balance."
          }
        />
        <button
          type="button"
          onClick={openLedgerDrawer}
          disabled={ws.suppliers.length === 0}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          style={{ backgroundColor: "var(--pos-sb-base)" }}
        >
          <Plus className="size-4" strokeWidth={2.2} />
          {viewingEmployeeBook ? "Add line" : "Add entry"}
        </button>
      </div>

      <div className={`${purchaseFilters} items-end`}>
        <label className="block min-w-0 flex-1 sm:max-w-md">
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
              placeholder="Ref, memo, book…"
              className={purchaseSearchInput}
              aria-label="Search ledger"
            />
          </div>
        </label>
        <label className="block min-w-[160px] max-w-[240px] flex-1">
          <span className={purchaseLabel}>Book</span>
          <select
            value={filter}
            onChange={(e) =>
              setWorkspace((w) => ({ ...w, ledgerSupplierFilter: e.target.value }))
            }
            className={purchaseField}
            aria-label="Filter by ledger book"
          >
            <option value="">All books</option>
            {ws.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({ledgerBookPurposeLabel(s.bookPurpose)}) ·{" "}
                {formatMoneyWholeTaka(runningBySupplier.get(s.id) ?? 0)}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[120px] max-w-[160px]">
          <span className={purchaseLabel}>Type</span>
          <select
            value={ledgerTypeFilter}
            onChange={(e) =>
              setLedgerTypeFilter(e.target.value as "all" | "invoice" | "payment")
            }
            className={purchaseField}
            aria-label="Filter by entry type"
          >
            <option value="all">All</option>
            <option value="invoice">Bill</option>
            <option value="payment">Payment</option>
          </select>
        </label>
        <label className="block min-w-[120px] max-w-[140px]">
          <span className={purchaseLabel}>From</span>
          <input
            type="date"
            value={ledgerDateFrom}
            onChange={(e) => setLedgerDateFrom(e.target.value)}
            className={purchaseField}
            aria-label="From date"
          />
        </label>
        <label className="block min-w-[120px] max-w-[140px]">
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
              Clear
            </GhostButton>
          ) : null}
          <span className="text-[11px] text-[var(--pos-text-2)]">
            <span className="font-semibold text-[var(--pos-text-1)]">{entries.length}</span> shown
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2.5">
        <div className={`${purchaseStatCell} min-w-[140px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">
            {filter ? "Balance" : "Payable (all)"}
          </div>
          <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--pos-text-1)]">
            {formatMoneyWholeTaka(dueCents)}
          </div>
        </div>
        <div className={`${purchaseStatCell} min-w-[120px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">
            {viewingEmployeeBook ? "Owed (+) (view)" : "Bills (view)"}
          </div>
          <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--pos-text-1)]">
            {formatMoneyWholeTaka(ledgerEntriesViewStats.billsAddedCents)}
          </div>
        </div>
        <div className={`${purchaseStatCell} min-w-[120px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">
            {viewingEmployeeBook ? "Paid out (view)" : "Paid (view)"}
          </div>
          <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--pos-text-1)]">
            {formatMoneyWholeTaka(ledgerEntriesViewStats.paidOutCents)}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
            <tr className="border-b border-solid [border-color:var(--pos-divider)]">
              <th className={purchaseTh}>Date</th>
              <th className={purchaseTh}>Ledger book</th>
              <th className={purchaseTh}>{viewingEmployeeBook ? "Line" : "Type"}</th>
              <th className={purchaseTh}>Details</th>
              <th className={`${purchaseTh} text-right`}>
                {viewingEmployeeBook ? "Amount" : "Due"}
              </th>
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
                    : "No entries match your filters — adjust search, ledger book, type, or dates."}
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
                    aria-label={`${ledgerEntryLineLabel(e)}, ${e.ref}, show details`}
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
                        {ledgerEntryLineLabel(e)}
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
          title={ledgerEntryLineLabel(selectedLedgerEntry)}
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
          title={
            ledgerDraft.supplierId && isEmployeesBookSupplierId(ledgerDraft.supplierId)
              ? "Add staff ledger line"
              : "Add ledger entry"
          }
          titleId="ledger-entry-drawer-title"
          subtitle={
            ledgerDraft.supplierId ? (
              <p className="text-[11px] text-[var(--pos-text-2)]">
                {supplierName(ledgerDraft.supplierId)} · {ledgerDraftSummaryLabel(ledgerDraft)}
              </p>
            ) : (
              <p className="text-[11px] text-[var(--pos-text-2)]">
                Choose a ledger book, then enter amount and note.
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
          <LedgerEntryDrawerForm
            ledgerDraft={ledgerDraft}
            patchLedgerDraft={patchLedgerDraft}
            ws={ws}
            supplierName={supplierName}
            runningBySupplier={runningBySupplier}
            bookField="select"
            dateField="editable"
          />
        </LedgerDrawerFrame>
      ) : null}
    </div>
  );
}

const LEDGER_VIEW_TABS: {
  id: LedgerPanelTab;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "books", label: "Ledger Books", icon: BookOpen },
  { id: "bills", label: "Bills & Payments", icon: Receipt },
];

function LedgerViewSwitcher({
  tab,
  onTabChange,
}: {
  tab: LedgerPanelTab;
  onTabChange: (next: LedgerPanelTab) => void;
}) {
  return (
    <header className="shrink-0">
      <nav
        role="tablist"
        aria-label="Ledger management views"
        className="flex gap-0 border-b border-solid [border-color:var(--pos-divider)]"
      >
        {LEDGER_VIEW_TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(id)}
              className={[
                "relative -mb-px flex items-center gap-2 px-4 py-3 text-[13px] transition-colors",
                active
                  ? "font-semibold text-[var(--pos-text-1)]"
                  : "font-medium text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]",
              ].join(" ")}
            >
              <Icon
                className={`size-[15px] shrink-0 ${active ? "text-[var(--pos-sb-base)]" : "opacity-70"}`}
                strokeWidth={2}
                aria-hidden
              />
              {label}
              <span
                className={[
                  "pointer-events-none absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[var(--pos-sb-base)] transition-opacity duration-200",
                  active ? "opacity-100" : "opacity-0",
                ].join(" ")}
                aria-hidden
              />
            </button>
          );
        })}
      </nav>
    </header>
  );
}

export function LedgerModuleView({ leafId }: { leafId: string }) {
  const [tab, setTab] = useState<LedgerPanelTab>(() => ledgerTabFromLeafId(leafId));

  useEffect(() => {
    setTab(ledgerTabFromLeafId(leafId));
  }, [leafId]);

  useEffect(() => {
    const onTab = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: LedgerPanelTab }>).detail;
      if (detail?.tab === "books" || detail?.tab === "bills") {
        setTab(detail.tab);
      }
    };
    window.addEventListener(LEDGER_TAB_EVENT, onTab);
    return () => window.removeEventListener(LEDGER_TAB_EVENT, onTab);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <LedgerViewSwitcher tab={tab} onTabChange={setTab} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {tab === "books" ? <SupplierListView /> : <SupplierLedgerView />}
      </div>
    </div>
  );
}
