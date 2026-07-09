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
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import { sanitizeNonNegativeDecimalInput } from "../../lib/moneyInput";
import { uploadFileToStorage, resolveMediaUrl, purgeStoredMediaRef, attachmentUploadBlockedMessage } from "@/features/storage";
import { StorageImage } from "@/features/storage/StorageImage";
import { isPersistedMediaRef } from "@/features/storage/storageRef";
import { dispatchPosSelectLeaf } from "../../lib/posNavEvents";
import {
  getLedgerWorkspaceLoadState,
  getWorkspace,
  loadLedgerWorkspace,
  setWorkspace,
  subscribeWorkspace,
  type EmployeeLedgerLineKind,
  type LedgerAttachment,
  type LedgerBookPurpose,
  type LedgerEntry,
  type LedgerItemLine,
  type LedgerSupplier,
  type LedgerWorkspace,
  type PurchaseOrder,
  type PurchaseReturn,
  type StockMove,
} from "@/features/ledger";

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
  "lm-items",
]);

export type LedgerPanelTab = "books" | "bills" | "items";

function selectLedgerTab(tab: LedgerPanelTab) {
  if (tab === "bills") dispatchPosSelectLeaf("lm-ledger");
  else if (tab === "items") dispatchPosSelectLeaf("lm-items");
  else dispatchPosSelectLeaf("lm-management");
}

function ledgerTabFromLeafId(leafId: string): LedgerPanelTab {
  if (leafId === "lm-ledger") return "bills";
  if (leafId === "lm-items") return "items";
  return "books";
}

/** Why this cashbook exists — vendor AP, owner equity/draws, or employee advances/payables. */
export type { LedgerBookPurpose };

export const LEDGER_BOOK_PURPOSE_OPTIONS: {
  value: LedgerBookPurpose;
  label: string;
}[] = [
  { value: "vendor", label: "Vendor" },
  { value: "owners", label: "Owners" },
  { value: "employees", label: "Employees" },
];

/** Cashbook title prefix for employees (matches owner-style “Owner — …” naming). */
export const EMPLOYEE_LEDGER_BOOK_NAME_PREFIX = "Staff — ";

export type { EmployeeLedgerLineKind };

export const EMPLOYEE_LEDGER_LINE_OPTIONS: {
  value: EmployeeLedgerLineKind;
  label: string;
}[] = [
  { value: "salary", label: "Salary" },
  { value: "service_charge", label: "Service Charge" },
  { value: "bonus", label: "Bonus" },
  { value: "overtime", label: "Overtime" },
];

type Supplier = LedgerSupplier;
type Workspace = LedgerWorkspace;

const LEDGER_ATTACHMENT_ACCEPT = "image/*,.pdf,application/pdf,.heic,.heif";

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

/** Cashbook display name for a staff member. */
export function employeeLedgerBookName(fullName: string): string {
  return `${EMPLOYEE_LEDGER_BOOK_NAME_PREFIX}${fullName.trim()}`;
}

/** Create or return the Staff cashbook for this employee (session workspace). */
export function upsertEmployeeLedgerBook(employee: {
  name: string;
  phone?: string;
}): string {
  const name = employeeLedgerBookName(employee.name);
  const w = getWorkspace();
  const existing = w.suppliers.find((s) => s.name === name);
  if (existing) return existing.id;

  const id = nextId("sup", w.suppliers.map((s) => s.id));
  const row: Supplier = {
    id,
    name,
    bookPurpose: "employees",
    contactPerson: employee.name.trim(),
    phone: employee.phone?.trim() ?? "",
    email: "",
    address: "",
    notes: "",
  };
  setWorkspace((prev) => ({ ...prev, suppliers: [...prev.suppliers, row] }));
  return id;
}

export function hasEmployeeLedgerBook(fullName: string): boolean {
  const name = employeeLedgerBookName(fullName);
  return getWorkspace().suppliers.some((s) => s.name === name);
}

function useWorkspace(): Workspace {
  return useSyncExternalStore(subscribeWorkspace, getWorkspace, getWorkspace);
}

let ledgerBookNamesCacheKey = "";
let ledgerBookNamesCache: string[] = [];

/** Sorted unique names from Cashbooks — for Daily Entry vendor lines and pickers. */
export function subscribeLedgerWorkspace(cb: () => void): () => void {
  return subscribeWorkspace(cb);
}

export function getLedgerBookNamesSnapshot(
  purpose: LedgerBookPurpose | "all" = "all",
): string[] {
  const names = getWorkspace().suppliers
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

/** Match a cashbook display name to its id (for Daily Entry lines). */
export function resolveLedgerSupplierIdByBookName(bookName: string): string | null {
  const t = bookName.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const hit = getWorkspace().suppliers.find((s) => s.name.trim().toLowerCase() === lower);
  return hit?.id ?? null;
}

function supplierBookPurpose(supplierId: string): LedgerBookPurpose | undefined {
  return getWorkspace().suppliers.find((s) => s.id === supplierId)?.bookPurpose;
}

function isEmployeesBookSupplierId(supplierId: string): boolean {
  return supplierBookPurpose(supplierId) === "employees";
}

/** Daily Entry / reports: true when this supplier id is a Staff (employees) cashbook. */
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
  if (p.items && p.items.length > 0) {
    return p.items.reduce((s, l) => s + l.totalCents, 0);
  }
  return p.amountCents;
}

function ledgerEntryItems(entry: LedgerEntry, moves: StockMove[]): LedgerItemLine[] {
  if (entry.items && entry.items.length > 0) return entry.items;
  const po = linkedPurchaseForLedgerEntry(entry, moves);
  if (po?.items && po.items.length > 0) return po.items;
  return [];
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
      (isPersistedMediaRef(attachment.dataUrl) || attachment.dataUrl.startsWith("data:")) ? (
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
      const blocked = attachmentUploadBlockedMessage(file);
      if (blocked) {
        setError(blocked);
        return;
      }
      setError(null);
      void (async () => {
        try {
          const previousRef = attachment?.dataUrl;
          const dataUrl = await uploadFileToStorage(file, "ledger", file.name);
          onChange({
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            dataUrl,
          });
          if (previousRef) purgeStoredMediaRef(previousRef);
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
              const previousRef = attachment?.dataUrl;
              onChange(null);
              if (previousRef) purgeStoredMediaRef(previousRef);
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
          Photo, PDF, or HEIC — images are compressed automatically
        </p>
      )}
      {attachment?.mimeType.startsWith("image/") &&
      (isPersistedMediaRef(attachment.dataUrl) || attachment.dataUrl.startsWith("data:")) ? (
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
        className="pointer-events-auto flex h-full w-full max-w-[520px] shrink-0 flex-col border-l border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-[-12px_0_40px_rgba(0,0,0,0.12)]"
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

function LedgerCenterModal({
  title,
  subtitle,
  children,
  footer,
  onClose,
  titleId = "ledger-center-modal-title",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  titleId?: string;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div
        className="relative z-[1] flex max-h-[min(90vh,720px)] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-lg sm:rounded-[14px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-[var(--pos-text-1)]"
              >
                {title}
              </h2>
              {subtitle ? <div className="mt-1.5">{subtitle}</div> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-solid [border-color:var(--pos-input-border)] text-[var(--pos-text-2)] transition-colors hover:border-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)]"
              aria-label="Close"
            >
              <X className="size-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-solid [border-color:var(--pos-divider)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LedgerItemsTable({
  items,
  emptyLabel = "No items.",
}: {
  items: LedgerItemLine[];
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="text-[12px] text-[var(--pos-text-2)]">{emptyLabel}</p>;
  }
  const total = items.reduce((s, l) => s + l.totalCents, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-solid [border-color:var(--pos-divider)]">
            <th className={`${purchaseTh} pl-0`}>Name</th>
            <th className={`${purchaseTh} text-right`}>Qty</th>
            <th className={purchaseTh}>Unit</th>
            <th className={`${purchaseTh} text-right`}>Rate</th>
            <th className={`${purchaseTh} pr-0 text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((line) => (
            <tr key={line.id} className="border-b border-solid [border-color:var(--pos-divider)]">
              <td className="max-w-[160px] px-0 py-2 font-medium text-[var(--pos-text-1)]">
                {line.name}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[var(--pos-text-1)]">
                {line.qty}
              </td>
              <td className="px-2 py-2 text-[var(--pos-text-2)]">{line.unit}</td>
              <td className="px-2 py-2 text-right tabular-nums text-[var(--pos-text-2)]">
                {formatMoney(line.rateCents)}
              </td>
              <td className="px-0 py-2 text-right tabular-nums font-medium text-[var(--pos-text-1)]">
                {formatMoney(line.totalCents)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="px-0 pt-2 text-right text-[11px] text-[var(--pos-text-2)]">
              Items total
            </td>
            <td className="px-0 pt-2 text-right font-mono text-[13px] font-semibold tabular-nums text-[var(--pos-text-1)]">
              {formatMoney(total)}
            </td>
          </tr>
        </tfoot>
      </table>
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
  const items = ledgerEntryItems(entry, moves);

  if (entry.employeeLineKind) {
    const empKind = employeeLedgerLineKindLabel(entry.employeeLineKind);
    const flowLabel =
      entry.type === "adjustment" ? "Accrual or correction" : "Payment to employee";
    return (
      <>
        <div className="mb-4 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)]">
            Staff cashbook
          </p>
          <p className="mt-1 text-[14px] font-semibold text-[var(--pos-text-1)]">{empKind}</p>
          <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">{flowLabel}</p>
        </div>
        <dl className="space-y-3 text-[12px]">
          <div>
            <dt className={purchaseLabel}>Cashbook</dt>
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
        {items.length > 0 ? (
          <div className="mb-3 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2.5">
            <p className={`${purchaseLabel} mb-2 font-semibold text-[var(--pos-text-1)]`}>
              Items ({items.length})
            </p>
            <LedgerItemsTable items={items} />
          </div>
        ) : null}
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
        <dt className={purchaseLabel}>Cashbook</dt>
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
    {items.length > 0 ? (
      <div className="mt-4 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2.5">
        <p className={`${purchaseLabel} mb-2 font-semibold text-[var(--pos-text-1)]`}>
          Items ({items.length})
        </p>
        <LedgerItemsTable items={items} />
      </div>
    ) : null}
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

function CashbookBookTypeChip({ purpose }: { purpose: LedgerBookPurpose | undefined }) {
  return (
    <span className="inline-flex shrink-0 rounded-full bg-[var(--pos-page)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)] ring-1 ring-[var(--pos-divider)]">
      {ledgerBookPurposeLabel(purpose)}
    </span>
  );
}

const cashbookUnderlineInput =
  "w-full border-0 border-b border-solid [border-color:var(--pos-divider)] bg-transparent px-0 py-0.5 text-[12px] font-medium text-[var(--pos-text-1)] outline-none placeholder:text-[var(--pos-text-2)] focus:[border-color:var(--pos-text-1)]";

const cashbookUnderlineInputLg =
  "w-full border-0 border-b border-solid [border-color:var(--pos-divider)] bg-transparent px-0 py-0.5 text-[14px] font-semibold text-[var(--pos-text-1)] outline-none placeholder:text-[var(--pos-text-2)] focus:[border-color:var(--pos-text-1)]";

const cashbookUnderlineTextarea =
  "mt-0.5 min-h-[36px] w-full resize-none border-0 border-b border-solid [border-color:var(--pos-divider)] bg-transparent px-0 py-0.5 text-[12px] leading-snug text-[var(--pos-text-1)] outline-none placeholder:text-[var(--pos-text-2)] focus:[border-color:var(--pos-text-1)]";

const cashbookFieldLabel =
  "text-[10px] font-medium uppercase tracking-wide text-[var(--pos-text-2)]";

const cashbookFieldRow = "px-2.5 py-1.5";

type CashbookEditableField =
  | "name"
  | "bookPurpose"
  | "contactPerson"
  | "phone"
  | "email"
  | "address"
  | "notes";

function CashbookFieldEditButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--pos-text-2)] opacity-30 transition-opacity hover:bg-[var(--pos-nav-hover)]/50 hover:opacity-100 hover:text-[var(--pos-text-1)]"
      aria-label={`Edit ${label}`}
    >
      <Pencil className="size-2.5" strokeWidth={2} aria-hidden />
    </button>
  );
}

function CashbookInlineTextField({
  fieldKey,
  label,
  value,
  activeField,
  setActiveField,
  onSave,
  placeholder,
  multiline = false,
  valueClassName = "mt-0.5 text-[12px] leading-tight text-[var(--pos-text-1)]",
  inputClassName = cashbookUnderlineInput,
  labelClassName = cashbookFieldLabel,
}: {
  fieldKey: CashbookEditableField;
  label: string;
  value: string;
  activeField: CashbookEditableField | null;
  setActiveField: (field: CashbookEditableField | null) => void;
  onSave: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  valueClassName?: string;
  inputClassName?: string;
  labelClassName?: string;
}) {
  const isActive = activeField === fieldKey;
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isActive) setDraft(value);
  }, [value, isActive]);

  useEffect(() => {
    if (isActive) inputRef.current?.focus();
  }, [isActive]);

  const commit = () => {
    if (draft.trim() !== value.trim()) onSave(draft);
    setActiveField(null);
  };

  const cancel = () => {
    setDraft(value);
    setActiveField(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-1.5">
        <span className={labelClassName}>{label}</span>
        {!isActive ? (
          <CashbookFieldEditButton label={label} onClick={() => setActiveField(fieldKey)} />
        ) : null}
      </div>
      {isActive ? (
        multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder={placeholder}
            className={cashbookUnderlineTextarea}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className={`${inputClassName} mt-0.5`}
          />
        )
      ) : (
        <p className={valueClassName}>{value.trim() || "Not set"}</p>
      )}
    </div>
  );
}

function CashbookModalPanel({
  supplier,
  balanceCents,
  recentEntries,
  onSaveField,
}: {
  supplier: Supplier;
  balanceCents: number;
  recentEntries: LedgerEntry[];
  onSaveField: (patch: Partial<Supplier>) => void;
}) {
  const purpose = supplier.bookPurpose ?? "vendor";
  const isEmployee = purpose === "employees";
  const balanceLabel = isEmployee ? "Balance" : "Payable";
  const balanceTone =
    balanceCents > 0
      ? "text-[#6a3030]"
      : balanceCents < 0
        ? "text-[#1a5c40]"
        : "text-[var(--pos-text-1)]";

  const [activeField, setActiveField] = useState<CashbookEditableField | null>(null);

  const saveTextField = (key: keyof Supplier, value: string) => {
    onSaveField({ [key]: value.trim() } as Partial<Supplier>);
  };

  return (
    <div className="space-y-2">
      <div className="rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--pos-text-2)]">
              {balanceLabel}
            </p>
            <p
              className={`mt-0.5 font-mono text-[22px] font-semibold leading-none tabular-nums ${balanceTone}`}
            >
              {formatMoney(balanceCents)}
            </p>
          </div>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] text-[var(--pos-text-2)]">
            <User className="size-4" strokeWidth={1.75} aria-hidden />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] divide-y divide-[var(--pos-divider)]">
        <div className={cashbookFieldRow}>
          <CashbookInlineTextField
            fieldKey="name"
            label="Name"
            value={supplier.name}
            activeField={activeField}
            setActiveField={setActiveField}
            onSave={(next) => saveTextField("name", next)}
            placeholder="Cashbook name"
            valueClassName="mt-0.5 text-[14px] font-semibold leading-tight text-[var(--pos-text-1)]"
            inputClassName={cashbookUnderlineInputLg}
          />
        </div>

        <div className={cashbookFieldRow}>
          <div className="flex items-center justify-between gap-1.5">
            <span className={cashbookFieldLabel}>Book type</span>
            {activeField !== "bookPurpose" ? (
              <CashbookFieldEditButton
                label="Book type"
                onClick={() => setActiveField("bookPurpose")}
              />
            ) : null}
          </div>
          {activeField === "bookPurpose" ? (
            <div className="mt-1">
              <ChoiceChips
                label=""
                value={purpose}
                options={LEDGER_BOOK_PURPOSE_OPTIONS}
                onChange={(bookPurpose) => {
                  onSaveField({ bookPurpose });
                  setActiveField(null);
                }}
                ariaLabel="Cashbook type"
              />
            </div>
          ) : (
            <div className="mt-0.5">
              <CashbookBookTypeChip purpose={purpose} />
            </div>
          )}
        </div>

        <div className={cashbookFieldRow}>
          <CashbookInlineTextField
            fieldKey="contactPerson"
            label="Contact person"
            value={supplier.contactPerson}
            activeField={activeField}
            setActiveField={setActiveField}
            onSave={(next) => saveTextField("contactPerson", next)}
            placeholder="Contact name"
            valueClassName="mt-0.5 truncate text-[12px] font-semibold leading-tight text-[var(--pos-text-1)]"
            inputClassName={`${cashbookUnderlineInput} font-semibold`}
          />
        </div>

        <div className="grid grid-cols-2 divide-x divide-[var(--pos-divider)]">
          <div className={`${cashbookFieldRow} min-w-0`}>
            <CashbookInlineTextField
              fieldKey="phone"
              label="Phone"
              value={supplier.phone}
              activeField={activeField}
              setActiveField={setActiveField}
              onSave={(next) => saveTextField("phone", next)}
              placeholder="Phone number"
              valueClassName="mt-0.5 truncate text-[12px] leading-tight text-[var(--pos-text-1)]"
            />
          </div>
          <div className={`${cashbookFieldRow} min-w-0`}>
            <CashbookInlineTextField
              fieldKey="email"
              label="Email"
              value={supplier.email}
              activeField={activeField}
              setActiveField={setActiveField}
              onSave={(next) => saveTextField("email", next)}
              placeholder="Email address"
              valueClassName="mt-0.5 truncate text-[12px] leading-tight text-[var(--pos-text-1)]"
            />
          </div>
        </div>

        <div className={cashbookFieldRow}>
          <CashbookInlineTextField
            fieldKey="address"
            label="Address"
            value={supplier.address}
            activeField={activeField}
            setActiveField={setActiveField}
            onSave={(next) => saveTextField("address", next)}
            placeholder="Street, area, city"
          />
        </div>

        <div className={cashbookFieldRow}>
          <CashbookInlineTextField
            fieldKey="notes"
            label="Notes"
            value={supplier.notes}
            activeField={activeField}
            setActiveField={setActiveField}
            onSave={(next) => saveTextField("notes", next)}
            placeholder="Optional notes"
            multiline
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]">
        <div className="flex items-center justify-between gap-2 border-b border-solid [border-color:var(--pos-divider)] px-2.5 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)]">
            Recent activity
          </p>
          <span className="text-[10px] tabular-nums text-[var(--pos-text-2)]">
            {recentEntries.length} shown
          </span>
        </div>
        {recentEntries.length === 0 ? (
          <p className="px-2.5 py-3 text-center text-[12px] text-[var(--pos-text-2)]">
            No bills or payments yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--pos-divider)]">
            {recentEntries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <p className="text-[12px] font-medium leading-tight text-[var(--pos-text-1)]">
                    {ledgerEntryLineLabel(entry)}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-[var(--pos-text-2)]">
                    {entry.date} · {ledgerRowDetails(entry)}
                  </p>
                </div>
                <p
                  className={`shrink-0 font-mono text-[11px] font-semibold tabular-nums ${
                    entry.amountCents >= 0 ? "text-[#6a3030]" : "text-[#1a5c40]"
                  }`}
                >
                  {entry.amountCents >= 0 ? "+" : ""}
                  {formatMoney(entry.amountCents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-center font-mono text-[10px] text-[var(--pos-text-2)]">{supplier.id}</p>
    </div>
  );
}

function CashbookCreateForm({
  draft,
  onDraftChange,
}: {
  draft: Partial<Supplier>;
  onDraftChange: (patch: Partial<Supplier>) => void;
}) {
  const purpose = draft.bookPurpose ?? "vendor";
  const patch = (p: Partial<Supplier>) => onDraftChange({ ...draft, ...p });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className={purchaseLabel}>Name</span>
        <input
          value={draft.name ?? ""}
          onChange={(e) => patch({ name: e.target.value })}
          className={purchaseField}
          required
          autoFocus
          placeholder={
            purpose === "employees" ? `${EMPLOYEE_LEDGER_BOOK_NAME_PREFIX}Full name` : undefined
          }
        />
      </label>
      <div className="sm:col-span-2">
        <ChoiceChips
          label="Book type"
          value={purpose}
          options={LEDGER_BOOK_PURPOSE_OPTIONS}
          onChange={(bookPurpose) => patch({ bookPurpose })}
          ariaLabel="Cashbook type"
        />
      </div>
      <label className="block sm:col-span-2">
        <span className={purchaseLabel}>Contact person</span>
        <input
          value={draft.contactPerson ?? ""}
          onChange={(e) => patch({ contactPerson: e.target.value })}
          required
          className={purchaseField}
        />
      </label>
      <label className="block">
        <span className={purchaseLabel}>Phone</span>
        <input
          value={draft.phone ?? ""}
          onChange={(e) => patch({ phone: e.target.value })}
          className={purchaseField}
        />
      </label>
      <label className="block">
        <span className={purchaseLabel}>Email</span>
        <input
          value={draft.email ?? ""}
          onChange={(e) => patch({ email: e.target.value })}
          className={purchaseField}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className={purchaseLabel}>Address</span>
        <input
          value={draft.address ?? ""}
          onChange={(e) => patch({ address: e.target.value })}
          className={purchaseField}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className={purchaseLabel}>Notes</span>
        <textarea
          value={draft.notes ?? ""}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={2}
          className="mt-1 min-h-[72px] w-full rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 py-2 text-[12px] text-[var(--pos-text-1)]"
        />
      </label>
    </div>
  );
}

function GhostButton({
  children,
  onClick,
  type = "button",
  variant = "default",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "default" | "bill" | "pay";
}) {
  const variantClass =
    variant === "bill"
      ? "border-[#e8c4c4] bg-[#fceaea] text-[#7a3535] hover:bg-[#f8d8d8]"
      : variant === "pay"
        ? "border-[#b8dcc4] bg-[#eaf6ee] text-[#2d5c40] hover:bg-[#d8eedf]"
        : "border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-card)] text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/40";

  return (
    <button
      type={type}
      onClick={onClick}
      className={`h-9 cursor-pointer rounded-[9px] border px-3 text-[12px] font-medium transition-colors ${variantClass}`}
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
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const selectedSupplier = useMemo(
    () => ws.suppliers.find((s) => s.id === selectedSupplierId) ?? null,
    [ws.suppliers, selectedSupplierId],
  );

  useEffect(() => {
    if (
      selectedSupplierId &&
      !ws.suppliers.some((s) => s.id === selectedSupplierId)
    ) {
      setSelectedSupplierId(null);
    }
  }, [ws.suppliers, selectedSupplierId]);

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
    setSelectedSupplierId(null);
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

  const closeCashbookModal = useCallback(() => {
    setEditingId(null);
    setDraft({});
    setSelectedSupplierId(null);
  }, []);

  const cancelCreate = useCallback(() => {
    setEditingId(null);
    setDraft({});
    setSelectedSupplierId(null);
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
    setWorkspace((w) => ({
      ...w,
      suppliers: [...w.suppliers, row],
    }));
    setEditingId(null);
    setDraft({});
    setSelectedSupplierId(row.id);
  }, [draft]);

  const saveSupplierField = useCallback(
    (supplierId: string, patch: Partial<Supplier>) => {
      const current = ws.suppliers.find((s) => s.id === supplierId);
      if (!current) return;

      const nextName =
        patch.name !== undefined ? patch.name.trim() : current.name;
      const nextContact =
        patch.contactPerson !== undefined
          ? patch.contactPerson.trim()
          : current.contactPerson;

      if (patch.name !== undefined && !nextName) return;
      if (patch.contactPerson !== undefined && !nextContact) return;

      const row: Supplier = {
        ...current,
        ...patch,
        name: nextName,
        contactPerson: nextContact,
        phone: patch.phone !== undefined ? patch.phone.trim() : current.phone,
        email: patch.email !== undefined ? patch.email.trim() : current.email,
        address:
          patch.address !== undefined ? patch.address.trim() : current.address,
        notes: patch.notes !== undefined ? patch.notes.trim() : current.notes,
        bookPurpose: patch.bookPurpose ?? current.bookPurpose,
      };

      setWorkspace((w) => ({
        ...w,
        suppliers: w.suppliers.map((s) => (s.id === supplierId ? row : s)),
      }));
    },
    [ws.suppliers],
  );

  const startNewPurchaseFor = useCallback((supplierId: string) => {
    setSelectedSupplierId(null);
    setWorkspace((w) => ({
      ...w,
      ledgerSupplierFilter: supplierId,
      ledgerInvoiceDrawerPrefillSupplierId: supplierId,
      ledgerPaymentDrawerPrefillSupplierId: null,
    }));
    selectLedgerTab("bills");
  }, []);

  const startPaymentFor = useCallback((supplierId: string) => {
    setSelectedSupplierId(null);
    setWorkspace((w) => ({
      ...w,
      ledgerSupplierFilter: supplierId,
      ledgerPaymentDrawerPrefillSupplierId: supplierId,
      ledgerInvoiceDrawerPrefillSupplierId: null,
    }));
    selectLedgerTab("bills");
  }, []);

  const isCreatingNew =
    editingId !== null && !ws.suppliers.some((s) => s.id === editingId);
  const openPayableCount = ws.suppliers.filter(
    (s) => supplierBalance(s.id, ws.ledger) > 0,
  ).length;

  const selectedSupplierRecentEntries = useMemo(() => {
    if (!selectedSupplierId) return [];
    return ws.ledger
      .filter((e) => e.supplierId === selectedSupplierId)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 4);
  }, [ws.ledger, selectedSupplierId]);

  return (
    <div className={purchaseShell}>
      <div className={purchaseHead}>
        <ModuleTitle
          title="Cashbooks"
          subtitle="Tag each book as vendor, owners, or employees. Balances come from Bills & Payments."
        />
        <PrimaryButton type="button" onClick={startCreate}>
          Add cashbook
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
              aria-label="Filter cashbooks"
            />
          </label>
          <p className="text-[11px] text-[var(--pos-text-2)] sm:ml-auto">
            Showing{" "}
            <span className="font-semibold text-[var(--pos-text-1)]">{rows.length}</span> cashbooks
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
                  No cashbooks match. Add one or clear the search.
                </td>
              </tr>
            ) : (
              rows.map((s) => {
                const bal = supplierBalance(s.id, ws.ledger);
                const rowOpen = selectedSupplierId === s.id;
                return (
                  <tr
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setSelectedSupplierId((prev) => (prev === s.id ? null : s.id))
                    }
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        setSelectedSupplierId((prev) => (prev === s.id ? null : s.id));
                      }
                    }}
                    aria-expanded={rowOpen}
                    aria-label={`${s.name}, show details`}
                    className={`cursor-pointer border-b border-solid [border-color:var(--pos-divider)] transition-colors hover:bg-[var(--pos-nav-hover)]/35 ${
                      rowOpen ? "bg-[var(--pos-nav-hover)]/50" : ""
                    }`}
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
                    <td
                      className="px-4 py-2 text-right"
                      onClick={(ev) => ev.stopPropagation()}
                      onKeyDown={(ev) => ev.stopPropagation()}
                    >
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {s.bookPurpose !== "employees" ? (
                          <GhostButton variant="bill" onClick={() => startNewPurchaseFor(s.id)}>
                            <span className="inline-flex items-center gap-1">
                              <Receipt className="size-3.5" strokeWidth={2} />
                              Bill
                            </span>
                          </GhostButton>
                        ) : null}
                        <GhostButton variant="pay" onClick={() => startPaymentFor(s.id)}>
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

      {isCreatingNew || selectedSupplier ? (
        <LedgerCenterModal
          title={
            isCreatingNew ? (
              "New cashbook"
            ) : selectedSupplier ? (
              <>
                <span className="min-w-0 truncate">{selectedSupplier.name}</span>
                <CashbookBookTypeChip purpose={selectedSupplier.bookPurpose} />
              </>
            ) : (
              "Cashbook"
            )
          }
          titleId="cashbook-modal-title"
          subtitle={
            isCreatingNew && draft.id ? (
              <p className="text-[11px] font-mono text-[var(--pos-text-2)]">{draft.id}</p>
            ) : null
          }
          onClose={isCreatingNew ? cancelCreate : closeCashbookModal}
          footer={
            isCreatingNew ? (
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelCreate}
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
            ) : selectedSupplier ? (
              <div className="flex flex-wrap items-center gap-2">
                {selectedSupplier.bookPurpose !== "employees" ? (
                  <GhostButton
                    variant="bill"
                    onClick={() => startNewPurchaseFor(selectedSupplier.id)}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Receipt className="size-3.5" strokeWidth={2} />
                      Bill
                    </span>
                  </GhostButton>
                ) : null}
                <GhostButton variant="pay" onClick={() => startPaymentFor(selectedSupplier.id)}>
                  <span className="inline-flex items-center gap-1">
                    <Banknote className="size-3.5" strokeWidth={2} />
                    Pay
                  </span>
                </GhostButton>
              </div>
            ) : null
          }
        >
          {isCreatingNew ? (
            <CashbookCreateForm
              draft={draft}
              onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            />
          ) : selectedSupplier ? (
            <CashbookModalPanel
              supplier={selectedSupplier}
              balanceCents={supplierBalance(selectedSupplier.id, ws.ledger)}
              recentEntries={selectedSupplierRecentEntries}
              onSaveField={(patch) => saveSupplierField(selectedSupplier.id, patch)}
            />
          ) : null}
        </LedgerCenterModal>
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
    return "Staff cashbook";
  }
  return ledgerKindForDisplay(d.kind);
}

function ledgerRowDetails(e: LedgerEntry): string {
  const items = e.items ?? [];
  if (items.length > 0) {
    const first = items[0]?.name.trim() || "Item";
    if (items.length === 1) {
      const line = items[0]!;
      return `${first} · ${line.qty} ${line.unit}`.trim();
    }
    return `${first} +${items.length - 1} more`;
  }
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

const LEDGER_ITEM_UNITS = [
  "pcs",
  "kg",
  "g",
  "L",
  "ml",
  "box",
  "bag",
  "dozen",
  "pack",
  "bottle",
] as const;

/** Kinds exposed when adding a line (vendor books). Return / adjustment stay in data & detail views only. */
export type LedgerEntryDrawerKind = Extract<LedgerEntry["type"], "invoice" | "payment">;

export const LEDGER_DRAWER_KINDS: { value: LedgerEntryDrawerKind; label: string }[] = [
  { value: "invoice", label: "Bill" },
  { value: "payment", label: "Payment" },
];

type LedgerItemDraft = {
  key: string;
  name: string;
  qty: string;
  unit: string;
  rate: string;
};

type LedgerEntryDraft = {
  supplierId: string;
  date: string;
  /** Vendor drawer: invoice | payment only. Staff books always commit as payment. */
  kind: LedgerEntry["type"];
  amount: string;
  method: (typeof LEDGER_PAYMENT_METHODS)[number];
  notes: string;
  attachment: LedgerAttachment | null;
  /** Set on employee cashbooks — salary, service charge, bonus, overtime. */
  employeeLineKind: "" | EmployeeLedgerLineKind;
  /** Bill line items (name / qty / unit / rate). */
  items: LedgerItemDraft[];
};

function newLedgerItemDraft(): LedgerItemDraft {
  return {
    key: `li-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    qty: "1",
    unit: "pcs",
    rate: "",
  };
}

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
    items: isEmp ? [] : [newLedgerItemDraft()],
  };
}

function itemDraftTotalCents(item: LedgerItemDraft): number | null {
  const qty = Number.parseFloat(item.qty);
  const rate = Number.parseFloat(item.rate);
  if (!Number.isFinite(qty) || !Number.isFinite(rate)) return null;
  if (qty <= 0 || rate < 0) return null;
  return Math.round(qty * rate * 100);
}

function draftHasItemRows(d: LedgerEntryDraft): boolean {
  return d.kind === "invoice" && d.items.some((i) => i.name.trim().length > 0);
}

function committedItemsFromDraft(d: LedgerEntryDraft): LedgerItemLine[] | null {
  if (d.kind !== "invoice") return [];
  const named = d.items.filter((i) => i.name.trim().length > 0);
  if (named.length === 0) return [];
  const lines: LedgerItemLine[] = [];
  for (let i = 0; i < named.length; i++) {
    const row = named[i]!;
    const totalCents = itemDraftTotalCents(row);
    if (totalCents === null || totalCents <= 0) return null;
    const qty = Number.parseFloat(row.qty);
    const rate = Number.parseFloat(row.rate);
    lines.push({
      id: `it-${String(i + 1).padStart(3, "0")}`,
      name: row.name.trim(),
      qty,
      unit: row.unit.trim() || "pcs",
      rateCents: Math.round(rate * 100),
      totalCents,
    });
  }
  return lines;
}

function itemsTotalCentsFromDraft(d: LedgerEntryDraft): number | null {
  const lines = committedItemsFromDraft(d);
  if (lines === null) return null;
  if (lines.length === 0) return null;
  return lines.reduce((s, l) => s + l.totalCents, 0);
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
  if (isEmployeesBookSupplierId(d.supplierId) && d.employeeLineKind) {
    const nRaw = Number.parseFloat(d.amount);
    if (!Number.isFinite(nRaw)) return null;
    const cents = Math.round(Math.max(0, nRaw) * 100);
    if (cents <= 0) return null;
    return -cents;
  }

  if (d.kind === "invoice" && draftHasItemRows(d)) {
    const itemsTotal = itemsTotalCentsFromDraft(d);
    if (itemsTotal === null || itemsTotal <= 0) return null;
    return itemsTotal;
  }

  const nRaw = Number.parseFloat(d.amount);
  if (!Number.isFinite(nRaw)) return null;
  const n = Math.max(0, nRaw);
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
  if (isEmployeesBookSupplierId(d.supplierId)) {
    if (!d.employeeLineKind) return true;
    if (!d.amount.trim()) return true;
    return amountCentsFromLedgerDraft(d) === null;
  }
  if (d.kind === "invoice" && draftHasItemRows(d)) {
    return amountCentsFromLedgerDraft(d) === null;
  }
  if (!d.amount.trim() && !draftHasItemRows(d)) return true;
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
    const items = committedItemsFromDraft(draft);
    if (items === null) return { ok: false };

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
      ...(items.length > 0 ? { items } : {}),
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
      ...(items.length > 0 ? { items } : {}),
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
    items: [],
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
    items: [],
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
    items: [],
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

/** Centered wide modal shell for cashbook entry forms. */
function LedgerDrawerFrame({
  title,
  subtitle,
  children,
  footer,
  onClose,
  titleId,
  overlayClassName = "z-[200]",
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  titleId: string;
  /** z-index for stacking over other POS overlays (e.g. Daily Entry). */
  overlayClassName?: string;
}) {
  return (
    <div
      className={`fixed inset-0 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4 ${overlayClassName}`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div
        className="relative z-[1] flex max-h-[min(90vh,820px)] w-full max-w-[960px] flex-col overflow-hidden rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-lg sm:rounded-[14px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-[15px] font-semibold leading-snug text-[var(--pos-text-1)]"
              >
                {title}
              </h2>
              {subtitle ? <div className="mt-1.5">{subtitle}</div> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-solid [border-color:var(--pos-input-border)] text-[var(--pos-text-2)] transition-colors hover:border-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)]"
              aria-label="Close"
            >
              <X className="size-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        <div className="shrink-0 border-t border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-4 py-3">
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
      items: emp ? [] : ledgerDraft.items.length > 0 ? ledgerDraft.items : [newLedgerItemDraft()],
    });
  };

  const patchItem = (key: string, patch: Partial<LedgerItemDraft>) => {
    patchLedgerDraft({
      items: ledgerDraft.items.map((row) =>
        row.key === key ? { ...row, ...patch } : row,
      ),
    });
  };

  const addItemRow = () => {
    patchLedgerDraft({ items: [...ledgerDraft.items, newLedgerItemDraft()] });
  };

  const removeItemRow = (key: string) => {
    const next = ledgerDraft.items.filter((row) => row.key !== key);
    patchLedgerDraft({ items: next.length > 0 ? next : [newLedgerItemDraft()] });
  };

  const itemsSubtotalCents = (() => {
    if (ledgerDraft.kind !== "invoice") return null;
    let sum = 0;
    let any = false;
    for (const row of ledgerDraft.items) {
      if (!row.name.trim()) continue;
      const lineTotal = itemDraftTotalCents(row);
      if (lineTotal === null) return null;
      sum += lineTotal;
      any = true;
    }
    return any ? sum : null;
  })();

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
                  patchLedgerDraft({
                    kind,
                    items:
                      kind === "invoice"
                        ? ledgerDraft.items.length > 0
                          ? ledgerDraft.items
                          : [newLedgerItemDraft()]
                        : [],
                  });
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
              <div className="col-span-2 space-y-2">
                <p className={`${purchaseLabel} font-semibold text-[var(--pos-text-1)]`}>
                  Items
                </p>
                <div className="overflow-x-auto">
                  <div
                    className="mb-1 grid min-w-[460px] gap-1 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)]"
                    style={{ gridTemplateColumns: "minmax(0,1.4fr) 52px 64px 72px 72px 28px" }}
                  >
                    <span>Name</span>
                    <span className="text-right">Qty</span>
                    <span>Unit</span>
                    <span className="text-right">Rate</span>
                    <span className="text-right">Total</span>
                    <span />
                  </div>
                  <div className="space-y-1.5">
                    {ledgerDraft.items.map((row, idx) => {
                      const lineTotal = itemDraftTotalCents(row);
                      const itemField =
                        "h-8 w-full rounded-[7px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-1.5 text-[12px] text-[var(--pos-text-1)]";
                      return (
                        <div
                          key={row.key}
                          className="grid min-w-[460px] items-center gap-1"
                          style={{
                            gridTemplateColumns: "minmax(0,1.4fr) 52px 64px 72px 72px 28px",
                          }}
                        >
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => patchItem(row.key, { name: e.target.value })}
                            placeholder="Item name"
                            aria-label={`Item ${idx + 1} name`}
                            className={itemField}
                          />
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={row.qty}
                            onChange={(e) =>
                              patchItem(row.key, {
                                qty: sanitizeNonNegativeDecimalInput(e.target.value),
                              })
                            }
                            placeholder="1"
                            aria-label={`Item ${idx + 1} quantity`}
                            className={`${itemField} text-right font-mono`}
                          />
                          <select
                            value={row.unit}
                            onChange={(e) => patchItem(row.key, { unit: e.target.value })}
                            aria-label={`Item ${idx + 1} unit`}
                            className={itemField}
                          >
                            {LEDGER_ITEM_UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={row.rate}
                            onChange={(e) =>
                              patchItem(row.key, {
                                rate: sanitizeNonNegativeDecimalInput(e.target.value),
                              })
                            }
                            placeholder="0"
                            aria-label={`Item ${idx + 1} rate`}
                            className={`${itemField} text-right font-mono`}
                          />
                          <div
                            className="flex h-8 items-center justify-end px-1 font-mono text-[11px] font-semibold tabular-nums text-[var(--pos-text-1)]"
                            aria-label={`Item ${idx + 1} total`}
                          >
                            {lineTotal !== null ? formatMoney(lineTotal) : "—"}
                          </div>
                          {ledgerDraft.items.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeItemRow(row.key)}
                              className="inline-flex size-7 items-center justify-center rounded-full text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-nav-hover)]/50 hover:text-[var(--pos-text-1)]"
                              aria-label={`Remove item ${idx + 1}`}
                            >
                              <Trash2 className="size-3.5" strokeWidth={2} aria-hidden />
                            </button>
                          ) : (
                            <span />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={addItemRow}
                  className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-[7px] border border-dashed border-[var(--pos-input-border)] bg-[var(--pos-page)] px-2 text-[11px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-nav-hover)]/40"
                >
                  <Plus className="size-3.5" strokeWidth={2} aria-hidden />
                  Add item
                </button>
                <div className="flex items-center justify-between rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2">
                  <span className="text-[11px] font-medium text-[var(--pos-text-2)]">
                    Bill total
                  </span>
                  <span className="font-mono text-[14px] font-semibold tabular-nums text-[var(--pos-text-1)]">
                    {itemsSubtotalCents !== null
                      ? formatMoney(itemsSubtotalCents)
                      : ledgerDraft.amount.trim()
                        ? formatMoney(Math.round(Number.parseFloat(ledgerDraft.amount || "0") * 100) || 0)
                        : "—"}
                  </span>
                </div>
                {itemsSubtotalCents === null ? (
                  <div className="min-w-0">
                    <span className={purchaseLabel}>
                      Amount (৳) — optional if you skip item names
                    </span>
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
                ) : null}
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
        const itemNames = (x.items ?? [])
          .map((it) => it.name.toLowerCase())
          .join(" ");
        return (
          x.ref.toLowerCase().includes(q) ||
          x.memo.toLowerCase().includes(q) ||
          supplierName(x.supplierId).toLowerCase().includes(q) ||
          x.type.includes(q) ||
          kindLabel.includes(q) ||
          empKindQ.includes(q) ||
          purposeLabel.includes(q) ||
          itemNames.includes(q)
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

  /** Aggregate item lines across the current filtered view for a quick purchase rollup. */
  const itemsInView = useMemo(() => {
    const byKey = new Map<
      string,
      { name: string; unit: string; qty: number; totalCents: number }
    >();
    for (const e of entries) {
      const lines = ledgerEntryItems(e, ws.moves);
      for (const line of lines) {
        const key = `${line.name.trim().toLowerCase()}|${line.unit.trim().toLowerCase()}`;
        const prev = byKey.get(key);
        if (prev) {
          prev.qty += line.qty;
          prev.totalCents += line.totalCents;
        } else {
          byKey.set(key, {
            name: line.name.trim(),
            unit: line.unit,
            qty: line.qty,
            totalCents: line.totalCents,
          });
        }
      }
    }
    return [...byKey.values()]
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 8);
  }, [entries, ws.moves]);

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
          title={viewingEmployeeBook ? "Staff cashbook" : "Bills & Payments"}
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

      {ws.suppliers.length === 0 ? (
        <div className="border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-3">
          <p className="text-[12px] text-[var(--pos-text-2)]">
            Add a cashbook first - vendor, owner, or employee - then record bills and
            payments here.
          </p>
          <button
            type="button"
            onClick={() => selectLedgerTab("books")}
            className="mt-2 text-[12px] font-semibold text-[var(--pos-text-1)] underline-offset-2 hover:underline"
          >
            Go to Cashbooks
          </button>
        </div>
      ) : null}

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
              placeholder="Ref, memo, book, item…"
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
            aria-label="Filter by cashbook"
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

      {!viewingEmployeeBook && itemsInView.length > 0 ? (
        <div className="border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2.5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)]">
              Items in view
            </p>
            <p className="text-[10px] text-[var(--pos-text-2)]">
              Top {itemsInView.length} by spend · click a bill for full lines
            </p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {itemsInView.map((row) => (
              <div
                key={`${row.name}|${row.unit}`}
                className="min-w-[140px] shrink-0 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2"
              >
                <p className="truncate text-[12px] font-medium text-[var(--pos-text-1)]" title={row.name}>
                  {row.name}
                </p>
                <p className="mt-0.5 text-[11px] tabular-nums text-[var(--pos-text-2)]">
                  {row.qty} {row.unit}
                </p>
                <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-[var(--pos-text-1)]">
                  {formatMoney(row.totalCents)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
            <tr className="border-b border-solid [border-color:var(--pos-divider)]">
              <th className={purchaseTh}>Date</th>
              <th className={purchaseTh}>Cashbook</th>
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
                  {ws.suppliers.length === 0
                    ? "No cashbooks yet - open Cashbooks and add one to start posting bills and payments."
                    : ws.ledger.length === 0
                      ? "No activity yet. Use Add entry to post a bill or payment."
                      : "No entries match your filters - adjust search, cashbook, type, or dates."}
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
                      <span className="inline-flex max-w-full items-center gap-1.5">
                        {(e.items?.length ?? 0) > 0 ? (
                          <span className="shrink-0 rounded bg-[var(--pos-nav-hover)]/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)]">
                            {e.items!.length} item{e.items!.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        <span className="truncate">{ledgerRowDetails(e)}</span>
                      </span>
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
              ? "Add staff cashbook line"
              : "Cashboarrd Entry"
          }
          titleId="ledger-entry-drawer-title"
          subtitle={
            ledgerDraft.supplierId ? (
              <p className="text-[11px] text-[var(--pos-text-2)]">
                {supplierName(ledgerDraft.supplierId)} · {ledgerDraftSummaryLabel(ledgerDraft)}
              </p>
            ) : (
              <p className="text-[11px] text-[var(--pos-text-2)]">
                Choose a cashbook, then enter items or amount.
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

type PurchasedItemRow = {
  key: string;
  date: string;
  supplierId: string;
  supplierName: string;
  itemName: string;
  qty: number;
  unit: string;
  rateCents: number;
  totalCents: number;
  billRef: string;
  entryId: string;
};

function PurchasedItemsView() {
  const ws = useWorkspace();
  const [searchQ, setSearchQ] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [groupByItem, setGroupByItem] = useState(false);

  const vendorBooks = useMemo(
    () =>
      ws.suppliers
        .filter((s) => (s.bookPurpose ?? "vendor") === "vendor")
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [ws.suppliers],
  );

  const allRows = useMemo(() => {
    const out: PurchasedItemRow[] = [];
    for (const entry of ws.ledger) {
      if (entry.type !== "invoice") continue;
      const supplier = ws.suppliers.find((s) => s.id === entry.supplierId);
      if (supplier && supplier.bookPurpose === "employees") continue;
      const items = ledgerEntryItems(entry, ws.moves);
      if (items.length === 0) continue;
      const supplierName = supplier?.name ?? entry.supplierId;
      for (const line of items) {
        out.push({
          key: `${entry.id}:${line.id}`,
          date: entry.date,
          supplierId: entry.supplierId,
          supplierName,
          itemName: line.name,
          qty: line.qty,
          unit: line.unit,
          rateCents: line.rateCents,
          totalCents: line.totalCents,
          billRef: entry.ref,
          entryId: entry.id,
        });
      }
    }
    return out.sort(
      (a, b) => b.date.localeCompare(a.date) || a.itemName.localeCompare(b.itemName),
    );
  }, [ws.ledger, ws.moves, ws.suppliers]);

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (vendorFilter) rows = rows.filter((r) => r.supplierId === vendorFilter);
    if (dateFrom) rows = rows.filter((r) => r.date >= dateFrom);
    if (dateTo) rows = rows.filter((r) => r.date <= dateTo);
    const q = searchQ.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.itemName.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q) ||
          r.billRef.toLowerCase().includes(q) ||
          r.unit.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [allRows, vendorFilter, dateFrom, dateTo, searchQ]);

  const stats = useMemo(() => {
    let spendCents = 0;
    const itemKeys = new Set<string>();
    const vendors = new Set<string>();
    for (const r of filteredRows) {
      spendCents += r.totalCents;
      itemKeys.add(`${r.itemName.trim().toLowerCase()}|${r.unit.trim().toLowerCase()}`);
      vendors.add(r.supplierId);
    }
    return {
      spendCents,
      lineCount: filteredRows.length,
      uniqueItems: itemKeys.size,
      vendorCount: vendors.size,
    };
  }, [filteredRows]);

  const groupedRows = useMemo(() => {
    if (!groupByItem) return null;
    const map = new Map<
      string,
      {
        itemName: string;
        unit: string;
        qty: number;
        totalCents: number;
        vendors: Set<string>;
        lastDate: string;
      }
    >();
    for (const r of filteredRows) {
      const key = `${r.itemName.trim().toLowerCase()}|${r.unit.trim().toLowerCase()}`;
      const prev = map.get(key);
      if (prev) {
        prev.qty += r.qty;
        prev.totalCents += r.totalCents;
        prev.vendors.add(r.supplierName);
        if (r.date > prev.lastDate) prev.lastDate = r.date;
      } else {
        map.set(key, {
          itemName: r.itemName,
          unit: r.unit,
          qty: r.qty,
          totalCents: r.totalCents,
          vendors: new Set([r.supplierName]),
          lastDate: r.date,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
  }, [filteredRows, groupByItem]);

  const hasFilters =
    searchQ.trim() !== "" || vendorFilter !== "" || dateFrom !== "" || dateTo !== "";

  const clearFilters = () => {
    setSearchQ("");
    setVendorFilter("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className={purchaseShell}>
      <div className={purchaseHead}>
        <ModuleTitle
          title="Items purchased"
          subtitle="Every item line from vendor bills across all cashbooks."
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGroupByItem((v) => !v)}
            className={`h-9 cursor-pointer rounded-[9px] border border-solid px-3 text-[12px] font-medium transition-colors ${
              groupByItem
                ? "border-[var(--pos-sb-base)] bg-[var(--pos-nav-hover)]/50 text-[var(--pos-text-1)]"
                : "[border-color:var(--pos-input-border)] text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/40"
            }`}
          >
            {groupByItem ? "Show each purchase" : "Group by item"}
          </button>
          <button
            type="button"
            onClick={() => selectLedgerTab("bills")}
            className="h-9 cursor-pointer rounded-[9px] border border-solid [border-color:var(--pos-input-border)] px-3 text-[12px] text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/40"
          >
            Bills & payments
          </button>
        </div>
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
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Item, vendor, bill ref…"
              className={purchaseSearchInput}
              aria-label="Search purchased items"
            />
          </div>
        </label>
        <label className="block min-w-[160px] max-w-[240px] flex-1">
          <span className={purchaseLabel}>Vendor</span>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className={purchaseField}
            aria-label="Filter by vendor"
          >
            <option value="">All vendors</option>
            {vendorBooks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[120px] max-w-[140px]">
          <span className={purchaseLabel}>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={purchaseField}
            aria-label="From date"
          />
        </label>
        <label className="block min-w-[120px] max-w-[140px]">
          <span className={purchaseLabel}>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={purchaseField}
            aria-label="To date"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {hasFilters ? (
            <GhostButton type="button" onClick={clearFilters}>
              Clear
            </GhostButton>
          ) : null}
          <span className="text-[11px] text-[var(--pos-text-2)]">
            <span className="font-semibold text-[var(--pos-text-1)]">
              {groupByItem ? (groupedRows?.length ?? 0) : filteredRows.length}
            </span>{" "}
            shown
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2.5">
        <div className={`${purchaseStatCell} min-w-[120px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Spend (view)</div>
          <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--pos-text-1)]">
            {formatMoneyWholeTaka(stats.spendCents)}
          </div>
        </div>
        <div className={`${purchaseStatCell} min-w-[100px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Lines</div>
          <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--pos-text-1)]">
            {stats.lineCount}
          </div>
        </div>
        <div className={`${purchaseStatCell} min-w-[100px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Unique items</div>
          <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--pos-text-1)]">
            {stats.uniqueItems}
          </div>
        </div>
        <div className={`${purchaseStatCell} min-w-[100px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Vendors</div>
          <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--pos-text-1)]">
            {stats.vendorCount}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {groupByItem ? (
          <table className="w-full min-w-[640px] border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
              <tr className="border-b border-solid [border-color:var(--pos-divider)]">
                <th className={purchaseTh}>Item</th>
                <th className={`${purchaseTh} text-right`}>Qty</th>
                <th className={purchaseTh}>Unit</th>
                <th className={purchaseTh}>Vendors</th>
                <th className={purchaseTh}>Last bought</th>
                <th className={`${purchaseTh} text-right`}>Total spend</th>
              </tr>
            </thead>
            <tbody>
              {!groupedRows || groupedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-[12px] text-[var(--pos-text-2)]"
                  >
                    {allRows.length === 0
                      ? "No itemized bills yet. Add items when posting a bill under Bills & payments."
                      : "No items match your filters."}
                  </td>
                </tr>
              ) : (
                groupedRows.map((row) => (
                  <tr
                    key={`${row.itemName}|${row.unit}`}
                    className="border-b border-solid [border-color:var(--pos-divider)]"
                  >
                    <td className="max-w-[200px] truncate px-4 py-2 font-medium text-[var(--pos-text-1)]">
                      {row.itemName}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--pos-text-1)]">
                      {row.qty}
                    </td>
                    <td className="px-4 py-2 text-[var(--pos-text-2)]">{row.unit}</td>
                    <td
                      className="max-w-[220px] truncate px-4 py-2 text-[11px] text-[var(--pos-text-2)]"
                      title={[...row.vendors].join(", ")}
                    >
                      {[...row.vendors].join(", ")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--pos-text-2)]">
                      {row.lastDate}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-[12px] font-semibold tabular-nums text-[var(--pos-text-1)]">
                      {formatMoney(row.totalCents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[780px] border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
              <tr className="border-b border-solid [border-color:var(--pos-divider)]">
                <th className={purchaseTh}>Date</th>
                <th className={purchaseTh}>Vendor</th>
                <th className={purchaseTh}>Item</th>
                <th className={`${purchaseTh} text-right`}>Qty</th>
                <th className={purchaseTh}>Unit</th>
                <th className={`${purchaseTh} text-right`}>Rate</th>
                <th className={`${purchaseTh} text-right`}>Total</th>
                <th className={purchaseTh}>Bill</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-[12px] text-[var(--pos-text-2)]"
                  >
                    {allRows.length === 0
                      ? "No itemized bills yet. Add items when posting a bill under Bills & payments."
                      : "No items match your filters."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-solid [border-color:var(--pos-divider)]"
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--pos-text-2)]">
                      {row.date}
                    </td>
                    <td className="max-w-[140px] truncate px-4 py-2 font-medium text-[var(--pos-text-1)]">
                      {row.supplierName}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-2 text-[var(--pos-text-1)]">
                      {row.itemName}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--pos-text-1)]">
                      {row.qty}
                    </td>
                    <td className="px-4 py-2 text-[var(--pos-text-2)]">{row.unit}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[var(--pos-text-2)]">
                      {formatMoney(row.rateCents)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums text-[var(--pos-text-1)]">
                      {formatMoney(row.totalCents)}
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] text-[var(--pos-text-2)]">
                      {row.billRef}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function LedgerModuleView({ leafId }: { leafId: string }) {
  const tab = ledgerTabFromLeafId(leafId);
  const ledgerLoad = useSyncExternalStore(
    subscribeWorkspace,
    getLedgerWorkspaceLoadState,
    getLedgerWorkspaceLoadState,
  );

  useEffect(() => {
    void loadLedgerWorkspace();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {ledgerLoad.loading ? (
        <p className="shrink-0 px-1 text-[12px] text-[var(--pos-text-2)]">Loading cashbooks…</p>
      ) : null}
      {ledgerLoad.error ? (
        <p className="shrink-0 rounded-[8px] border border-solid border-[#c45a5a]/40 bg-[#f5e4e4]/50 px-3 py-2 text-[12px] text-[#8a3030]">
          {ledgerLoad.error}
        </p>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {tab === "books" ? (
          <SupplierListView />
        ) : tab === "items" ? (
          <PurchasedItemsView />
        ) : (
          <SupplierLedgerView />
        )}
      </div>
    </div>
  );
}
