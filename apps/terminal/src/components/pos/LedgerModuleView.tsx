import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Banknote,
  FileText,
  Lock,
  LockOpen,
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
import { uploadFileToStorage, purgeStoredMediaRef, attachmentUploadBlockedMessage } from "@/features/storage";
import { fromStorageRef } from "@/features/storage/storageRef";
import {
  unlinkDailyExpenseLinesForLedgerEntry,
  upsertDailyPurchaseFromLedgerInvoice,
} from "@/features/daily-entry";
import { useSession } from "@/features/auth";
import { dispatchPosSelectLeaf } from "../../lib/posNavEvents";
import { MediaThumb } from "./MediaThumb";
import { ReceiptPreviewBody } from "./ReceiptPreviewBody";
import {
  getLedgerWorkspaceLoadState,
  getWorkspace,
  isLedgerEntryLocked,
  loadLedgerWorkspace,
  setWorkspace,
  subscribeWorkspace,
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
  "lm-cashbooks",
  "lm-management",
  "lm-suppliers",
  "lm-ledger",
  "lm-items",
]);

export type LedgerPanelTab = "books" | "bills" | "items";
export type CashbooksPanel = "books" | "bills";

const CASHBOOKS_PANEL_OPTIONS: { value: CashbooksPanel; label: string }[] = [
  { value: "books", label: "Books" },
  { value: "bills", label: "Bills & payments" },
];

/** In-page panel for the combined Cashbooks leaf (survives leaf remounts within the module). */
let cashbooksPanel: CashbooksPanel = "bills";
const cashbooksPanelListeners = new Set<() => void>();

function getCashbooksPanel(): CashbooksPanel {
  return cashbooksPanel;
}

function subscribeCashbooksPanel(cb: () => void): () => void {
  cashbooksPanelListeners.add(cb);
  return () => {
    cashbooksPanelListeners.delete(cb);
  };
}

function setCashbooksPanel(panel: CashbooksPanel) {
  if (cashbooksPanel === panel) return;
  cashbooksPanel = panel;
  cashbooksPanelListeners.forEach((listener) => listener());
}

function selectLedgerTab(tab: LedgerPanelTab) {
  if (tab === "items") {
    dispatchPosSelectLeaf("lm-items");
    return;
  }
  setCashbooksPanel(tab);
  dispatchPosSelectLeaf("lm-cashbooks");
}

/** Open Cashbooks on a specific in-page panel (Books or Bills & payments). */
export function openCashbooksPanel(panel: CashbooksPanel) {
  selectLedgerTab(panel);
}

function isItemsLedgerLeaf(leafId: string): boolean {
  return leafId === "lm-items";
}

/** Cashbooks are vendor AP books (legacy owner type removed). */
export type { LedgerBookPurpose };

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

function useWorkspace(): Workspace {
  return useSyncExternalStore(subscribeWorkspace, getWorkspace, getWorkspace);
}

const ledgerBookNamesCacheByPurpose = new Map<
  string,
  { contentKey: string; names: string[] }
>();

/** Sorted unique cashbook names — for Daily Entry vendor lines and pickers. */
export function subscribeLedgerWorkspace(cb: () => void): () => void {
  return subscribeWorkspace(cb);
}

export function getLedgerBookNamesSnapshot(
  _purpose: LedgerBookPurpose | "all" = "all",
): string[] {
  const names = getWorkspace()
    .suppliers.map((s) => s.name.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const contentKey = names.join("\0");
  const cached = ledgerBookNamesCacheByPurpose.get("all");
  if (cached && cached.contentKey === contentKey) return cached.names;
  ledgerBookNamesCacheByPurpose.set("all", { contentKey, names });
  return names;
}

/** Match a cashbook display name to its id (for Daily Entry lines). */
export function resolveLedgerSupplierIdByBookName(bookName: string): string | null {
  const t = bookName.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const hit = getWorkspace().suppliers.find((s) => s.name.trim().toLowerCase() === lower);
  return hit?.id ?? null;
}

function supplierBalance(supplierId: string, ledger: LedgerEntry[]): number {
  return ledger
    .filter((e) => e.supplierId === supplierId)
    .reduce((s, e) => s + e.amountCents, 0);
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

function isLedgerAttachmentPdf(att: LedgerAttachment): boolean {
  if (att.mimeType === "application/pdf") return true;
  if (att.fileName.toLowerCase().endsWith(".pdf")) return true;
  if (att.dataUrl.startsWith("data:application/pdf")) return true;
  const key = fromStorageRef(att.dataUrl);
  return key != null && key.toLowerCase().endsWith(".pdf");
}

function LedgerAttachmentsDetail({ attachments }: { attachments: LedgerAttachment[] }) {
  const [previewRef, setPreviewRef] = useState<string | null>(null);
  if (attachments.length === 0) return null;
  return (
    <div className="mt-4">
      <p className={purchaseLabel}>
        {attachments.length === 1 ? "Attachment" : `Attachments (${attachments.length})`}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {attachments.map((att, idx) => (
          <button
            key={`${att.dataUrl}-${idx}`}
            type="button"
            className="block overflow-hidden rounded-[6px] border border-solid [border-color:var(--pos-divider)] ring-offset-1 hover:ring-2 hover:ring-[var(--pos-sb-base)]/50"
            onClick={() => setPreviewRef(att.dataUrl)}
            aria-label={
              isLedgerAttachmentPdf(att)
                ? `View PDF ${idx + 1}`
                : `View attachment ${idx + 1}`
            }
            title={att.fileName}
          >
            {isLedgerAttachmentPdf(att) ? (
              <span className="flex size-11 flex-col items-center justify-center gap-0.5 bg-[var(--pos-page)] text-[var(--pos-text-2)]">
                <FileText className="size-5 shrink-0" strokeWidth={2} aria-hidden />
                <span className="text-[8px] font-semibold uppercase">PDF</span>
              </span>
            ) : (
              <MediaThumb
                mediaRef={att.dataUrl}
                alt={att.fileName || `Attachment ${idx + 1}`}
                className="size-11 object-cover"
              />
            )}
          </button>
        ))}
      </div>
      {previewRef ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Attachment preview"
          className="fixed inset-0 z-[220] flex flex-col items-center justify-center bg-black/85 p-4"
          onClick={() => setPreviewRef(null)}
        >
          <button
            type="button"
            className="absolute right-3 top-3 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white/90 hover:bg-white/10"
            onClick={() => setPreviewRef(null)}
          >
            Close
          </button>
          <ReceiptPreviewBody mediaRef={previewRef} />
          <p className="mt-3 max-w-lg text-center text-[11px] text-white/60">
            Tap outside or press Escape to close
          </p>
        </div>
      ) : null}
    </div>
  );
}

function entryAttachments(entry: LedgerEntry): LedgerAttachment[] {
  return entry.attachments ?? [];
}

function LedgerEntryAttachmentField({
  attachments,
  onChange,
}: {
  attachments: LedgerAttachment[];
  onChange: (next: LedgerAttachment[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewRef, setPreviewRef] = useState<string | null>(null);

  const onFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length === 0) return;
      setError(null);
      void (async () => {
        const added: LedgerAttachment[] = [];
        for (const file of files) {
          const blocked = attachmentUploadBlockedMessage(file);
          if (blocked) {
            setError(blocked);
            continue;
          }
          try {
            const dataUrl = await uploadFileToStorage(file, "ledger", file.name);
            added.push({
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              dataUrl,
            });
          } catch {
            setError("Could not upload file");
          }
        }
        if (added.length > 0) onChange([...attachments, ...added]);
      })();
    },
    [attachments, onChange],
  );

  const removeAt = (idx: number) => {
    setError(null);
    const target = attachments[idx];
    onChange(attachments.filter((_, i) => i !== idx));
    if (target?.dataUrl) purgeStoredMediaRef(target.dataUrl);
  };

  return (
    <div className="min-w-0">
      <input
        ref={fileInputRef}
        type="file"
        accept={LEDGER_ATTACHMENT_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onFile}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {attachments.map((att, idx) => (
          <div key={`${att.dataUrl}-${idx}`} className="relative inline-flex">
            <button
              type="button"
              className="block overflow-hidden rounded-[6px] border border-solid [border-color:var(--pos-divider)] ring-offset-1 hover:ring-2 hover:ring-[var(--pos-sb-base)]/50"
              onClick={() => setPreviewRef(att.dataUrl)}
              aria-label={
                isLedgerAttachmentPdf(att)
                  ? `View PDF ${idx + 1}`
                  : `View attachment ${idx + 1}`
              }
              title={att.fileName}
            >
              {isLedgerAttachmentPdf(att) ? (
                <span className="flex size-11 flex-col items-center justify-center gap-0.5 bg-[var(--pos-page)] text-[var(--pos-text-2)]">
                  <FileText className="size-5 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="text-[8px] font-semibold uppercase">PDF</span>
                </span>
              ) : (
                <MediaThumb
                  mediaRef={att.dataUrl}
                  alt={att.fileName || `Attachment ${idx + 1}`}
                  className="size-11 object-cover"
                />
              )}
            </button>
            <button
              type="button"
              className="absolute -right-0.5 -top-0.5 z-[1] flex size-4 items-center justify-center rounded-full border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] text-[10px] leading-none text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]"
              aria-label="Remove attachment"
              onClick={() => removeAt(idx)}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach receipt or file"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-[6px] border border-dashed border-[var(--pos-input-border)] bg-[var(--pos-page)] text-[var(--pos-text-2)] transition-colors hover:border-[var(--pos-sb-base)] hover:text-[var(--pos-text-1)]"
        >
          <Paperclip className="size-4 shrink-0" strokeWidth={2} aria-hidden />
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-[var(--pos-text-2)]">
        Photo, PDF, or HEIC — tap a box to view. Multiple files allowed.
      </p>
      {error ? <p className="mt-2 text-[11px] text-[#8a3030]">{error}</p> : null}
      {previewRef ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Attachment preview"
          className="fixed inset-0 z-[220] flex flex-col items-center justify-center bg-black/85 p-4"
          onClick={() => setPreviewRef(null)}
        >
          <button
            type="button"
            className="absolute right-3 top-3 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white/90 hover:bg-white/10"
            onClick={() => setPreviewRef(null)}
          >
            Close
          </button>
          <ReceiptPreviewBody mediaRef={previewRef} />
          <p className="mt-3 max-w-lg text-center text-[11px] text-white/60">
            Tap outside or press Escape to close
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Right sheet: ledger row detail (linked bill or return when available). */
function LedgerDetailSlideOver({
  title,
  subtitle,
  actions,
  children,
  onClose,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
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
          {actions ? <div className="mt-3 flex flex-wrap items-center gap-1.5">{actions}</div> : null}
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
  if (typeof document === "undefined") return null;

  return createPortal(
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
    </div>,
    document.body,
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
  const atts = entryAttachments(entry);
  const items = ledgerEntryItems(entry, moves);

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
        {atts.length > 0 ? <LedgerAttachmentsDetail attachments={atts} /> : null}
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
        {atts.length > 0 ? <LedgerAttachmentsDetail attachments={atts} /> : null}
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
    {atts.length > 0 ? <LedgerAttachmentsDetail attachments={atts} /> : null}
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
              Payable
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
        />
      </label>
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
  disabled = false,
}: {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit";
  variant?: "default" | "bill" | "pay";
  disabled?: boolean;
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
      disabled={disabled}
      className={`h-9 cursor-pointer rounded-[9px] border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${variantClass}`}
    >
      {children}
    </button>
  );
}

function DangerGhostButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[8px] border border-solid border-[#c45a5a]/50 bg-[var(--pos-card)] px-2.5 py-1.5 text-[11px] font-medium text-[#8a3030] transition-colors hover:bg-[#f5e4e4]/80 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}


function SupplierListView() {
  const ws = useWorkspace();
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Supplier>>({});
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [pendingDeleteSupplierId, setPendingDeleteSupplierId] = useState<string | null>(
    null,
  );
  const [deleteBusy, setDeleteBusy] = useState(false);

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
        bookPurpose: "vendor",
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

  const pendingDeleteSupplier = useMemo(
    () =>
      pendingDeleteSupplierId
        ? ws.suppliers.find((s) => s.id === pendingDeleteSupplierId) ?? null
        : null,
    [ws.suppliers, pendingDeleteSupplierId],
  );

  const pendingDeleteEntryCount = useMemo(() => {
    if (!pendingDeleteSupplierId) return 0;
    return ws.ledger.filter((e) => e.supplierId === pendingDeleteSupplierId).length;
  }, [ws.ledger, pendingDeleteSupplierId]);

  const confirmDeleteCashbook = useCallback(async () => {
    if (!pendingDeleteSupplierId || deleteBusy) return;
    const supplierId = pendingDeleteSupplierId;
    const entryIds = getWorkspace()
      .ledger.filter((e) => e.supplierId === supplierId)
      .map((e) => e.id);

    setDeleteBusy(true);
    try {
      for (const entryId of entryIds) {
        const unlink = await unlinkDailyExpenseLinesForLedgerEntry(entryId);
        if (!unlink.ok) {
          window.alert(unlink.message);
          return;
        }
      }
      const result = removeCashbookById(supplierId);
      if (!result.ok) {
        window.alert(result.message);
        return;
      }
      setPendingDeleteSupplierId(null);
      setSelectedSupplierId((prev) => (prev === supplierId ? null : prev));
      setEditingId(null);
      setDraft({});
    } finally {
      setDeleteBusy(false);
    }
  }, [pendingDeleteSupplierId, deleteBusy]);

  return (
    <div className={purchaseShell}>
      <div className={purchaseHead}>
        <ModuleTitle
          title="Books"
          subtitle="Cashbooks for vendors. Balances update from bills and payments."
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
      </div>

      <div className={`${purchaseStats} sm:grid-cols-2`}>
        <div className={purchaseStatCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Books on file</div>
          <div className="mt-0.5 text-[20px] font-semibold leading-tight text-[var(--pos-text-1)]">
            {ws.suppliers.length}
          </div>
        </div>
        <div className={purchaseStatCell}>
          <div className="text-[11px] text-[var(--pos-text-2)]">With open payable</div>
          <div className="mt-0.5 text-[20px] font-semibold leading-tight text-[var(--pos-text-1)]">
            {openPayableCount}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[900px] border-collapse text-[12px]">
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
                  No cashbooks match. Add one or clear the search.
                </td>
              </tr>
            ) : (
              rows.map((s) => {
                const bal = supplierBalance(s.id, ws.ledger);
                return (
                  <tr
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSupplierId(s.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        setSelectedSupplierId(s.id);
                      }
                    }}
                    aria-haspopup="dialog"
                    aria-label={`Open ${s.name}`}
                    className="cursor-pointer border-b border-solid [border-color:var(--pos-divider)] transition-colors hover:bg-[var(--pos-nav-hover)]/35"
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
                        <GhostButton
                          variant="bill"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            startNewPurchaseFor(s.id);
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Receipt className="size-3.5" strokeWidth={2} />
                            Bill
                          </span>
                        </GhostButton>
                        <GhostButton
                          variant="pay"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            startPaymentFor(s.id);
                          }}
                        >
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
              <span className="min-w-0 truncate">{selectedSupplier.name}</span>
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
              <div className="flex w-full flex-wrap items-center gap-2">
                <GhostButton
                  variant="bill"
                  onClick={() => startNewPurchaseFor(selectedSupplier.id)}
                >
                  <span className="inline-flex items-center gap-1">
                    <Receipt className="size-3.5" strokeWidth={2} />
                    Bill
                  </span>
                </GhostButton>
                <GhostButton variant="pay" onClick={() => startPaymentFor(selectedSupplier.id)}>
                  <span className="inline-flex items-center gap-1">
                    <Banknote className="size-3.5" strokeWidth={2} />
                    Pay
                  </span>
                </GhostButton>
                <div className="ml-auto">
                  <DangerGhostButton
                    onClick={() => setPendingDeleteSupplierId(selectedSupplier.id)}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Trash2 className="size-3.5" strokeWidth={2} aria-hidden />
                      Delete cashbook
                    </span>
                  </DangerGhostButton>
                </div>
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

      {pendingDeleteSupplier
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-cashbook-title"
              className="fixed inset-0 z-[210] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
              onClick={() => {
                if (!deleteBusy) setPendingDeleteSupplierId(null);
              }}
            >
              <div
                className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
                onClick={(e) => e.stopPropagation()}
              >
                <h2
                  id="delete-cashbook-title"
                  className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
                >
                  Delete cashbook?
                </h2>
                <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
                  This removes{" "}
                  <span className="font-semibold text-[var(--pos-text-1)]">
                    {pendingDeleteSupplier.name}
                  </span>
                  {pendingDeleteEntryCount > 0 ? (
                    <>
                      {" "}
                      and its{" "}
                      <span className="font-semibold text-[var(--pos-text-1)]">
                        {pendingDeleteEntryCount}
                      </span>{" "}
                      bill{pendingDeleteEntryCount === 1 ? "" : "s"}/payment
                      {pendingDeleteEntryCount === 1 ? "" : "s"}
                    </>
                  ) : null}
                  . Linked Daily Entry purchase lines are cleared. This cannot be undone.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                    disabled={deleteBusy}
                    onClick={() => setPendingDeleteSupplierId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-solid border-[#c45a5a]/55 bg-[#c45a5a] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                    disabled={deleteBusy}
                    onClick={() => void confirmDeleteCashbook()}
                  >
                    <Trash2 className="size-3.5" strokeWidth={2.25} aria-hidden />
                    {deleteBusy ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
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

/** Table / chips: bill / payment / return / correction. */
function ledgerEntryLineLabel(e: LedgerEntry): string {
  return ledgerKindForDisplay(e.type);
}

function ledgerDraftSummaryLabel(d: LedgerEntryDraft): string {
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
  /** Vendor drawer: invoice | payment only. */
  kind: LedgerEntry["type"];
  amount: string;
  method: (typeof LEDGER_PAYMENT_METHODS)[number];
  notes: string;
  attachments: LedgerAttachment[];
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
  return {
    supplierId: prefillSupplierId,
    date: todayIso(),
    kind: "invoice",
    amount: "",
    method: LEDGER_PAYMENT_METHODS[0],
    notes: "",
    attachments: [],
    items: [newLedgerItemDraft()],
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

function paymentMemoFromDraft(d: LedgerEntryDraft): string {
  const n = d.notes.trim();
  if (n) return `${d.method} · ${n}`;
  return d.method;
}

function formatCentsAsAmountInput(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, "0")}`;
}

function paymentMethodAndNotesFromMemo(memo: string): {
  method: (typeof LEDGER_PAYMENT_METHODS)[number];
  notes: string;
} {
  const m = memo.trim();
  for (const method of LEDGER_PAYMENT_METHODS) {
    if (m === method) return { method, notes: "" };
    const prefix = `${method} · `;
    if (m.startsWith(prefix)) return { method, notes: m.slice(prefix.length) };
  }
  return { method: LEDGER_PAYMENT_METHODS[0], notes: m };
}

function draftFromLedgerEntry(entry: LedgerEntry, moves: StockMove[]): LedgerEntryDraft {
  const items = ledgerEntryItems(entry, moves);
  const itemDrafts =
    items.length > 0
      ? items.map((line) => ({
          key: line.id,
          name: line.name,
          qty: String(line.qty),
          unit: line.unit,
          rate: formatCentsAsAmountInput(line.rateCents),
        }))
      : [newLedgerItemDraft()];

  if (entry.type === "payment") {
    const { method, notes } = paymentMethodAndNotesFromMemo(entry.memo);
    return {
      supplierId: entry.supplierId,
      date: entry.date,
      kind: "payment",
      amount: formatCentsAsAmountInput(entry.amountCents),
      method,
      notes,
      attachments: [...(entry.attachments ?? [])],
      items: [newLedgerItemDraft()],
    };
  }

  const po = linkedPurchaseForLedgerEntry(entry, moves);
  const noteFromPo = po?.note?.trim() ?? "";
  const notes =
    noteFromPo ||
    (entry.memo.trim() === "Purchase" ? "" : entry.memo.trim());
  const amountOnlyItemDrafts =
    items.length === 0
      ? [
          {
            ...newLedgerItemDraft(),
            name: notes || "Purchase",
            qty: "1",
            unit: "pcs",
            rate: formatCentsAsAmountInput(entry.amountCents),
          },
        ]
      : itemDrafts;
  return {
    supplierId: entry.supplierId,
    date: entry.date,
    kind: "invoice",
    amount: "",
    method: LEDGER_PAYMENT_METHODS[0],
    notes,
    attachments: [...(entry.attachments ?? [])],
    items: amountOnlyItemDrafts,
  };
}

function canEditLedgerEntry(entry: LedgerEntry): boolean {
  return (
    !isLedgerEntryLocked(entry) &&
    (entry.type === "invoice" || entry.type === "payment")
  );
}

function setLedgerEntryLocked(id: string, locked: boolean): boolean {
  const existing = getWorkspace().ledger.find((e) => e.id === id);
  if (!existing) return false;
  if (locked === isLedgerEntryLocked(existing)) return true;
  const now = new Date().toISOString();
  setWorkspace((w) => ({
    ...w,
    ledger: w.ledger.map((e) => {
      if (e.id !== id) return e;
      if (locked) return { ...e, isLocked: true, lockedAt: now };
      return { ...e, isLocked: false, lockedAt: undefined };
    }),
  }));
  return true;
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
  if (d.kind === "invoice" && draftHasItemRows(d)) {
    return amountCentsFromLedgerDraft(d) === null;
  }
  if (!d.amount.trim() && !draftHasItemRows(d)) return true;
  return amountCentsFromLedgerDraft(d) === null;
}

export type DailyLedgerCommitResult =
  | { ok: true; ledgerEntryId: string; purchaseOrderId?: string }
  | { ok: false };

function buildLedgerEntryFields(
  draft: LedgerEntryDraft,
  amountCents: number,
  items: LedgerItemLine[],
): Pick<LedgerEntry, "supplierId" | "date" | "memo" | "amountCents"> &
  Partial<Pick<LedgerEntry, "attachments" | "items">> {
  return {
    supplierId: draft.supplierId,
    date: draft.date,
    memo: memoFromLedgerDraft(draft),
    amountCents,
    ...(draft.attachments.length > 0 ? { attachments: draft.attachments } : {}),
    ...(items.length > 0 ? { items } : {}),
  };
}

/** Persists a bills & payments line from the drawer. */
function commitLedgerEntryDraft(draft: LedgerEntryDraft): DailyLedgerCommitResult {
  const supplierId = draft.supplierId;
  if (!supplierId) return { ok: false };

  if (draft.kind === "invoice") {
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
      type: "invoice",
      ref,
      ...buildLedgerEntryFields(draft, total, items),
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

  const kind = draft.kind;
  setWorkspace((w) => ({
    ...w,
    ledger: [
      {
        id: lgId,
        type: kind,
        ref: ledgerRefForKind(kind),
        ...buildLedgerEntryFields(draft, amountCents, []),
      },
      ...w.ledger,
    ],
  }));
  return { ok: true, ledgerEntryId: lgId };
}

/** Updates an existing bill or payment in place (keeps id + ref). */
function updateLedgerEntryDraft(
  entryId: string,
  draft: LedgerEntryDraft,
): DailyLedgerCommitResult {
  const w0 = getWorkspace();
  const existing = w0.ledger.find((e) => e.id === entryId);
  if (!existing || !canEditLedgerEntry(existing)) return { ok: false };

  const kind = existing.type;
  const effectiveDraft: LedgerEntryDraft = { ...draft, kind };
  const supplierId = effectiveDraft.supplierId;
  if (!supplierId) return { ok: false };

  if (kind === "invoice") {
    const total = amountCentsFromLedgerDraft(effectiveDraft);
    if (total === null) return { ok: false };
    const items = committedItemsFromDraft(effectiveDraft);
    if (items === null) return { ok: false };
    const po = linkedPurchaseForLedgerEntry(existing, w0.moves);
    const note = effectiveDraft.notes.trim();
    const fields = buildLedgerEntryFields(effectiveDraft, total, items);

    setWorkspace((w) => ({
      ...w,
      moves: po
        ? w.moves.map((m) =>
            m.id === po.id && m.kind === "purchase"
              ? {
                  ...m,
                  supplierId,
                  date: effectiveDraft.date,
                  amountCents: total,
                  note,
                  ...(items.length > 0 ? { items } : { items: undefined }),
                }
              : m,
          )
        : w.moves,
      ledger: w.ledger.map((e) => {
        if (e.id !== entryId) return e;
        const next: LedgerEntry = {
          id: e.id,
          type: e.type,
          ref: e.ref,
          ...fields,
          ...(isLedgerEntryLocked(e) ? { isLocked: true, lockedAt: e.lockedAt } : {}),
        };
        return next;
      }),
    }));
    return { ok: true, ledgerEntryId: entryId, purchaseOrderId: po?.id };
  }

  const amountCents = amountCentsFromLedgerDraft(effectiveDraft);
  if (amountCents === null) return { ok: false };
  const fields = buildLedgerEntryFields(effectiveDraft, amountCents, []);

  setWorkspace((w) => ({
    ...w,
    ledger: w.ledger.map((e) => {
      if (e.id !== entryId) return e;
      return {
        id: e.id,
        type: e.type,
        ref: e.ref,
        ...fields,
        ...(isLedgerEntryLocked(e) ? { isLocked: true, lockedAt: e.lockedAt } : {}),
      };
    }),
  }));
  return { ok: true, ledgerEntryId: entryId };
}

function removeLedgerEntryById(id: string): boolean {
  const w0 = getWorkspace();
  const entry = w0.ledger.find((e) => e.id === id);
  if (!entry || isLedgerEntryLocked(entry)) return false;
  const po = linkedPurchaseForLedgerEntry(entry, w0.moves);
  setWorkspace((w) => ({
    ...w,
    ledger: w.ledger.filter((e) => e.id !== id),
    moves: po ? w.moves.filter((m) => m.id !== po.id) : w.moves,
  }));
  return true;
}

export type RemoveCashbookResult =
  | { ok: true }
  | { ok: false; message: string };

/** Removes a cashbook and all of its bills, payments, and purchase moves. */
function removeCashbookById(supplierId: string): RemoveCashbookResult {
  const id = supplierId.trim();
  if (!id) return { ok: false, message: "Cashbook is required." };

  const w0 = getWorkspace();
  const supplier = w0.suppliers.find((s) => s.id === id);
  if (!supplier) return { ok: false, message: "Cashbook not found." };

  const bookEntries = w0.ledger.filter((e) => e.supplierId === id);
  if (bookEntries.some((e) => isLedgerEntryLocked(e))) {
    return {
      ok: false,
      message:
        "This cashbook has locked bills or payments. Unlock them before deleting the book.",
    };
  }

  setWorkspace((w) => ({
    ...w,
    suppliers: w.suppliers.filter((s) => s.id !== id),
    ledger: w.ledger.filter((e) => e.supplierId !== id),
    moves: w.moves.filter((m) => m.supplierId !== id),
    ledgerSupplierFilter: w.ledgerSupplierFilter === id ? "" : w.ledgerSupplierFilter,
    ledgerInvoiceDrawerPrefillSupplierId:
      w.ledgerInvoiceDrawerPrefillSupplierId === id
        ? null
        : w.ledgerInvoiceDrawerPrefillSupplierId,
    ledgerPaymentDrawerPrefillSupplierId:
      w.ledgerPaymentDrawerPrefillSupplierId === id
        ? null
        : w.ledgerPaymentDrawerPrefillSupplierId,
  }));
  return { ok: true };
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
    attachments: [],
    items: [],
  });
  if (cents !== null) return null;
  if (!amountStr.trim()) return "Enter an amount for this ledger line.";
  if (kind === "adjustment") return "Adjustment amount cannot be zero.";
  return "Enter a valid amount (greater than zero) for this type.";
}

/** Validates amount for a daily expense line that posts to Bills & payments. */
export function validateDailyExpenseLedgerAmount(params: {
  supplierId: string;
  amountStr: string;
  kind: LedgerEntry["type"];
}): string | null {
  return validateLedgerAmountForKind(params.kind, params.amountStr);
}

export function commitLedgerFromDailyExpenseLine(params: {
  supplierId: string;
  entryDateIso: string;
  amountStr: string;
  kind: LedgerEntry["type"];
  notes: string;
  attachments?: LedgerAttachment[];
  /** When set (bills), amount is derived from item totals. */
  items?: Array<{
    name: string;
    qty: number;
    unit: string;
    rate: number;
  }>;
}): DailyLedgerCommitResult {
  const itemDrafts = (params.items ?? []).map((item) => ({
    key: `li-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: item.name,
    qty: String(item.qty),
    unit: item.unit || "pcs",
    rate: String(item.rate),
  }));
  return commitLedgerEntryDraft({
    supplierId: params.supplierId,
    date: params.entryDateIso,
    kind: params.kind,
    amount: itemDrafts.length > 0 ? "" : params.amountStr,
    method: LEDGER_PAYMENT_METHODS[0],
    notes: params.notes,
    attachments: params.attachments ?? [],
    items: itemDrafts,
  });
}

/** True when a daily-linked ledger row is locked and must not be replaced. */
export function isDailyLedgerLinkLocked(link: {
  ledgerEntryId: string;
}): boolean {
  const entry = getWorkspace().ledger.find((e) => e.id === link.ledgerEntryId);
  return isLedgerEntryLocked(entry);
}

/** True when the linked cashbook row still has file attachments. */
export function dailyLedgerLinkHasAttachments(link: {
  ledgerEntryId: string;
}): boolean {
  const entry = getWorkspace().ledger.find((e) => e.id === link.ledgerEntryId);
  return (entry?.attachments?.length ?? 0) > 0;
}

/** Removes ledger (and draft PO for bills) created from Daily Entry so edits stay in sync. */
export function removeDailyLedgerExpenseLink(link: {
  ledgerEntryId: string;
  purchaseOrderId?: string;
}): boolean {
  if (isDailyLedgerLinkLocked(link)) return false;
  setWorkspace((w) => ({
    ...w,
    ledger: w.ledger.filter((e) => e.id !== link.ledgerEntryId),
    moves: link.purchaseOrderId
      ? w.moves.filter((m) => m.id !== link.purchaseOrderId)
      : w.moves,
  }));
  return true;
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
  kindField = "editable",
}: {
  ledgerDraft: LedgerEntryDraft;
  patchLedgerDraft: (patch: Partial<LedgerEntryDraft>) => void;
  ws: Workspace;
  supplierName: (id: string) => string;
  runningBySupplier: Map<string, number>;
  bookField: "select" | "readonly";
  /** Daily Entry overlay: date is the entry day and cannot be changed. */
  dateField?: "editable" | "readonly";
  /** Edit mode: keep bill vs payment fixed. */
  kindField?: "editable" | "readonly";
}) {
  const onBookChange = (newId: string) => {
    if (kindField === "readonly") {
      patchLedgerDraft({ supplierId: newId });
      return;
    }
    patchLedgerDraft({
      supplierId: newId,
      kind: "invoice",
      amount: "",
      items: ledgerDraft.items.length > 0 ? ledgerDraft.items : [newLedgerItemDraft()],
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

  const amountLabel = "Amount (৳)";

  const running = ledgerDraft.supplierId
    ? (runningBySupplier.get(ledgerDraft.supplierId) ?? 0)
    : 0;
  const balanceDisplay = formatMoney(Math.max(0, running));

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
                  {s.name}
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
            <span className={purchaseLabel}>Owed</span>
            <p className="mt-0.5 font-mono text-[14px] font-semibold tabular-nums leading-snug text-[var(--pos-text-1)]">
              {balanceDisplay}
            </p>
          </div>
        ) : null}

        <>
            {kindField === "readonly" ? (
              <div className="min-w-0 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2">
                <span className={purchaseLabel}>Type</span>
                <p className="mt-0.5 text-[13px] font-medium leading-snug text-[var(--pos-text-1)]">
                  {ledgerDraftSummaryLabel(ledgerDraft)}
                </p>
              </div>
            ) : (
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
            )}
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
      </div>
      <div className="rounded-[10px] border border-dashed border-[var(--pos-input-border)] bg-[var(--pos-page)] px-3 py-3">
        <p className={`${purchaseLabel} mb-2 font-semibold text-[var(--pos-text-1)]`}>
          Attachments (optional)
        </p>
        <LedgerEntryAttachmentField
          attachments={ledgerDraft.attachments}
          onChange={(next) => patchLedgerDraft({ attachments: next })}
        />
      </div>
    </div>
  );
}

function SupplierLedgerView() {
  const ws = useWorkspace();
  const { userName } = useSession();
  const filter = ws.ledgerSupplierFilter;
  const [ledgerDrawerOpen, setLedgerDrawerOpen] = useState(false);
  const [editingLedgerEntryId, setEditingLedgerEntryId] = useState<string | null>(null);
  const [pendingLockEntryId, setPendingLockEntryId] = useState<string | null>(null);
  const [pendingUnlockEntryId, setPendingUnlockEntryId] = useState<string | null>(null);
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
    setEditingLedgerEntryId(null);
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
        const itemNames = (x.items ?? [])
          .map((it) => it.name.toLowerCase())
          .join(" ");
        return (
          x.ref.toLowerCase().includes(q) ||
          x.memo.toLowerCase().includes(q) ||
          supplierName(x.supplierId).toLowerCase().includes(q) ||
          x.type.includes(q) ||
          kindLabel.includes(q) ||
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

  function openLedgerDrawer(kind: "invoice" | "payment" = "invoice") {
    const initial = filter || ws.suppliers[0]?.id || "";
    const base = defaultLedgerEntryDraft(initial);
    setEditingLedgerEntryId(null);
    setLedgerDraft(kind === "payment" ? { ...base, kind: "payment" } : base);
    setLedgerDrawerOpen(true);
  }

  function openEditLedgerEntry(entry: LedgerEntry) {
    if (!canEditLedgerEntry(entry)) return;
    setEditingLedgerEntryId(entry.id);
    setLedgerDraft(draftFromLedgerEntry(entry, ws.moves));
    setSelectedLedgerEntryId(null);
    setLedgerDrawerOpen(true);
  }

  function closeLedgerDrawer() {
    setLedgerDrawerOpen(false);
    setEditingLedgerEntryId(null);
    setLedgerDraft(defaultLedgerEntryDraft(""));
  }

  const saveLedgerFromDrawer = useCallback(() => {
    const draftSnapshot = ledgerDraft;
    const editingId = editingLedgerEntryId;
    const result = editingId
      ? updateLedgerEntryDraft(editingId, draftSnapshot)
      : commitLedgerEntryDraft(draftSnapshot);
    if (!result.ok) return;

    const closeDrawer = () => {
      setLedgerDrawerOpen(false);
      setEditingLedgerEntryId(null);
      setLedgerDraft(defaultLedgerEntryDraft(""));
    };

    if (draftSnapshot.kind !== "invoice") {
      closeDrawer();
      return;
    }

    const vendorName =
      getWorkspace().suppliers.find((s) => s.id === draftSnapshot.supplierId)?.name?.trim() ??
      "";
    const committedItems = committedItemsFromDraft(draftSnapshot) ?? [];
    const amountCents =
      amountCentsFromLedgerDraft(draftSnapshot) ??
      committedItems.reduce((s, i) => s + i.totalCents, 0);

    void (async () => {
      const sync = await upsertDailyPurchaseFromLedgerInvoice({
        ledgerEntryId: result.ledgerEntryId,
        purchaseOrderId: result.purchaseOrderId,
        vendorName,
        date: draftSnapshot.date,
        notes: draftSnapshot.notes,
        amountCents: Math.abs(amountCents),
        items: committedItems.map((i) => ({
          id: i.id,
          name: i.name,
          qty: i.qty,
          unit: i.unit,
          rateCents: i.rateCents,
          totalCents: i.totalCents,
        })),
        attachmentRefs: draftSnapshot.attachments.map((a) => a.dataUrl),
        enteredBy: userName.trim() || undefined,
      });
      if (!sync.ok) {
        window.alert(
          `${sync.message}\n\nThe cashbook bill was saved, but Daily Entry was not updated.`,
        );
      }
      closeDrawer();
    })();
  }, [editingLedgerEntryId, ledgerDraft, userName]);

  const removeEntry = useCallback((id: string) => {
    const entry = getWorkspace().ledger.find((e) => e.id === id);
    if (!entry) return;
    if (isLedgerEntryLocked(entry)) {
      window.alert("This entry is locked. Unlock it before removing.");
      return;
    }
    if (!window.confirm("Remove this line? Only do this if it was entered by mistake.")) return;

    void (async () => {
      const unlink = await unlinkDailyExpenseLinesForLedgerEntry(id);
      if (!unlink.ok) {
        window.alert(unlink.message);
        return;
      }
      if (!removeLedgerEntryById(id)) {
        window.alert("Could not remove this cashbook line.");
        return;
      }
      setSelectedLedgerEntryId((prev) => (prev === id ? null : prev));
    })();
  }, []);

  const confirmLockEntry = useCallback(() => {
    if (!pendingLockEntryId) return;
    setLedgerEntryLocked(pendingLockEntryId, true);
    setPendingLockEntryId(null);
  }, [pendingLockEntryId]);

  const confirmUnlockEntry = useCallback(() => {
    if (!pendingUnlockEntryId) return;
    setLedgerEntryLocked(pendingUnlockEntryId, false);
    setPendingUnlockEntryId(null);
  }, [pendingUnlockEntryId]);

  const isLedgerSaveDisabled = isLedgerDraftSaveDisabled(ledgerDraft);
  const canPostLedger = ws.suppliers.length > 0;
  const isEditingEntry = Boolean(editingLedgerEntryId);

  return (
    <div className={purchaseShell}>
      <div className={purchaseHead}>
        <ModuleTitle
          title="Bills & payments"
          subtitle="Post bills, payments, and credits. Filter by book to see running balance."
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <GhostButton
            variant="bill"
            disabled={!canPostLedger}
            onClick={() => openLedgerDrawer("invoice")}
          >
            <span className="inline-flex items-center gap-1">
              <Receipt className="size-3.5" strokeWidth={2} />
              Bill
            </span>
          </GhostButton>
          <GhostButton
            variant="pay"
            disabled={!canPostLedger}
            onClick={() => openLedgerDrawer("payment")}
          >
            <span className="inline-flex items-center gap-1">
              <Banknote className="size-3.5" strokeWidth={2} />
              Pay
            </span>
          </GhostButton>
        </div>
      </div>

      {ws.suppliers.length === 0 ? (
        <div className="border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-3">
          <p className="text-[12px] text-[var(--pos-text-2)]">
            Add a cashbook first, then record bills and payments here.
          </p>
          <button
            type="button"
            onClick={() => selectLedgerTab("books")}
            className="mt-2 text-[12px] font-semibold text-[var(--pos-text-1)] underline-offset-2 hover:underline"
          >
            Go to Books
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2.5">
        <div className={`${purchaseStatCell} min-w-[140px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">
            {filter ? "Balance" : "Payable (all)"}
          </div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {formatMoneyWholeTaka(dueCents)}
          </div>
        </div>
        <div className={`${purchaseStatCell} min-w-[120px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Bills (view)</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {formatMoneyWholeTaka(ledgerEntriesViewStats.billsAddedCents)}
          </div>
        </div>
        <div className={`${purchaseStatCell} min-w-[120px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Paid (view)</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {formatMoneyWholeTaka(ledgerEntriesViewStats.paidOutCents)}
          </div>
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
                {s.name} · {formatMoneyWholeTaka(runningBySupplier.get(s.id) ?? 0)}
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

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-[var(--pos-card)]">
            <tr className="border-b border-solid [border-color:var(--pos-divider)]">
              <th className={purchaseTh}>Date</th>
              <th className={purchaseTh}>Cashbook</th>
              <th className={purchaseTh}>Type</th>
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
                  {ws.suppliers.length === 0
                    ? "No cashbooks yet — switch to Books and add one to start posting bills and payments."
                    : ws.ledger.length === 0
                      ? "No activity yet. Use Bill or Pay to post an entry."
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
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex rounded-full bg-[var(--pos-nav-hover)]/50 px-2 py-0.5 text-[10px] font-semibold text-[var(--pos-text-2)]">
                          {ledgerEntryLineLabel(e)}
                        </span>
                        {isLedgerEntryLocked(e) ? (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800"
                            title={
                              e.lockedAt
                                ? `Locked ${formatLedgerDateReadonly(e.lockedAt.slice(0, 10))}`
                                : "Locked"
                            }
                          >
                            <Lock className="size-2.5" strokeWidth={2.5} aria-hidden />
                            Locked
                          </span>
                        ) : null}
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
                      <div className="inline-flex flex-wrap items-center justify-end gap-1">
                        {canEditLedgerEntry(e) ? (
                          <GhostButton onClick={() => openEditLedgerEntry(e)}>
                            <span className="inline-flex items-center gap-1">
                              <Pencil className="size-3" strokeWidth={2} aria-hidden />
                              Edit
                            </span>
                          </GhostButton>
                        ) : null}
                        {isLedgerEntryLocked(e) ? (
                          <GhostButton onClick={() => setPendingUnlockEntryId(e.id)}>
                            <span className="inline-flex items-center gap-1">
                              <LockOpen className="size-3" strokeWidth={2} aria-hidden />
                              Unlock
                            </span>
                          </GhostButton>
                        ) : (
                          <GhostButton onClick={() => setPendingLockEntryId(e.id)}>
                            <span className="inline-flex items-center gap-1">
                              <Lock className="size-3" strokeWidth={2} aria-hidden />
                              Lock
                            </span>
                          </GhostButton>
                        )}
                        <DangerGhostButton
                          disabled={isLedgerEntryLocked(e)}
                          onClick={() => removeEntry(e.id)}
                        >
                          Remove
                        </DangerGhostButton>
                      </div>
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
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[12px] text-[var(--pos-text-1)]">
                {selectedLedgerEntry.ref}
              </p>
              {isLedgerEntryLocked(selectedLedgerEntry) ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                  <Lock className="size-3" strokeWidth={2.5} aria-hidden />
                  Locked
                </span>
              ) : null}
            </div>
          }
          actions={
            <>
              {canEditLedgerEntry(selectedLedgerEntry) ? (
                <GhostButton onClick={() => openEditLedgerEntry(selectedLedgerEntry)}>
                  <span className="inline-flex items-center gap-1">
                    <Pencil className="size-3.5" strokeWidth={2} aria-hidden />
                    Edit
                  </span>
                </GhostButton>
              ) : null}
              {isLedgerEntryLocked(selectedLedgerEntry) ? (
                <GhostButton onClick={() => setPendingUnlockEntryId(selectedLedgerEntry.id)}>
                  <span className="inline-flex items-center gap-1">
                    <LockOpen className="size-3.5" strokeWidth={2} aria-hidden />
                    Unlock
                  </span>
                </GhostButton>
              ) : (
                <GhostButton onClick={() => setPendingLockEntryId(selectedLedgerEntry.id)}>
                  <span className="inline-flex items-center gap-1">
                    <Lock className="size-3.5" strokeWidth={2} aria-hidden />
                    Lock
                  </span>
                </GhostButton>
              )}
              <DangerGhostButton
                disabled={isLedgerEntryLocked(selectedLedgerEntry)}
                onClick={() => removeEntry(selectedLedgerEntry.id)}
              >
                Remove
              </DangerGhostButton>
            </>
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
          title={isEditingEntry ? "Edit cashbook entry" : "Cashbook Entry"}
          titleId="ledger-entry-drawer-title"
          subtitle={
            ledgerDraft.supplierId ? (
              <p className="text-[11px] text-[var(--pos-text-2)]">
                {supplierName(ledgerDraft.supplierId)} · {ledgerDraftSummaryLabel(ledgerDraft)}
                {isEditingEntry ? " · editing" : ""}
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
                {isEditingEntry ? "Save changes" : "Save"}
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
            kindField={isEditingEntry ? "readonly" : "editable"}
          />
        </LedgerDrawerFrame>
      ) : null}

      {pendingLockEntryId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lock-ledger-entry-title"
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setPendingLockEntryId(null)}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="lock-ledger-entry-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              Lock this entry?
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
              Locked bills and payments cannot be edited or removed until unlocked.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                onClick={() => setPendingLockEntryId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-solid border-amber-500/55 bg-amber-500/90 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 sm:flex-none"
                onClick={confirmLockEntry}
              >
                <Lock className="size-3.5" strokeWidth={2.25} aria-hidden />
                Lock
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingUnlockEntryId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unlock-ledger-entry-title"
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setPendingUnlockEntryId(null)}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="unlock-ledger-entry-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              Unlock this entry?
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
              You will be able to edit or remove this bill or payment again.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                onClick={() => setPendingUnlockEntryId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-solid border-emerald-500/55 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-800 transition-opacity hover:opacity-90 sm:flex-none"
                onClick={confirmUnlockEntry}
              >
                <LockOpen className="size-3.5" strokeWidth={2.25} aria-hidden />
                Unlock
              </button>
            </div>
          </div>
        </div>
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
      ws.suppliers.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [ws.suppliers],
  );

  const allRows = useMemo(() => {
    const out: PurchasedItemRow[] = [];
    for (const entry of ws.ledger) {
      if (entry.type !== "invoice") continue;
      const supplier = ws.suppliers.find((s) => s.id === entry.supplierId);
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
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {formatMoneyWholeTaka(stats.spendCents)}
          </div>
        </div>
        <div className={`${purchaseStatCell} min-w-[100px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Lines</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {stats.lineCount}
          </div>
        </div>
        <div className={`${purchaseStatCell} min-w-[100px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Unique items</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
            {stats.uniqueItems}
          </div>
        </div>
        <div className={`${purchaseStatCell} min-w-[100px] flex-1`}>
          <div className="text-[11px] text-[var(--pos-text-2)]">Vendors</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
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

function CashbooksPanelTabs({
  panel,
  onChange,
}: {
  panel: CashbooksPanel;
  onChange: (panel: CashbooksPanel) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Cashbooks sections"
      className="flex shrink-0 gap-1 rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-1"
    >
      {CASHBOOKS_PANEL_OPTIONS.map((opt) => {
        const active = panel === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={[
              "h-8 flex-1 cursor-pointer rounded-[8px] px-3 text-[12px] font-medium transition-colors sm:flex-none sm:px-4",
              active
                ? "bg-[var(--pos-card)] font-semibold text-[var(--pos-text-1)] shadow-sm"
                : "text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function LedgerModuleView({ leafId }: { leafId: string }) {
  const panel = useSyncExternalStore(
    subscribeCashbooksPanel,
    getCashbooksPanel,
    getCashbooksPanel,
  );
  const showItems = isItemsLedgerLeaf(leafId);
  const ledgerLoad = useSyncExternalStore(
    subscribeWorkspace,
    getLedgerWorkspaceLoadState,
    getLedgerWorkspaceLoadState,
  );

  useEffect(() => {
    void loadLedgerWorkspace();
  }, []);

  useEffect(() => {
    if (leafId === "lm-ledger") setCashbooksPanel("bills");
    else if (leafId === "lm-management" || leafId === "lm-suppliers") {
      setCashbooksPanel("books");
    }
  }, [leafId]);

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
      {!showItems ? (
        <CashbooksPanelTabs panel={panel} onChange={setCashbooksPanel} />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {showItems ? (
          <PurchasedItemsView />
        ) : panel === "books" ? (
          <SupplierListView />
        ) : (
          <SupplierLedgerView />
        )}
      </div>
    </div>
  );
}
