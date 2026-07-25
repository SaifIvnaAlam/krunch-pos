import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Lock,
  LockOpen,
  Paperclip,
  Pencil,
  Plus,
  Search,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { readValidAccessToken } from "@/features/auth";
import {
  uploadFileToStorage,
  attachmentUploadBlockedMessage,
  fromStorageRef,
  isMediaRef,
  isPersistedMediaRef,
  purgeStoredMediaRef,
} from "@/features/storage";
import { MediaThumb } from "./MediaThumb";
import { ReceiptPreviewBody } from "./ReceiptPreviewBody";
import { SearchableSelect } from "./SearchableSelect";
import {
  commitLedgerFromDailyExpenseLine,
  getLedgerBookNamesSnapshot,
  isDailyLedgerLinkLocked,
  removeDailyLedgerExpenseLink,
  resolveLedgerSupplierIdByBookName,
  subscribeLedgerWorkspace,
  validateDailyExpenseLedgerAmount,
} from "./LedgerModuleView";
import { openItemPurchaseSuppliers } from "./ItemPurchaseModuleView";
import type { LedgerAttachment } from "@/features/ledger";
import {
  bankNetAfterWithdrawals,
  carriedOpeningBalanceForDate,
  commitDailyEntry,
  deleteDailyEntry,
  expenseTotalFromExpenseLines,
  listDailyEntriesDescendingFromMap,
  lockDailyEntry,
  roundTaka,
  savedLineKind,
  setDailyEntryNavGuard,
  suggestedNewEntryDateKey,
  unlockDailyEntry,
  useDailyEntryMap,
  type DailyEntryRow,
  type ExpenseLineSaved,
} from "@/features/daily-entry";
import {
  employeeIdFromSavedStaffLine,
  isLegacyStaffVendorLine,
  isStaffFineExpenseLine,
  staffExpenseLineNote,
  staffExpenseLineTitle,
  staffLineKindFromSaved,
} from "@/features/daily-entry/staffExpenseLine";
import {
  cancelSalaryWorkspacePersist,
  getSalaryBundle,
  flushSalaryWorkspacePersist,
  loadSalaryWorkspace,
  reloadSalaryWorkspace,
  STAFF_ADVANCE_LINE_KIND,
  STAFF_LINE_KIND,
  syncLoadedSalaryBundleToEmployees,
  syncStaffExpensesToSalaryRegister,
  validateStaffPayoutAmount,
  type StaffLineKind,
} from "@/features/payroll";
import {
  cancelLedgerWorkspacePersist,
  flushLedgerWorkspacePersist,
  getWorkspace,
  loadLedgerWorkspace,
  reloadLedgerWorkspace,
} from "@/features/ledger";
import { getEmployeeDirectoryLoadState, loadEmployeeDirectory } from "@/features/employees";
import {
  createExpenseCategory,
  listExpenseCategories,
  type ExpenseCategory,
} from "@/features/payables";
import { getEmployeeById, useActiveEmployees } from "../../lib/employeeDirectoryStorage";
import { parseNonNegativeAmount, sanitizeNonNegativeDecimalInput } from "../../lib/moneyInput";
import { formatDateKeyAsDisplay } from "../../lib/dateDisplay";
import { useSession } from "@/features/auth";

type PurchaseItemDraft = {
  key: string;
  vendor: string;
  name: string;
  qty: string;
  unit: string;
  /** Unit price — editable; kept in sync with total via qty. */
  rate: string;
  /** Line total in taka — editable; kept in sync with rate via qty. */
  total: string;
  /** Which of rate/total the user last typed, so qty edits hold the right one. */
  lastEdited?: "rate" | "total";
};

type ExpenseLineDraft = {
  id: string;
  kind: "vendor" | "regular" | "staff" | "purchase";
  vendor: string;
  /** Regular expense title (no vendor) */
  label: string;
  /** Other Expenses category (regular lines). */
  expenseCategoryId: string;
  /** Staff expense — employee directory id */
  employeeId: string;
  /** Regular payout vs advance salary */
  staffLineKind: StaffLineKind;
  /** Regular / staff expense memo */
  note: string;
  /** Links to salary register when synced from a prior save. */
  salaryPaymentId?: string;
  /** Payable total (regular) or cash amount (vendor/staff). */
  amount: string;
  /** Cash paid now on a regular expense (defaults to total). */
  paidAmount: string;
  receiptDataUrls: string[];
  /**
   * Purchase bills only — attachments keyed by vendor cashbook name so each
   * vendor group posts its own receipts to that vendor’s bill.
   */
  vendorReceipts: Record<string, string[]>;
  /** Purchase bills only — optional memo per vendor group. */
  vendorNotes: Record<string, string>;
  /** Kept for draft shape; cashbook match always posts as payment (not user-selected). */
  ledgerKind: "" | "payment";
  /** Legacy vendor staff lines only */
  ledgerEmployeeLineKind: "";
  /** Optional memo when posting a payment/bill to a matched cashbook. */
  ledgerNote: string;
  /** Item rows for purchase bills. */
  items: PurchaseItemDraft[];
  /**
   * Vendor payment rows auto-created from items purchased — amount stays synced
   * to that vendor’s purchase total until the user edits vendor/amount.
   */
  syncedFromPurchaseVendor?: string;
};

const PURCHASE_ITEM_UNITS = [
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

function newPurchaseItemDraft(vendor = ""): PurchaseItemDraft {
  return {
    key: `pi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    vendor,
    name: "",
    qty: "1",
    unit: "pcs",
    rate: "",
    total: "",
  };
}

function emptyExpenseLineFields(): Omit<ExpenseLineDraft, "id" | "kind"> {
  return {
    vendor: "",
    label: "",
    expenseCategoryId: "",
    employeeId: "",
    staffLineKind: STAFF_LINE_KIND,
    note: "",
    amount: "",
    paidAmount: "",
    receiptDataUrls: [],
    vendorReceipts: {},
    vendorNotes: {},
    ledgerKind: "",
    ledgerEmployeeLineKind: "",
    ledgerNote: "",
    items: [],
  };
}

function isPdfOrImageFile(file: File): boolean {
  return file.type.startsWith("image/") || file.type === "application/pdf";
}

/** Receipts on expense lines: images, PDF, HEIC (macOS often omits MIME type). */
function isReceiptAttachmentFile(file: File): boolean {
  if (isPdfOrImageFile(file)) return true;
  if (/\.(heic|heif|jpe?g|png|gif|webp|bmp|tiff?|pdf)$/i.test(file.name)) return true;
  // Camera roll / Photos on macOS and iOS often yield an empty type.
  if (!file.type && file.size > 0 && /\.(jpe?g|png|heic|heif)$/i.test(file.name)) {
    return true;
  }
  return false;
}

const RECEIPT_FILE_ACCEPT =
  "image/*,application/pdf,.heic,.heif,image/heic,image/heif";

function isPdfDataUrl(url: string): boolean {
  return url.startsWith("data:application/pdf");
}

function isPdfMediaRef(ref: string): boolean {
  if (isPdfDataUrl(ref)) return true;
  if (isMediaRef(ref)) return false;
  const key = fromStorageRef(ref);
  return key != null && key.toLowerCase().endsWith(".pdf");
}

/** Cashbook payments accept multiple attachments — copy all Daily Entry receipts. */
function ledgerAttachmentsFromReceiptRefs(
  urls: string[] | undefined,
): LedgerAttachment[] {
  const out: LedgerAttachment[] = [];
  for (const raw of urls ?? []) {
    const ref = raw.trim();
    if (!ref) continue;
    const pathHint =
      fromStorageRef(ref) ??
      (ref.startsWith("data:") ? "" : ref.replace(/^media:/, ""));
    const fileName =
      pathHint.split("/").pop() || (isPdfMediaRef(ref) ? "receipt.pdf" : "receipt");
    const lower = fileName.toLowerCase();
    let mimeType = "application/octet-stream";
    if (ref.startsWith("data:")) {
      const m = /^data:([^;,]+)/.exec(ref);
      if (m?.[1]) mimeType = m[1];
    } else if (lower.endsWith(".pdf") || isPdfMediaRef(ref)) {
      mimeType = "application/pdf";
    } else if (lower.endsWith(".png")) {
      mimeType = "image/png";
    } else if (lower.endsWith(".webp")) {
      mimeType = "image/webp";
    } else if (lower.endsWith(".gif")) {
      mimeType = "image/gif";
    } else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
      mimeType = "image/jpeg";
    } else {
      mimeType = "image/jpeg";
    }
    out.push({ fileName, mimeType, dataUrl: ref });
  }
  return out;
}

function clipboardAttachmentFilesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  if (data.items?.length) {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.kind !== "file") continue;
      const f = item.getAsFile();
      if (!f || f.size === 0) continue;
      if (
        item.type.startsWith("image/") ||
        item.type === "application/pdf" ||
        isReceiptAttachmentFile(f) ||
        // macOS screenshots often omit MIME type on clipboard file items.
        !item.type
      ) {
        files.push(f);
      }
    }
  }
  if (files.length === 0 && data.files?.length) {
    for (let i = 0; i < data.files.length; i++) {
      const f = data.files[i];
      if (isReceiptAttachmentFile(f) || (!f.type && f.size > 0)) files.push(f);
    }
  }
  return files;
}

function expenseLineIdFromEventTarget(target: EventTarget | null): string | null {
  let el = target as HTMLElement | null;
  while (el) {
    const id = el.getAttribute?.("data-expense-line-id");
    if (id) return id;
    el = el.parentElement;
  }
  return null;
}

function purchaseVendorFromEventTarget(target: EventTarget | null): string | null {
  let el = target as HTMLElement | null;
  while (el) {
    if (el.hasAttribute?.("data-purchase-vendor")) {
      return el.getAttribute("data-purchase-vendor");
    }
    el = el.parentElement;
  }
  return null;
}

function expenseLineIdFromPasteEvent(e: ClipboardEvent): string | null {
  return (
    expenseLineIdFromEventTarget(e.target) ??
    expenseLineIdFromEventTarget(document.activeElement)
  );
}

function persistedAttachmentRefs(urls: readonly string[]): string[] {
  return urls.filter((u) => isPersistedMediaRef(u));
}

function persistedAttachmentRefSetFromRow(row: DailyEntryRow | undefined): Set<string> {
  const refs = new Set<string>();
  if (!row) return refs;
  for (const url of row.voidSaleAttachmentDataUrls ?? []) {
    if (typeof url === "string" && isPersistedMediaRef(url)) refs.add(url.trim());
  }
  for (const line of row.expenseLines ?? []) {
    for (const url of line.receiptDataUrls ?? []) {
      if (typeof url === "string" && isPersistedMediaRef(url)) refs.add(url.trim());
    }
  }
  return refs;
}

function persistedAttachmentRefsFromForm(
  expenseLines: readonly ExpenseLineDraft[],
  voidUrls: readonly string[],
): string[] {
  const refs: string[] = [];
  for (const url of voidUrls) {
    if (isPersistedMediaRef(url)) refs.push(url.trim());
  }
  for (const line of expenseLines) {
    for (const url of line.receiptDataUrls) {
      if (isPersistedMediaRef(url)) refs.push(url.trim());
    }
    for (const urls of Object.values(line.vendorReceipts ?? {})) {
      for (const url of urls) {
        if (isPersistedMediaRef(url)) refs.push(url.trim());
      }
    }
  }
  return refs;
}

/** Delete uploads that never made it into the saved daily entry row. */
function purgeUnsavedAttachmentRefs(
  savedRow: DailyEntryRow | undefined,
  expenseLines: readonly ExpenseLineDraft[],
  voidUrls: readonly string[],
): void {
  const saved = persistedAttachmentRefSetFromRow(savedRow);
  for (const ref of persistedAttachmentRefsFromForm(expenseLines, voidUrls)) {
    if (!saved.has(ref)) purgeStoredMediaRef(ref);
  }
}

function purgeAttachmentRefIfUnsaved(
  savedRow: DailyEntryRow | undefined,
  ref: string,
): void {
  const trimmed = ref.trim();
  if (!isPersistedMediaRef(trimmed)) return;
  if (persistedAttachmentRefSetFromRow(savedRow).has(trimmed)) return;
  purgeStoredMediaRef(trimmed);
}

function hasInProgressAttachmentPreviews(
  lines: readonly ExpenseLineDraft[],
  voidUrls: readonly string[],
): boolean {
  for (const line of lines) {
    for (const url of line.receiptDataUrls) {
      if (url.startsWith("blob:") || url.startsWith("data:")) return true;
    }
    for (const urls of Object.values(line.vendorReceipts ?? {})) {
      for (const url of urls) {
        if (url.startsWith("blob:") || url.startsWith("data:")) return true;
      }
    }
  }
  for (const url of voidUrls) {
    if (url.startsWith("blob:") || url.startsWith("data:")) return true;
  }
  return false;
}

function buildExpenseLinesToSaveFromDrafts(
  expenseLines: readonly ExpenseLineDraft[],
): ExpenseLineSaved[] {
  const linesToSave: ExpenseLineSaved[] = [];
  for (const line of expenseLines) {
    const receiptUrls = persistedAttachmentRefs(line.receiptDataUrls);
    const receiptField =
      receiptUrls.length > 0 ? ({ receiptDataUrls: receiptUrls } as const) : {};
    const lineIdField = { lineId: line.id } as const;
    if (line.kind === "staff") {
      const amt = parseAmount(line.amount);
      const employeeId = line.employeeId.trim();
      if (employeeId && amt > 0) {
        const emp = getEmployeeById(employeeId);
        linesToSave.push({
          kind: "staff",
          employeeId,
          employeeName: emp?.name ?? "",
          staffLineKind: line.staffLineKind,
          amount: amt,
          lineId: line.id,
          ...(line.note.trim() ? { note: line.note.trim() } : {}),
          ...(line.salaryPaymentId ? { salaryPaymentId: line.salaryPaymentId } : {}),
          ...receiptField,
        });
      }
    } else if (line.kind === "purchase") {
      const committed = committedPurchaseItemsFromDraft(line.items);
      if (!committed || committed.length === 0) continue;
      const groups = groupPurchaseItemsByVendor(committed);
      const vendorKeys = Array.from(groups.keys());
      for (const vendor of vendorKeys) {
        const groupItems = groups.get(vendor)!;
        const supplierId = resolveLedgerSupplierIdByBookName(vendor);
        if (!supplierId) continue;
        const amt = groupItems.reduce((s, i) => s + i.total, 0);
        const lineId =
          vendorKeys.length === 1 ? line.id : `${line.id}::${vendor.toLowerCase()}`;
        const vendorUrls = line.vendorReceipts?.[vendor] ?? [];
        // Legacy: older drafts kept a single shared receipt list on the card.
        const legacyUrls =
          vendorUrls.length === 0 && vendorKeys.length === 1
            ? line.receiptDataUrls
            : [];
        const groupReceiptUrls = persistedAttachmentRefs(
          vendorUrls.length > 0 ? vendorUrls : legacyUrls,
        );
        const groupReceiptField =
          groupReceiptUrls.length > 0
            ? ({ receiptDataUrls: groupReceiptUrls } as const)
            : {};
        const groupNote =
          (line.vendorNotes?.[vendor] ?? "").trim() ||
          (vendorKeys.length === 1 ? line.ledgerNote.trim() : "");
        linesToSave.push({
          kind: "purchase",
          vendor,
          amount: amt,
          items: groupItems,
          ledgerKind: "invoice",
          ledgerNote: groupNote,
          lineId,
          ...groupReceiptField,
        });
      }
    } else if (line.kind === "vendor") {
      const amt = parseAmount(line.amount);
      const v = line.vendor.trim();
      if (v && amt > 0) {
        const base = {
          kind: "vendor" as const,
          vendor: v,
          amount: amt,
          ...lineIdField,
          ...receiptField,
        };
        const supplierId = resolveLedgerSupplierIdByBookName(v);
        if (supplierId) {
          linesToSave.push({
            ...base,
            ledgerKind: "payment",
            ledgerNote: line.ledgerNote.trim(),
          });
        } else {
          linesToSave.push(base);
        }
      }
    } else {
      const amt = parseAmount(line.amount);
      const expenseTitle = line.label.trim();
      if (expenseTitle && amt > 0) {
        const noteTrim = line.note.trim();
        const paid =
          line.paidAmount.trim() === ""
            ? amt
            : Math.min(amt, Math.max(0, parseAmount(line.paidAmount)));
        const catId = line.expenseCategoryId.trim();
        linesToSave.push({
          kind: "regular",
          label: expenseTitle,
          amount: amt,
          paidAmount: paid,
          ...lineIdField,
          ...(catId ? { expenseCategoryId: catId } : {}),
          ...(noteTrim ? { note: noteTrim } : {}),
          ...receiptField,
        });
      }
    }
  }
  return linesToSave;
}

function buildDailyEntryCandidateFromForm(args: {
  dateKey: string;
  openingBalance: string;
  cashSale: string;
  bankSale: string;
  bkashSale: string;
  nagadSale: string;
  pathaoSale: string;
  foodiSale: string;
  foodpandaSale: string;
  voidSale: string;
  voidSaleRemarks: string;
  voidSaleAttachmentUrls: readonly string[];
  expenseLines: readonly ExpenseLineDraft[];
  bankWithdrawn: string;
  remaining: number;
  enteredBy: string;
}): DailyEntryRow {
  const voidAmtParsed = Math.max(0, parseAmount(args.voidSale));
  const voidRemarksTrim = args.voidSaleRemarks.trim();
  const voidAttachmentsFiltered = persistedAttachmentRefs(args.voidSaleAttachmentUrls);
  const voidAttachmentsToSave =
    voidAmtParsed > 0 && voidAttachmentsFiltered.length > 0
      ? voidAttachmentsFiltered
      : undefined;
  const linesToSave = buildExpenseLinesToSaveFromDrafts(args.expenseLines);
  const expenseTotal = expenseTotalFromExpenseLines(linesToSave);
  const bankWithdrawnToSave = Math.max(0, parseAmount(args.bankWithdrawn));

  return {
    date: args.dateKey,
    openingBalance: parseAmount(args.openingBalance),
    cashSale: parseAmount(args.cashSale),
    bankSale: parseAmount(args.bankSale),
    bkashSale: parseAmount(args.bkashSale),
    nagadSale: parseAmount(args.nagadSale),
    pathaoSale: parseAmount(args.pathaoSale),
    foodiSale: parseAmount(args.foodiSale),
    foodpandaSale: parseAmount(args.foodpandaSale),
    voidSale: voidAmtParsed > 0 ? voidAmtParsed : undefined,
    voidSaleRemarks:
      voidAmtParsed > 0 && voidRemarksTrim ? voidRemarksTrim : undefined,
    voidSaleAttachmentDataUrls: voidAttachmentsToSave,
    expenses: expenseTotal,
    bankWithdrawn: bankWithdrawnToSave,
    expenseLines: linesToSave,
    remainingBalance: args.remaining,
    updatedAt: new Date().toISOString(),
    enteredBy: args.enteredBy,
  };
}

function emptyDailyEntryBaseline(
  dateKey: string,
  openingBalance: number,
  enteredBy: string,
): DailyEntryRow {
  return {
    date: dateKey,
    openingBalance,
    cashSale: 0,
    bankSale: 0,
    bkashSale: 0,
    nagadSale: 0,
    pathaoSale: 0,
    foodiSale: 0,
    foodpandaSale: 0,
    expenses: 0,
    bankWithdrawn: 0,
    expenseLines: [],
    remainingBalance: openingBalance,
    updatedAt: new Date(0).toISOString(),
    enteredBy,
  };
}

function isDailyEntryFormDirty(args: {
  savedRow: DailyEntryRow | undefined;
  carriedOpeningFromPrevDay: number;
  enteredBy: string;
  candidate: DailyEntryRow;
  expenseLines: readonly ExpenseLineDraft[];
  voidSaleAttachmentUrls: readonly string[];
  attachmentUploadBusy: boolean;
}): boolean {
  if (args.attachmentUploadBusy) return true;
  if (hasInProgressAttachmentPreviews(args.expenseLines, args.voidSaleAttachmentUrls)) {
    return true;
  }
  if (args.savedRow) {
    return !savedEntryBodyEquals(args.savedRow, args.candidate);
  }
  return !savedEntryBodyEquals(
    emptyDailyEntryBaseline(
      args.candidate.date,
      args.carriedOpeningFromPrevDay,
      args.enteredBy,
    ),
    args.candidate,
  );
}

async function mergeVoidAttachmentDataUrls(
  existing: readonly string[],
  files: readonly File[],
): Promise<{ ok: true; urls: string[] } | { ok: false; message: string }> {
  if (!readValidAccessToken()) {
    return {
      ok: false,
      message: "Sign in to attach files (storage requires an active session).",
    };
  }
  const next = [...existing];
  try {
    for (const file of files) {
      if (!isReceiptAttachmentFile(file)) {
        return { ok: false, message: "Only images or PDF files can be attached." };
      }
      const blocked = attachmentUploadBlockedMessage(file);
      if (blocked) {
        return { ok: false, message: blocked };
      }
      next.push(await uploadFileToStorage(file, "void-attachments", file.name));
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not add attachment.",
    };
  }
  return { ok: true, urls: next };
}

/** Select value for free-typed vendor (not yet in the saved list). */
const VENDOR_OTHER_VALUE = "__vendor_other__";
/** Category select sentinel — opens the new-category modal. */
const NEW_EXPENSE_CATEGORY_VALUE = "__new_expense_category__";

const inputClass =
  "h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 text-[13px] tabular-nums text-[var(--pos-text-1)] transition-[border-color,box-shadow] focus:border-[var(--pos-sb-base)] focus:outline-none focus:ring-2 focus:ring-[var(--pos-sb-base)]/15";
const amountInputClass =
  "h-[3.125rem] w-full rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[22px] font-semibold tabular-nums text-right text-[var(--pos-text-1)] transition-[border-color,box-shadow] focus:border-[var(--pos-sb-base)] focus:outline-none focus:ring-2 focus:ring-[var(--pos-sb-base)]/15";
const textInputClass =
  "h-9 w-full min-w-0 rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 text-[13px] text-[var(--pos-text-1)] transition-[border-color,box-shadow] focus:border-[var(--pos-sb-base)] focus:outline-none focus:ring-2 focus:ring-[var(--pos-sb-base)]/15";
const labelClass = "text-[12px] font-medium leading-snug text-[var(--pos-text-1)]";
const fieldGroupClass = "flex min-w-0 flex-col gap-1.5";
const salesFieldGroupClass = `${fieldGroupClass} min-w-0 w-full`;
const sectionTitleClass = "text-[13px] font-semibold leading-tight text-[var(--pos-text-1)]";
const columnShellClass =
  "flex min-h-0 min-w-0 flex-col gap-3.5 rounded-[12px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-3 sm:p-4";
const entrySectionsGridClass =
  "flex min-w-0 flex-col-reverse items-stretch gap-3 sm:flex-row-reverse sm:items-start sm:gap-4";
const salesChannelGridClass = "flex min-w-0 flex-col gap-2.5";
const statsSummaryClass =
  "grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-divider)] sm:grid-cols-5";
const statCardClass = "flex min-w-0 flex-col gap-1 bg-[var(--pos-card)] px-3 py-3 sm:px-4";
const statValueClass =
  "text-[26px] font-bold tabular-nums leading-none text-[var(--pos-text-1)]";
const statValueHighlightClass =
  "text-[28px] font-extrabold tabular-nums leading-none text-[var(--pos-text-1)]";
const statCardHintClass = `${statCardClass} cursor-help`;
const expenseCardClass = "flex min-w-0 flex-col gap-1.5";
const expenseCardRowClass = "flex min-w-0 flex-wrap items-start gap-2";
/** Shared type scale inside Expenses: 12px fields, 11px meta/labels. */
const expenseFieldClass =
  "h-8 w-full min-w-0 rounded-[7px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-[12px] text-[var(--pos-text-1)] transition-[border-color,box-shadow] focus:border-[var(--pos-sb-base)] focus:outline-none focus:ring-2 focus:ring-[var(--pos-sb-base)]/15";
const expenseAmountFieldClass = `${expenseFieldClass} text-right font-mono font-semibold tabular-nums`;
const expensePrimaryInputClass = expenseFieldClass;
const expensePrimarySelectClass = `${expenseFieldClass} cursor-pointer`;
const expenseCardLabelClass =
  "text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)]";
const expenseMetaClass = "text-[11px] leading-snug text-[var(--pos-text-2)]";
const expenseChipLabelClass = "text-[11px] text-[var(--pos-text-2)]";
const expenseChipValueClass =
  "font-mono text-[12px] font-semibold tabular-nums text-[var(--pos-text-1)]";
const expenseChipShellClass =
  "flex h-8 min-w-[5.5rem] items-center justify-between gap-1.5 rounded-[7px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-2";
/** Read-only Total / Due — no field chrome. */
const expenseChipReadoutClass =
  "flex h-8 items-center gap-1.5 px-1 tabular-nums";
/** Regular-line memo: reads as quiet placeholder text until focused. */
const expenseQuietInputClass =
  "h-8 w-full min-w-0 rounded-[6px] border border-solid border-transparent bg-transparent px-2 text-[12px] text-[var(--pos-text-1)] transition-[border-color,background-color,box-shadow] placeholder:text-[var(--pos-text-2)]/70 focus:border-[var(--pos-input-border)] focus:bg-[var(--pos-input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--pos-sb-base)]/15";
const expenseRemoveBtnClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-[7px] border border-solid [border-color:var(--pos-divider)] text-[var(--pos-text-2)] transition-colors hover:border-red-500/50 hover:bg-red-500/5 hover:text-red-700";

function AttachmentCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="pointer-events-none absolute -right-1.5 -top-1.5 z-[2] flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--pos-sb-base)] px-1.5 text-[11px] font-bold leading-none text-white ring-2 ring-[var(--pos-card)]"
      aria-hidden
    >
      {label}
    </span>
  );
}

const expenseIconBtnClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-[7px] border border-solid [border-color:var(--pos-divider)] text-[var(--pos-text-2)] transition-colors hover:border-[var(--pos-sb-base)] hover:bg-[var(--pos-nav-hover)]/30 hover:text-[var(--pos-text-1)]";
const expenseNoteBtnActiveClass =
  "border-[var(--pos-sb-base)] bg-[var(--pos-nav-hover)]/20 text-[var(--pos-text-1)]";

type ExpenseCardKind = ExpenseLineDraft["kind"];

const EXPENSE_CARD_CHROME: Record<
  ExpenseCardKind,
  { shell: string; title: string }
> = {
  purchase: {
    shell: "rounded-[10px] border border-solid border-yellow-600/25 !bg-yellow-50/40 p-2",
    title: "Item purchase",
  },
  regular: {
    shell: "rounded-[10px] border border-solid border-red-500/20 bg-red-50/30 p-2",
    title: "Other expense",
  },
  staff: {
    shell: "rounded-[10px] border border-solid border-sky-500/25 !bg-sky-50/40 p-2",
    title: "Staff payout",
  },
  vendor: {
    shell: "rounded-[10px] border border-solid border-amber-500/25 !bg-amber-50/40 p-2",
    title: "Supplier payment",
  },
};

function ExpenseCardShell({
  kind,
  lineId,
  title,
  actions,
  children,
  purchaseVendor,
}: {
  kind: ExpenseCardKind;
  lineId: string;
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  purchaseVendor?: string;
}) {
  const chrome = EXPENSE_CARD_CHROME[kind];
  return (
    <div
      data-expense-line-id={lineId}
      data-purchase-vendor={purchaseVendor || undefined}
      className={`${expenseCardClass} ${chrome.shell}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={expenseCardLabelClass}>{title ?? chrome.title}</p>
        {actions ? (
          <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function ExpenseMoneyChips({
  total,
  paid,
  due,
  onTotalChange,
  onPaidChange,
  showPaidDue = true,
  labelsAbove = false,
  paidPlaceholder,
  totalAriaLabel = "Total",
  paidAriaLabel = "Amount paid now",
  totalInvalid,
  amountAnchor,
  leading,
  totalInputProps,
  paidInputProps,
}: {
  total: number | string;
  paid?: string;
  due: number;
  onTotalChange?: (value: string) => void;
  onPaidChange?: (value: string) => void;
  showPaidDue?: boolean;
  /** Column headers above fields (like purchase grid). */
  labelsAbove?: boolean;
  paidPlaceholder?: string;
  totalAriaLabel?: string;
  paidAriaLabel?: string;
  totalInvalid?: boolean;
  amountAnchor?: string;
  leading?: ReactNode;
  totalInputProps?: InputHTMLAttributes<HTMLInputElement>;
  paidInputProps?: InputHTMLAttributes<HTMLInputElement>;
}) {
  const dueTone =
    due > 0.005
      ? "text-red-600 dark:text-red-400"
      : "text-emerald-700 dark:text-emerald-400";
  const totalDisplay =
    typeof total === "number"
      ? total > 0
        ? formatMoney(total)
        : "—"
      : total;
  const col = labelsAbove ? "flex flex-col gap-0.5" : "contents";
  const labelCls = labelsAbove
    ? expenseCardLabelClass
    : expenseChipLabelClass;
  return (
    <div
      className={`flex min-w-0 flex-wrap gap-1.5 ${labelsAbove ? "items-start" : "items-center"}`}
      data-field-error-anchor={amountAnchor}
    >
      {leading}
      <div
        className={`ml-auto flex shrink-0 flex-wrap justify-end gap-1.5 ${
          labelsAbove ? "items-start" : "items-center"
        }`}
      >
        <div className={col}>
          {labelsAbove ? <span className={`${labelCls} text-right`}>Total</span> : null}
          {onTotalChange ? (
            <label className={expenseChipShellClass}>
              {labelsAbove ? null : <span className={expenseChipLabelClass}>Total</span>}
              <input
                {...totalInputProps}
                value={typeof total === "string" ? total : String(total)}
                onChange={(e) => onTotalChange(e.target.value)}
                placeholder="0"
                aria-label={totalAriaLabel}
                aria-invalid={totalInvalid ? true : undefined}
                className={`w-16 bg-transparent text-right outline-none ${expenseChipValueClass} ${
                  totalInvalid ? "!text-red-700" : ""
                }`}
              />
            </label>
          ) : (
            <div className={labelsAbove ? `${expenseChipReadoutClass} justify-end` : expenseChipReadoutClass}>
              {labelsAbove ? null : <span className={expenseChipLabelClass}>Total</span>}
              <span className={expenseChipValueClass}>{totalDisplay}</span>
            </div>
          )}
        </div>
        {showPaidDue && onPaidChange ? (
          <>
            <div className={col}>
              {labelsAbove ? <span className={`${labelCls} text-right`}>Paid</span> : null}
              <label className={expenseChipShellClass}>
                {labelsAbove ? null : <span className={expenseChipLabelClass}>Paid</span>}
                <input
                  {...paidInputProps}
                  value={paid ?? ""}
                  onChange={(e) => onPaidChange(e.target.value)}
                  placeholder={paidPlaceholder ?? "0"}
                  aria-label={paidAriaLabel}
                  className={`w-16 bg-transparent text-right outline-none ${expenseChipValueClass}`}
                />
              </label>
            </div>
            <div className={col}>
              {labelsAbove ? <span className={`${labelCls} text-right`}>Due</span> : null}
              <div
                className={`${expenseChipShellClass} cursor-default`}
                aria-label="Amount due"
              >
                {labelsAbove ? null : <span className={expenseChipLabelClass}>Due</span>}
                <span
                  className={`w-16 text-right font-mono text-[12px] font-semibold tabular-nums ${dueTone}`}
                >
                  {formatMoney(Math.max(0, due))}
                </span>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

const expenseAddPrimaryClass =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-[7px] border border-solid border-red-500/35 bg-red-500/12 px-2.5 text-[12px] font-semibold text-red-800 transition-colors hover:bg-red-500/18";
const expenseAddSecondaryClass =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-[7px] border border-solid px-2 text-[11px] font-semibold transition-colors";
const expenseAddStaffBtnClass = `${expenseAddSecondaryClass} border-sky-500/35 bg-sky-500/12 text-sky-900 hover:bg-sky-500/18`;
const expenseAddVendorBtnClass = `${expenseAddSecondaryClass} border-amber-500/35 bg-amber-500/12 text-amber-900 hover:bg-amber-500/18`;
const expenseAddPurchaseBtnClass = `${expenseAddSecondaryClass} border-yellow-600/40 bg-yellow-500/15 text-yellow-950 hover:bg-yellow-500/25`;
const editOpeningBtnClass =
  "inline-flex shrink-0 items-center justify-center rounded-md p-1 text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-nav-hover)]/50 hover:text-[var(--pos-text-1)]";

const headerSaveBtnClass =
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-[7px] px-2.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const headerLockBtnClass =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-[7px] border border-solid border-amber-500/50 bg-amber-500/10 px-2.5 text-[11px] font-semibold text-amber-800 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const headerUnlockBtnClass =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-[7px] border border-solid border-emerald-500/50 bg-emerald-500/10 px-2.5 text-[11px] font-semibold text-emerald-800 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const headerHistoryBtnClass =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-[7px] border border-solid [border-color:var(--pos-divider)] px-2.5 text-[11px] font-semibold text-[var(--pos-text-2)] transition-colors hover:text-[var(--pos-text-1)]";

const historyActionBtnClass =
  "inline-flex shrink-0 items-center justify-center rounded-md border border-solid [border-color:var(--pos-divider)] p-1.5 text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--pos-sb-base)]";

function newLineId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function newVendorExpenseLine(): ExpenseLineDraft {
  return {
    id: newLineId(),
    kind: "vendor",
    ...emptyExpenseLineFields(),
  };
}

function newRegularExpenseLine(): ExpenseLineDraft {
  return {
    id: newLineId(),
    kind: "regular",
    ...emptyExpenseLineFields(),
  };
}

function newStaffExpenseLine(): ExpenseLineDraft {
  return {
    id: newLineId(),
    kind: "staff",
    ...emptyExpenseLineFields(),
  };
}

function newPurchaseExpenseLine(): ExpenseLineDraft {
  return {
    id: newLineId(),
    kind: "purchase",
    ...emptyExpenseLineFields(),
    items: [newPurchaseItemDraft()],
  };
}

/** Calendar date in the device timezone (YYYY-MM-DD), not UTC. */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateAddDays(dateKey: string, days: number) {
  const parts = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  const [y, m, d] = parts;
  if (!y || !m || !d) return dateKey;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function parseAmount(raw: string): number {
  return parseNonNegativeAmount(raw);
}

function purchaseItemLineTotal(item: PurchaseItemDraft): number | null {
  const qty = parseAmount(item.qty);
  const total = parseAmount(item.total);
  if (!Number.isFinite(qty) || !Number.isFinite(total)) return null;
  if (qty <= 0 || total < 0) return null;
  if (!item.total.trim()) return null;
  return Math.round(total * 100) / 100;
}

/** Unit rate derived from total ÷ qty (display / persist helper). */
function purchaseItemLineRate(item: PurchaseItemDraft): number | null {
  const total = purchaseItemLineTotal(item);
  if (total === null) return null;
  const qty = parseAmount(item.qty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return Math.round((total / qty) * 100) / 100;
}

/** Format a computed rate/total to a clean 2-decimal string (empty if invalid). */
function formatPurchaseComputed(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Math.round(n * 100) / 100);
}

/**
 * Keep rate ↔ total in sync after a field edit. Rate and total are both
 * editable: typing one recomputes the other via qty. Editing qty holds
 * whichever value the user last typed and recomputes its partner.
 */
function recomputePurchaseItem(
  item: PurchaseItemDraft,
  patch: Partial<PurchaseItemDraft>,
): PurchaseItemDraft {
  const qty = parseAmount(item.qty);
  const hasQty = item.qty.trim() !== "" && Number.isFinite(qty) && qty > 0;
  const next = { ...item };

  if (typeof patch.rate === "string") {
    if (!next.rate.trim()) next.total = "";
    else if (hasQty) {
      const rate = parseAmount(next.rate);
      if (Number.isFinite(rate)) next.total = formatPurchaseComputed(rate * qty);
    }
    return next;
  }

  if (typeof patch.total === "string") {
    if (!next.total.trim()) next.rate = "";
    else if (hasQty) {
      const total = parseAmount(next.total);
      if (Number.isFinite(total)) next.rate = formatPurchaseComputed(total / qty);
    }
    return next;
  }

  if (typeof patch.qty === "string") {
    if (next.lastEdited === "rate" && next.rate.trim()) {
      const rate = parseAmount(next.rate);
      next.total = hasQty && Number.isFinite(rate) ? formatPurchaseComputed(rate * qty) : "";
    } else if (next.total.trim()) {
      const total = parseAmount(next.total);
      next.rate = hasQty && Number.isFinite(total) ? formatPurchaseComputed(total / qty) : "";
    }
    return next;
  }

  return next;
}

function purchaseItemsTotal(items: readonly PurchaseItemDraft[]): number {
  let sum = 0;
  let any = false;
  for (const item of items) {
    const lineTotal = purchaseItemLineTotal(item);
    if (lineTotal === null) continue;
    sum += lineTotal;
    any = true;
  }
  return any ? Math.round(sum * 100) / 100 : 0;
}

/** Group draft purchase rows by vendor (insertion order). Empty vendor = unassigned. */
function groupPurchaseDraftItemsByVendor(
  items: readonly PurchaseItemDraft[],
): Array<{ vendor: string; items: PurchaseItemDraft[] }> {
  const order: string[] = [];
  const map = new Map<string, PurchaseItemDraft[]>();
  for (const item of items) {
    const vendor = item.vendor.trim();
    if (!map.has(vendor)) {
      order.push(vendor);
      map.set(vendor, []);
    }
    map.get(vendor)!.push(item);
  }
  return order.map((vendor) => ({ vendor, items: map.get(vendor)! }));
}

/** Sum of valid purchase item totals per vendor across all purchase cards. */
function purchaseVendorTotalsFromLines(
  lines: readonly ExpenseLineDraft[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (line.kind !== "purchase") continue;
    for (const group of groupPurchaseDraftItemsByVendor(line.items)) {
      if (!group.vendor) continue;
      const groupTotal = purchaseItemsTotal(group.items);
      if (groupTotal <= 0) continue;
      const prev = totals.get(group.vendor) ?? 0;
      totals.set(group.vendor, Math.round((prev + groupTotal) * 100) / 100);
    }
  }
  return totals;
}

function amountStringFromPurchaseTotal(total: number): string {
  return total > 0 ? String(total) : "";
}

/**
 * Keep a vendor expense row for each purchase vendor: create if missing, update
 * amount while still synced, drop synced rows when that vendor’s purchases go away.
 */
function syncVendorExpensesFromPurchases(
  lines: readonly ExpenseLineDraft[],
  dismissedVendors: ReadonlySet<string>,
): ExpenseLineDraft[] {
  const totals = purchaseVendorTotalsFromLines(lines);
  const next: ExpenseLineDraft[] = [];
  const claimedVendors = new Set<string>();

  for (const line of lines) {
    if (line.kind === "purchase") {
      next.push(line);
      continue;
    }

    const syncedVendor = line.syncedFromPurchaseVendor?.trim() ?? "";
    if (line.kind === "vendor" && syncedVendor) {
      const total = totals.get(syncedVendor);
      if (total == null || total <= 0) {
        continue;
      }
      claimedVendors.add(syncedVendor);
      const amount = amountStringFromPurchaseTotal(total);
      if (line.vendor === syncedVendor && line.amount === amount) {
        next.push(line);
      } else {
        next.push({
          ...line,
          vendor: syncedVendor,
          amount,
          syncedFromPurchaseVendor: syncedVendor,
        });
      }
      continue;
    }

    next.push(line);
  }

  for (const [vendor, total] of totals) {
    if (claimedVendors.has(vendor)) continue;
    if (dismissedVendors.has(vendor)) continue;
    const hasManualVendorExpense = next.some(
      (line) => line.kind === "vendor" && line.vendor.trim() === vendor,
    );
    if (hasManualVendorExpense) continue;
    next.push({
      ...newVendorExpenseLine(),
      vendor,
      amount: amountStringFromPurchaseTotal(total),
      syncedFromPurchaseVendor: vendor,
    });
  }

  return next;
}

function purchaseVendorReceiptUrls(
  line: ExpenseLineDraft,
  vendor: string,
): string[] {
  const key = vendor.trim();
  if (!key) return [];
  const fromMap = line.vendorReceipts?.[key];
  if (fromMap && fromMap.length > 0) return fromMap;
  // Legacy single-list fallback when only one vendor is on the card.
  const vendors = new Set(
    line.items.map((i) => i.vendor.trim()).filter(Boolean),
  );
  if (vendors.size === 1 && vendors.has(key) && line.receiptDataUrls.length > 0) {
    return line.receiptDataUrls;
  }
  return fromMap ?? [];
}

function draftLineCashAmount(line: ExpenseLineDraft): number {
  if (line.kind === "purchase") return 0;
  if (line.kind === "regular") {
    const total = parseAmount(line.amount);
    if (line.paidAmount.trim() === "") return total;
    return parseAmount(line.paidAmount);
  }
  return parseAmount(line.amount);
}

function committedPurchaseItemsFromDraft(
  items: readonly PurchaseItemDraft[],
): Array<{
  id: string;
  vendor: string;
  name: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
}> | null {
  const named = items.filter((i) => i.name.trim().length > 0);
  if (named.length === 0) return null;
  const out: Array<{
    id: string;
    vendor: string;
    name: string;
    qty: number;
    unit: string;
    rate: number;
    total: number;
  }> = [];
  for (const row of named) {
    const vendor = row.vendor.trim();
    if (!vendor) return null;
    const total = purchaseItemLineTotal(row);
    const rate = purchaseItemLineRate(row);
    if (total === null || total <= 0 || rate === null) return null;
    const qty = parseAmount(row.qty);
    out.push({
      id: row.key,
      vendor,
      name: row.name.trim(),
      qty,
      unit: row.unit.trim() || "pcs",
      rate,
      total,
    });
  }
  return out;
}

function groupPurchaseItemsByVendor(
  items: Array<{
    id: string;
    vendor: string;
    name: string;
    qty: number;
    unit: string;
    rate: number;
    total: number;
  }>,
): Map<
  string,
  Array<{ id: string; name: string; qty: number; unit: string; rate: number; total: number }>
> {
  const groups = new Map<
    string,
    Array<{ id: string; name: string; qty: number; unit: string; rate: number; total: number }>
  >();
  for (const item of items) {
    const vendor = item.vendor.trim();
    const list = groups.get(vendor) ?? [];
    list.push({
      id: item.id,
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      rate: item.rate,
      total: item.total,
    });
    groups.set(vendor, list);
  }
  return groups;
}

/** Amount fields show blank instead of 0 so untouched fields are easy to scan. */
function amountFieldText(value: number | undefined): string {
  const amount = value ?? 0;
  return amount === 0 ? "" : String(amount);
}

function linkNonNegativeAmount(setter: (value: string) => void) {
  return (e: ChangeEvent<HTMLInputElement>) =>
    setter(sanitizeNonNegativeDecimalInput(e.target.value));
}

type ExpenseFieldPart =
  | "vendor"
  | "amount"
  | "label"
  | "attach"
  | "ledgerKind"
  | "ledgerNote"
  | "note"
  | "employeeId";

type SalesFieldPart = "voidRemarks" | "voidAttach" | "bankWithdrawn";

type FormNotice =
  | { kind: "none" }
  | { kind: "global"; message: string }
  | { kind: "globalError"; message: string }
  | { kind: "field"; message: string; lineId: string; part: ExpenseFieldPart }
  | { kind: "salesField"; message: string; part: SalesFieldPart };

function fieldErrorMessage(
  notice: FormNotice,
  lineId: string,
  part: ExpenseFieldPart,
): string | null {
  if (notice.kind !== "field") return null;
  if (notice.lineId !== lineId || notice.part !== part) return null;
  return notice.message;
}

function salesFieldErrorMessage(
  notice: FormNotice,
  part: SalesFieldPart,
): string | null {
  if (notice.kind !== "salesField") return null;
  if (notice.part !== part) return null;
  return notice.message;
}

function findFirstExpenseValidationError(
  lines: ExpenseLineDraft[],
  options?: { dateKey?: string; salaryBundle?: ReturnType<typeof getSalaryBundle> },
): { message: string; lineId: string; part: ExpenseFieldPart } | null {
  const monthKey = options?.dateKey?.slice(0, 7);
  const salaryBundle = options?.salaryBundle;

  for (const line of lines) {
    if (line.kind === "staff") {
      if (parseAmount(line.amount) > 0 && !line.employeeId.trim()) {
        return {
          message: "Select an employee for this staff payout.",
          lineId: line.id,
          part: "employeeId",
        };
      }
      if (line.employeeId.trim() && parseAmount(line.amount) <= 0) {
        return {
          message: "Enter an amount for this staff payout.",
          lineId: line.id,
          part: "amount",
        };
      }
      if (
        line.employeeId.trim() &&
        parseAmount(line.amount) > 0 &&
        monthKey &&
        salaryBundle
      ) {
        const capErr = validateStaffPayoutAmount({
          bundle: salaryBundle,
          monthKey,
          employeeId: line.employeeId.trim(),
          amount: parseAmount(line.amount),
          staffLineKind: line.staffLineKind,
          excludeLineId: line.id,
          excludePaymentId: line.salaryPaymentId,
        });
        if (capErr) {
          return { message: capErr, lineId: line.id, part: "amount" };
        }
      }
      continue;
    }
    if (line.kind === "vendor") {
      if (parseAmount(line.amount) > 0 && !line.vendor.trim()) {
        return {
          message: "Select or enter a supplier name, or remove this row.",
          lineId: line.id,
          part: "vendor",
        };
      }
      if (line.vendor.trim() && parseAmount(line.amount) <= 0) {
        return {
          message: "Enter an amount for this ledger line.",
          lineId: line.id,
          part: "amount",
        };
      }
      const noteTrim = line.ledgerNote.trim();
      const supplierId = resolveLedgerSupplierIdByBookName(line.vendor.trim());
      if (noteTrim && !supplierId) {
        return {
          message: "Memo is only used when the name matches a supplier.",
          lineId: line.id,
          part: "ledgerNote",
        };
      }
      if (supplierId) {
        const ledgerAmtErr = validateDailyExpenseLedgerAmount({
          supplierId,
          amountStr: line.amount,
          kind: "payment",
        });
        if (ledgerAmtErr) {
          return {
            message: ledgerAmtErr,
            lineId: line.id,
            part: "amount",
          };
        }
      }
      continue;
    }
    if (line.kind === "purchase") {
      const hasAnyItemInput = line.items.some(
        (i) => i.name.trim() || i.total.trim() || i.vendor.trim() || parseAmount(i.qty) !== 1,
      );
      const hasAnyVendorNote = Object.values(line.vendorNotes ?? {}).some((n) => n.trim());
      if (!hasAnyItemInput && !line.ledgerNote.trim() && !hasAnyVendorNote) {
        continue;
      }
      for (const item of line.items) {
        const touched =
          item.name.trim() ||
          item.vendor.trim() ||
          item.total.trim() ||
          (item.qty.trim() !== "" && item.qty.trim() !== "1");
        if (!touched) continue;
        if (!item.vendor.trim()) {
          return {
            message: "Select a supplier for each item.",
            lineId: line.id,
            part: "vendor",
          };
        }
        if (!resolveLedgerSupplierIdByBookName(item.vendor.trim())) {
          return {
            message: "Purchases must use an existing supplier.",
            lineId: line.id,
            part: "vendor",
          };
        }
        if (!item.name.trim() || purchaseItemLineTotal(item) === null) {
          return {
            message: "Enter name, qty, and total for each item.",
            lineId: line.id,
            part: "amount",
          };
        }
      }
      const items = committedPurchaseItemsFromDraft(line.items);
      if (!items || items.length === 0) {
        return {
          message: "Add at least one item with supplier, name, qty, and total.",
          lineId: line.id,
          part: "amount",
        };
      }
      continue;
    }
    if (line.kind === "regular") {
      if (parseAmount(line.amount) > 0 && !line.label.trim()) {
        return {
          message: "Enter an expense title.",
          lineId: line.id,
          part: "label",
        };
      }
      if (line.label.trim() && parseAmount(line.amount) <= 0) {
        return {
          message: "Enter the expense total.",
          lineId: line.id,
          part: "amount",
        };
      }
      const total = parseAmount(line.amount);
      const paid =
        line.paidAmount.trim() === "" ? total : parseAmount(line.paidAmount);
      if (line.label.trim() && paid > total + 0.001) {
        return {
          message: "Paid cannot be more than total.",
          lineId: line.id,
          part: "amount",
        };
      }
    }
  }
  return null;
}

const FIELD_ERR_INPUT =
  "!border-red-500/90 ring-2 ring-red-500/35 focus:!border-red-500 focus:ring-red-500/45";
const FIELD_ERR_ATTACH_WRAP = "rounded-[8px] ring-2 ring-red-500/35";

function ExpenseFieldErrorBubble({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mt-1 w-full max-w-[min(17rem,100%)] rounded-md border border-red-500/50 bg-[var(--pos-card)] px-2 py-1 text-[10px] leading-snug text-red-700 shadow-sm"
    >
      {message}
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Summary totals and closing balance — whole taka only. */
function formatSummaryMoney(value: number) {
  return new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(roundTaka(value));
}

function expenseTotalFromRow(r: DailyEntryRow): number {
  if (r.expenseLines && r.expenseLines.length > 0) {
    return expenseTotalFromExpenseLines(r.expenseLines);
  }
  return r.expenses ?? 0;
}

function receiptCountForLine(line: ExpenseLineSaved): number {
  return line.receiptDataUrls?.length ?? 0;
}

function totalReceiptCountForRow(r: DailyEntryRow): number {
  if (!r.expenseLines?.length) return 0;
  return r.expenseLines.reduce((s, line) => s + receiptCountForLine(line), 0);
}

function normalizeReceiptUrls(urls: string[] | undefined): string {
  return JSON.stringify([...(urls ?? [])].sort());
}

function draftLinePostsToLedger(line: ExpenseLineDraft | undefined): boolean {
  if (!line) return false;
  if (line.kind === "vendor") {
    const v = line.vendor.trim();
    if (!v) return false;
    return Boolean(resolveLedgerSupplierIdByBookName(v));
  }
  if (line.kind === "purchase") {
    return Boolean(committedPurchaseItemsFromDraft(line.items));
  }
  return false;
}

function savedLinePostsToLedger(line: ExpenseLineSaved): boolean {
  const kind = savedLineKind(line);
  if (kind === "vendor") {
    const v = (line.vendor ?? "").trim();
    if (!v) return false;
    return line.ledgerKind === "payment";
  }
  if (kind === "purchase") {
    const v = (line.vendor ?? "").trim();
    if (!v) return false;
    return line.ledgerKind === "invoice";
  }
  return false;
}

function normalizePurchaseItemsFingerprint(
  items:
    | Array<{ name: string; qty: number; unit: string; rate: number; total: number }>
    | undefined,
): string {
  const rows = [...(items ?? [])]
    .map(
      (i) =>
        `${i.name.trim().toLowerCase()}\0${i.qty}\0${i.unit}\0${i.rate}\0${i.total}`,
    )
    .sort((a, b) => a.localeCompare(b));
  return JSON.stringify(rows);
}

/** Multiset key for vendor expense rows that post to the ledger (dedupe commits vs prior save). */
function vendorLedgerFingerprintSaved(line: ExpenseLineSaved): string | null {
  if (!savedLinePostsToLedger(line)) return null;
  const v = (line.vendor ?? "").trim();
  const note = (line.ledgerNote ?? "").trim();
  const kind = savedLineKind(line);
  if (kind === "purchase") {
    // Each vendor split carries its own receipts onto that vendor’s bill.
    return `${v}\0${line.amount}\0invoice\0${note}\0${normalizeReceiptUrls(line.receiptDataUrls)}\0${normalizePurchaseItemsFingerprint(line.items)}`;
  }
  return `${v}\0${line.amount}\0${line.ledgerKind!}\0${note}\0${normalizeReceiptUrls(line.receiptDataUrls)}`;
}

function vendorLedgerFingerprintDraft(line: ExpenseLineDraft): string | null {
  if (!draftLinePostsToLedger(line)) return null;
  const v = line.vendor.trim();
  if (line.kind === "purchase") {
    const items = committedPurchaseItemsFromDraft(line.items);
    if (!items) return null;
    const amt = items.reduce((s, i) => s + i.total, 0);
    return `${v}\0${amt}\0invoice\0${line.ledgerNote.trim()}\0${normalizeReceiptUrls(line.receiptDataUrls)}\0${normalizePurchaseItemsFingerprint(items)}`;
  }
  const amt = parseAmount(line.amount);
  return `${v}\0${amt}\0payment\0${line.ledgerNote.trim()}\0${normalizeReceiptUrls(line.receiptDataUrls)}`;
}

function normalizeExpenseLinesForCompare(lines: ExpenseLineSaved[] | undefined): string {
  const rows = [...(lines ?? [])].map((line) => {
    const kind = savedLineKind(line);
    return {
      kind,
      lineId: line.lineId ?? "",
      vendor: kind === "vendor" || kind === "purchase" ? (line.vendor ?? "").trim() : "",
      label: kind === "regular" ? (line.label ?? "").trim() : "",
      expenseCategoryId:
        kind === "regular" ? (line.expenseCategoryId ?? "").trim() : "",
      paidAmount:
        kind === "regular"
          ? typeof line.paidAmount === "number"
            ? line.paidAmount
            : line.amount
          : null,
      employeeId: kind === "staff" ? (line.employeeId ?? "").trim() : "",
      staffLineKind:
        kind === "staff" ? staffLineKindFromSaved(line as ExpenseLineSaved) : "",
      salaryPaymentId: kind === "staff" ? (line.salaryPaymentId ?? "") : "",
      amount: line.amount,
      receipts: normalizeReceiptUrls(line.receiptDataUrls),
      ledgerKind:
        kind === "vendor" || kind === "purchase" ? (line.ledgerKind ?? "") : "",
      ledgerEmployeeLineKind:
        kind === "vendor" ? (line.ledgerEmployeeLineKind ?? "") : "",
      ledgerNote:
        kind === "vendor" || kind === "purchase" ? (line.ledgerNote ?? "").trim() : "",
      note:
        kind === "regular" || kind === "staff" ? (line.note ?? "").trim() : "",
      items: kind === "purchase" ? normalizePurchaseItemsFingerprint(line.items) : "",
    };
  });
  rows.sort((a, b) =>
    `${a.kind}\0${a.lineId}\0${a.vendor}\0${a.label}\0${a.expenseCategoryId}\0${a.paidAmount}\0${a.employeeId}\0${a.staffLineKind}\0${a.salaryPaymentId}\0${a.amount}\0${a.ledgerKind}\0${a.ledgerEmployeeLineKind}\0${a.ledgerNote}\0${a.note}\0${a.items}`.localeCompare(
      `${b.kind}\0${b.lineId}\0${b.vendor}\0${b.label}\0${b.expenseCategoryId}\0${b.paidAmount}\0${b.employeeId}\0${b.staffLineKind}\0${b.salaryPaymentId}\0${b.amount}\0${b.ledgerKind}\0${b.ledgerEmployeeLineKind}\0${b.ledgerNote}\0${b.note}\0${b.items}`,
    ),
  );
  return JSON.stringify(rows);
}

/** Updates workspace ledger rows from daily vendor lines; run before persisting the day. */
function syncDailyExpenseLedgerLinks({
  prior,
  baseLines,
  expenseLines,
  dateKey,
}: {
  prior: DailyEntryRow | undefined;
  baseLines: ExpenseLineSaved[];
  expenseLines: ExpenseLineDraft[];
  dateKey: string;
}): { lines: ExpenseLineSaved[]; failed: boolean } {
  const draftById = new Map(expenseLines.map((d) => [d.id, d]));
  const priorByLineId = new Map<string, ExpenseLineSaved>();
  for (const pl of prior?.expenseLines ?? []) {
    if (pl.lineId) priorByLineId.set(pl.lineId, pl);
  }

  let failed = false;
  const lines = baseLines.map((base) => {
    const baseKind = savedLineKind(base);
    if (baseKind !== "vendor" && baseKind !== "purchase") return base;

    const lineId = base.lineId;
    const draftId =
      lineId && lineId.includes("::") ? lineId.slice(0, lineId.indexOf("::")) : lineId;
    const draft = draftId ? draftById.get(draftId) : undefined;
    const priorLine = lineId ? priorByLineId.get(lineId) : undefined;
    const postsNow =
      savedLinePostsToLedger(base) &&
      (baseKind === "purchase"
        ? Boolean(base.vendor?.trim() && (base.items?.length ?? 0) > 0)
        : draftLinePostsToLedger(draft));

    if (!postsNow) {
      if (priorLine?.ledgerLink) {
        // Tear down daily-created payment/bill links when the line no longer posts.
        if (
          priorLine.ledgerKind === "payment" ||
          priorLine.ledgerKind === "invoice"
        ) {
          if (!removeDailyLedgerExpenseLink(priorLine.ledgerLink)) {
            failed = true;
            return { ...base, ledgerLink: priorLine.ledgerLink };
          }
        }
      }
      return base;
    }

    const fpDraft =
      baseKind === "purchase"
        ? vendorLedgerFingerprintSaved(base)
        : vendorLedgerFingerprintDraft(draft!);
    const fpPrior =
      priorLine && savedLinePostsToLedger(priorLine)
        ? vendorLedgerFingerprintSaved(priorLine)
        : null;

    const isPurchase = baseKind === "purchase";

    if (priorLine?.ledgerLink && fpPrior === fpDraft) {
      return { ...base, ledgerLink: priorLine.ledgerLink };
    }

    if (priorLine?.ledgerLink && isDailyLedgerLinkLocked(priorLine.ledgerLink)) {
      failed = true;
      return { ...base, ledgerLink: priorLine.ledgerLink };
    }

    const supplierId = resolveLedgerSupplierIdByBookName(
      (baseKind === "purchase" ? base.vendor : draft?.vendor)?.trim() ?? "",
    );
    if (!supplierId) {
      failed = true;
      return { ...base, ledgerLink: priorLine?.ledgerLink };
    }

    const purchaseItems = isPurchase ? (base.items ?? []) : null;
    if (isPurchase && (!purchaseItems || purchaseItems.length === 0)) {
      failed = true;
      return { ...base, ledgerLink: priorLine?.ledgerLink };
    }

    const receiptUrls = (() => {
      if (isPurchase) {
        // Per-vendor receipts are already on the saved split line.
        return base.receiptDataUrls ? [...base.receiptDataUrls] : [];
      }
      return (
        draft?.receiptDataUrls ??
        (base.receiptDataUrls ? [...base.receiptDataUrls] : [])
      );
    })();

    const res = commitLedgerFromDailyExpenseLine({
      supplierId,
      entryDateIso: dateKey,
      amountStr: isPurchase ? String(base.amount) : (draft?.amount ?? ""),
      kind: isPurchase ? "invoice" : "payment",
      notes:
        (isPurchase ? base.ledgerNote : draft?.ledgerNote)?.trim() ?? "",
      attachments: ledgerAttachmentsFromReceiptRefs(receiptUrls),
      ...(purchaseItems
        ? {
            items: purchaseItems.map((i) => ({
              name: i.name,
              qty: i.qty,
              unit: i.unit,
              rate: i.rate,
            })),
          }
        : {}),
    });

    if (!res.ok) {
      failed = true;
      return { ...base, ledgerLink: priorLine?.ledgerLink };
    }

    if (
      priorLine?.ledgerLink &&
      (priorLine.ledgerKind === "payment" || priorLine.ledgerKind === "invoice")
    ) {
      if (!removeDailyLedgerExpenseLink(priorLine.ledgerLink)) {
        failed = true;
        return { ...base, ledgerLink: priorLine.ledgerLink };
      }
    }

    return {
      ...base,
      ledgerLink: {
        ledgerEntryId: res.ledgerEntryId,
        ...(res.purchaseOrderId ? { purchaseOrderId: res.purchaseOrderId } : {}),
      },
    };
  });

  const baseLineIds = new Set(
    baseLines.map((b) => b.lineId).filter((x): x is string => Boolean(x)),
  );
  for (const pl of prior?.expenseLines ?? []) {
    if (!pl.lineId || !savedLinePostsToLedger(pl) || !pl.ledgerLink) continue;
    const plKind = savedLineKind(pl);
    if (plKind !== "vendor" && plKind !== "purchase") continue;
    if (baseLineIds.has(pl.lineId)) continue;
    if (pl.ledgerKind === "payment" || pl.ledgerKind === "invoice") {
      if (!removeDailyLedgerExpenseLink(pl.ledgerLink)) {
        failed = true;
      }
    }
  }

  return { lines, failed };
}

function normalizeVoidSaleAttachments(urls: string[] | undefined): string {
  return JSON.stringify([...(urls ?? [])].sort());
}

/** True when disk row and proposed save carry the same business data (ignores updatedAt). */
function savedEntryBodyEquals(prior: DailyEntryRow, next: DailyEntryRow): boolean {
  if (prior.date !== next.date) return false;
  const priorVoid = prior.voidSale ?? 0;
  const nextVoid = next.voidSale ?? 0;
  return (
    prior.openingBalance === next.openingBalance &&
    prior.cashSale === next.cashSale &&
    prior.bankSale === next.bankSale &&
    prior.bkashSale === next.bkashSale &&
    prior.nagadSale === next.nagadSale &&
    prior.pathaoSale === next.pathaoSale &&
    prior.foodiSale === next.foodiSale &&
    prior.foodpandaSale === next.foodpandaSale &&
    priorVoid === nextVoid &&
    (prior.voidSaleRemarks ?? "").trim() === (next.voidSaleRemarks ?? "").trim() &&
    normalizeVoidSaleAttachments(prior.voidSaleAttachmentDataUrls) ===
      normalizeVoidSaleAttachments(next.voidSaleAttachmentDataUrls) &&
    prior.remainingBalance === next.remainingBalance &&
    (prior.bankWithdrawn ?? 0) === (next.bankWithdrawn ?? 0) &&
    normalizeExpenseLinesForCompare(prior.expenseLines) ===
      normalizeExpenseLinesForCompare(next.expenseLines) &&
    (prior.enteredBy ?? "") === (next.enteredBy ?? "")
  );
}

function draftsFromRow(r: DailyEntryRow): ExpenseLineDraft[] {
  if (r.expenseLines && r.expenseLines.length > 0) {
    const filtered = r.expenseLines.filter((line) => !isStaffFineExpenseLine(line));
    const drafts: ExpenseLineDraft[] = [];
    const purchaseDraftById = new Map<string, ExpenseLineDraft>();

    for (const line of filtered) {
      if (line.kind === "staff" || isLegacyStaffVendorLine(line)) {
        drafts.push({
          id: line.lineId ?? newLineId(),
          kind: "staff" as const,
          ...emptyExpenseLineFields(),
          employeeId: line.employeeId?.trim() || employeeIdFromSavedStaffLine(line),
          staffLineKind: staffLineKindFromSaved(line),
          note: staffExpenseLineNote(line),
          salaryPaymentId: line.salaryPaymentId,
          amount: line.amount === 0 ? "" : String(line.amount),
          receiptDataUrls: [...(line.receiptDataUrls ?? [])],
        });
        continue;
      }
      const kind = savedLineKind(line);
      if (kind === "purchase") {
        const lineVendor = (line.vendor ?? "").trim();
        const rawId = line.lineId ?? newLineId();
        const draftId = rawId.includes("::") ? rawId.slice(0, rawId.indexOf("::")) : rawId;
        const itemDrafts =
          line.items && line.items.length > 0
            ? line.items.map((item) => ({
                key: item.id || newLineId(),
                vendor: lineVendor,
                name: item.name,
                qty: String(item.qty),
                unit: item.unit || "pcs",
                rate:
                  item.rate > 0
                    ? String(item.rate)
                    : item.total > 0 && item.qty > 0
                      ? String(Math.round((item.total / item.qty) * 100) / 100)
                      : "",
                total:
                  item.total > 0
                    ? String(item.total)
                    : item.rate > 0 && item.qty > 0
                      ? String(Math.round(item.qty * item.rate * 100) / 100)
                      : "",
              }))
            : [newPurchaseItemDraft(lineVendor)];
        const existing = purchaseDraftById.get(draftId);
        const vendorReceiptPatch =
          lineVendor && (line.receiptDataUrls?.length ?? 0) > 0
            ? { [lineVendor]: [...(line.receiptDataUrls ?? [])] }
            : {};
        const vendorNotePatch =
          lineVendor && (line.ledgerNote ?? "").trim()
            ? { [lineVendor]: (line.ledgerNote ?? "").trim() }
            : {};
        if (existing) {
          existing.items = [...existing.items, ...itemDrafts];
          existing.amount = String(
            (parseAmount(existing.amount) || 0) + (line.amount || 0),
          );
          if (lineVendor && vendorReceiptPatch[lineVendor]) {
            const prev = existing.vendorReceipts[lineVendor] ?? [];
            const incoming = vendorReceiptPatch[lineVendor];
            const merged = [...prev];
            for (const url of incoming) {
              if (!merged.includes(url)) merged.push(url);
            }
            existing.vendorReceipts = {
              ...existing.vendorReceipts,
              [lineVendor]: merged,
            };
          }
          if (lineVendor && vendorNotePatch[lineVendor] && !existing.vendorNotes[lineVendor]) {
            existing.vendorNotes = {
              ...existing.vendorNotes,
              ...vendorNotePatch,
            };
          }
        } else {
          const draft: ExpenseLineDraft = {
            id: draftId,
            kind: "purchase",
            ...emptyExpenseLineFields(),
            vendor: lineVendor,
            amount: line.amount === 0 ? "" : String(line.amount),
            receiptDataUrls: [],
            vendorReceipts: vendorReceiptPatch,
            vendorNotes: vendorNotePatch,
            ledgerNote: "",
            items: itemDrafts,
          };
          purchaseDraftById.set(draftId, draft);
          drafts.push(draft);
        }
        continue;
      }
      const paidSaved =
        kind === "regular" && typeof line.paidAmount === "number"
          ? line.paidAmount
          : kind === "regular"
            ? line.amount
            : undefined;
      drafts.push({
        id: line.lineId ?? newLineId(),
        kind,
        ...emptyExpenseLineFields(),
        vendor: kind === "vendor" ? (line.vendor ?? "") : "",
        label: kind === "regular" ? (line.label ?? "") : "",
        expenseCategoryId:
          kind === "regular" ? (line.expenseCategoryId ?? "") : "",
        amount: line.amount === 0 ? "" : String(line.amount),
        paidAmount:
          paidSaved != null && paidSaved !== 0 ? String(paidSaved) : paidSaved === 0 ? "0" : "",
        receiptDataUrls: [...(line.receiptDataUrls ?? [])],
        ledgerNote: kind === "vendor" ? (line.ledgerNote ?? "") : "",
        note: kind === "regular" ? (line.note ?? "") : "",
      });
    }
    return drafts;
  }
  if ((r.expenses ?? 0) > 0) {
    return [
      {
        id: newLineId(),
        kind: "vendor",
        ...emptyExpenseLineFields(),
        vendor: "Legacy total",
        amount: String(r.expenses),
      },
    ];
  }
  return [];
}

function computeRemainingFromParts(
  openingBalance: string,
  sales: {
    cashSale: string;
    bkashSale: string;
    nagadSale: string;
    pathaoSale: string;
    foodiSale: string;
    foodpandaSale: string;
    voidSale: string;
  },
  expenseLineDrafts: ExpenseLineDraft[],
): number {
  // Bank sales go straight to the bank — exclude from closing cash.
  const salesSum =
    parseAmount(sales.cashSale) +
    parseAmount(sales.bkashSale) +
    parseAmount(sales.nagadSale) +
    parseAmount(sales.pathaoSale) +
    parseAmount(sales.foodiSale) +
    parseAmount(sales.foodpandaSale);
  const voidAmt = Math.max(0, parseAmount(sales.voidSale));
  const expenseSum = expenseLineDrafts.reduce((s, line) => s + draftLineCashAmount(line), 0);
  return roundTaka(parseAmount(openingBalance) + salesSum - voidAmt - expenseSum);
}

function buildVendorOptions(
  draftLines: ExpenseLineDraft[],
  ledgerBookNames: readonly string[],
): string[] {
  const set = new Set<string>();
  for (const name of ledgerBookNames) {
    set.add(name);
  }
  for (const line of draftLines) {
    if (line.kind !== "vendor") continue;
    const v = line.vendor.trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function salesTotal(r: DailyEntryRow): number {
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
  const gross = salesTotal(r);
  const voidAmt = Math.max(0, r.voidSale ?? 0);
  return roundTaka(gross - voidAmt);
}

/** Lowercase text slice for matching formatted + raw amounts. */
function amountSearchText(n: number): string {
  const formatted = formatMoney(n).toLowerCase();
  const raw = String(n).toLowerCase();
  return `${formatted} ${raw}`;
}

/** Segments for advanced saved-entry search (all lowercase). */
type DailyEntrySearchSegments = {
  all: string;
  date: string;
  vendor: string;
  title: string;
  opening: string;
  sales: string;
  expenses: string;
  bankWithdrawn: string;
  remaining: string;
  cash: string;
  bank: string;
  bkash: string;
  nagad: string;
  pathao: string;
  foodi: string;
  foodpanda: string;
  void: string;
  updated: string;
  legacy: string;
};

function buildDailyEntrySearchSegments(r: DailyEntryRow): DailyEntrySearchSegments {
  const vendors: string[] = [];
  const titles: string[] = [];
  const expenseNotes: string[] = [];
  for (const line of r.expenseLines ?? []) {
    if (isStaffFineExpenseLine(line)) continue;
    const k = savedLineKind(line);
    if (k === "staff" || isLegacyStaffVendorLine(line)) {
      titles.push(staffExpenseLineTitle(line));
      expenseNotes.push(staffExpenseLineNote(line));
    } else if (k === "vendor" || k === "purchase") {
      vendors.push((line.vendor ?? "").trim());
      expenseNotes.push((line.ledgerNote ?? "").trim());
      if (k === "purchase") {
        for (const item of line.items ?? []) {
          titles.push(item.name.trim());
        }
      }
    } else {
      titles.push((line.label ?? "").trim());
      expenseNotes.push((line.note ?? "").trim());
    }
  }
  const vendorStr = vendors.filter(Boolean).join(" ").toLowerCase();
  const titleStr = titles.filter(Boolean).join(" ").toLowerCase();
  const expenseNotesStr = expenseNotes.filter(Boolean).join(" ").toLowerCase();
  const st = salesTotal(r);
  const voidAmt = r.voidSale ?? 0;
  const voidRemarks = (r.voidSaleRemarks ?? "").trim().toLowerCase();
  const ex = expenseTotalFromRow(r);
  const bankWithdrawnAmt = r.bankWithdrawn ?? 0;
  const bankWithdrawnS =
    bankWithdrawnAmt > 0
      ? `bank withdrawn ${amountSearchText(bankWithdrawnAmt)}`
      : "";
  let legacyStr = "";
  if (!(r.expenseLines && r.expenseLines.length > 0) && (r.expenses ?? 0) > 0) {
    legacyStr = `legacy total ${amountSearchText(r.expenses ?? 0)}`;
  }
  let updatedStr = "";
  if (r.updatedAt) {
    try {
      const d = new Date(r.updatedAt);
      updatedStr = `${r.updatedAt} ${d.toLocaleString(undefined)}`.toLowerCase();
    } catch {
      updatedStr = r.updatedAt.toLowerCase();
    }
  }
  const dateStr = `${r.date} ${formatDateKeyAsDisplay(r.date)}`.toLowerCase();
  const cashS = `cash ${amountSearchText(r.cashSale)}`;
  const bankS = `bank ${amountSearchText(r.bankSale)}`;
  const bkashS = `bkash ${amountSearchText(r.bkashSale)}`;
  const nagadS = `nagad ${amountSearchText(r.nagadSale)}`;
  const pathaoS = `pathao ${amountSearchText(r.pathaoSale)}`;
  const foodiS = `foodi ${amountSearchText(r.foodiSale)}`;
  const foodpandaS = `foodpanda ${amountSearchText(r.foodpandaSale)}`;
  const voidS =
    voidAmt > 0
      ? `void ${amountSearchText(voidAmt)} ${voidRemarks}`
      : "";
  const all = [
    dateStr,
    vendorStr,
    titleStr,
    expenseNotesStr,
    amountSearchText(r.openingBalance),
    amountSearchText(st),
    amountSearchText(ex),
    bankWithdrawnS,
    amountSearchText(r.remainingBalance),
    cashS,
    bankS,
    bkashS,
    nagadS,
    pathaoS,
    foodiS,
    foodpandaS,
    voidS,
    legacyStr,
    updatedStr,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    all,
    date: dateStr,
    vendor: vendorStr,
    title: titleStr,
    opening: amountSearchText(r.openingBalance),
    sales: `${amountSearchText(st)} sales total`,
    expenses: `${amountSearchText(ex)} expenses`,
    bankWithdrawn: bankWithdrawnS.toLowerCase(),
    remaining: amountSearchText(r.remainingBalance),
    cash: cashS.toLowerCase(),
    bank: bankS.toLowerCase(),
    bkash: bkashS.toLowerCase(),
    nagad: nagadS.toLowerCase(),
    pathao: pathaoS.toLowerCase(),
    foodi: foodiS.toLowerCase(),
    foodpanda: foodpandaS.toLowerCase(),
    void: voidS.toLowerCase(),
    updated: updatedStr,
    legacy: legacyStr,
  };
}

type DailyEntrySearchClause = {
  neg: boolean;
  field: keyof DailyEntrySearchSegments | null;
  value: string;
};

const DAILY_ENTRY_SEARCH_FIELD_ALIASES: Record<string, keyof DailyEntrySearchSegments> = {
  date: "date",
  supplier: "vendor",
  vendor: "vendor",
  s: "vendor",
  v: "vendor",
  title: "title",
  regular: "title",
  expense: "expenses",
  expenses: "expenses",
  withdrawn: "bankWithdrawn",
  "bank-withdrawn": "bankWithdrawn",
  opening: "opening",
  sales: "sales",
  remaining: "remaining",
  cash: "cash",
  bank: "bank",
  bkash: "bkash",
  nagad: "nagad",
  pathao: "pathao",
  foodi: "foodi",
  foodpanda: "foodpanda",
  void: "void",
  updated: "updated",
  saved: "updated",
  legacy: "legacy",
};

/**
 * Advanced query: space-separated terms (AND). `-term` excludes. `field:value` limits to a column.
 * Quoted `"phrase"` for multi-word. Example: vendor:rent remaining:5000 -legacy "01-apr"
 */
function parseDailyEntrySearchQuery(raw: string): DailyEntrySearchClause[] {
  const clauses: DailyEntrySearchClause[] = [];
  let s = raw.trim();
  while (s.length > 0) {
    while (s.length > 0 && /\s/.test(s[0])) {
      s = s.slice(1);
    }
    if (s.length === 0) break;

    let neg = false;
    if (s[0] === "-" && s.length > 1 && !/\s/.test(s[1])) {
      neg = true;
      s = s.slice(1);
    }

    const fieldMatch = /^([a-z]+):\s*/i.exec(s);
    if (fieldMatch) {
      const fieldRaw = fieldMatch[1].toLowerCase();
      const mapped = DAILY_ENTRY_SEARCH_FIELD_ALIASES[fieldRaw];
      if (mapped) {
        s = s.slice(fieldMatch[0].length);
        let value = "";
        if (s[0] === '"') {
          const end = s.indexOf('"', 1);
          if (end === -1) {
            value = s.slice(1);
            s = "";
          } else {
            value = s.slice(1, end);
            s = s.slice(end + 1);
          }
        } else {
          const m = /^(\S+)/.exec(s);
          if (m) {
            value = m[1];
            s = s.slice(m[0].length);
          }
        }
        const v = value.trim().toLowerCase();
        if (v.length > 0) {
          clauses.push({ neg, field: mapped, value: v });
        }
        continue;
      }
    }

    if (s[0] === '"') {
      const end = s.indexOf('"', 1);
      let value: string;
      if (end === -1) {
        value = s.slice(1);
        s = "";
      } else {
        value = s.slice(1, end);
        s = s.slice(end + 1);
      }
      const v = value.trim().toLowerCase();
      if (v.length > 0) {
        clauses.push({ neg, field: null, value: v });
      }
      continue;
    }

    const wordMatch = /^(\S+)/.exec(s);
    if (wordMatch) {
      s = s.slice(wordMatch[0].length);
      const v = wordMatch[1].toLowerCase();
      if (v.length > 0) {
        clauses.push({ neg, field: null, value: v });
      }
    } else {
      break;
    }
  }
  return clauses;
}

function dailyEntryMatchesSearch(r: DailyEntryRow, clauses: DailyEntrySearchClause[]): boolean {
  if (clauses.length === 0) return true;
  const seg = buildDailyEntrySearchSegments(r);
  for (const c of clauses) {
    const hay = c.field ? seg[c.field] : seg.all;
    const hit = hay.includes(c.value);
    if ((c.neg && hit) || (!c.neg && !hit)) return false;
  }
  return true;
}

function amountFieldProps(
  enterKeyHint: "next" | "done",
): Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "step" | "min" | "autoComplete" | "enterKeyHint"
> {
  return {
    type: "number",
    inputMode: "decimal",
    step: "any",
    min: 0,
    autoComplete: "off",
    enterKeyHint: enterKeyHint,
  };
}

export function DailyEntryFormView({
  openDateKey = null,
  openStaffPayoutEmployeeId = null,
  onOpenDateKeyConsumed,
  onOpenStaffPayoutEmployeeIdConsumed,
}: {
  openDateKey?: string | null;
  openStaffPayoutEmployeeId?: string | null;
  onOpenDateKeyConsumed?: () => void;
  onOpenStaffPayoutEmployeeIdConsumed?: () => void;
} = {}) {
  const { userName } = useSession();
  const activeEmployees = useActiveEmployees();
  const staffSelectEmployees = useMemo(
    () => [...activeEmployees].sort((a, b) => a.name.localeCompare(b.name)),
    [activeEmployees],
  );
  const { map: entryMap, loading: entriesLoading, error: entriesLoadError, refresh: refreshEntries } =
    useDailyEntryMap();

  useEffect(() => {
    void loadEmployeeDirectory();
    void loadLedgerWorkspace();
  }, []);

  const [activeView, setActiveView] = useState<"entry" | "history">("history");
  const [savedListVersion, setSavedListVersion] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [dateKey, setDateKey] = useState(todayKey);
  const [dateFieldText, setDateFieldText] = useState(() => formatDateKeyAsDisplay(todayKey()));
  const [openingBalance, setOpeningBalance] = useState("0");
  const [cashSale, setCashSale] = useState("");
  const [bankSale, setBankSale] = useState("");
  const [bkashSale, setBkashSale] = useState("");
  const [nagadSale, setNagadSale] = useState("");
  const [pathaoSale, setPathaoSale] = useState("");
  const [foodiSale, setFoodiSale] = useState("");
  const [foodpandaSale, setFoodpandaSale] = useState("");
  const [voidSale, setVoidSale] = useState("");
  const [voidSaleRemarks, setVoidSaleRemarks] = useState("");
  const [voidSaleAttachmentUrls, setVoidSaleAttachmentUrls] = useState<string[]>([]);
  const [expenseLines, setExpenseLines] = useState<ExpenseLineDraft[]>(() => []);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [categoryModalLineId, setCategoryModalLineId] = useState<string | null>(null);
  const [categoryModalName, setCategoryModalName] = useState("");
  const [categoryModalBusy, setCategoryModalBusy] = useState(false);
  const [categoryModalError, setCategoryModalError] = useState<string | null>(null);
  const [bankWithdrawn, setBankWithdrawn] = useState("");
  const [formNotice, setFormNotice] = useState<FormNotice>({ kind: "none" });

  useEffect(() => {
    let alive = true;
    void listExpenseCategories()
      .then((rows) => {
        if (alive) setExpenseCategories(rows.filter((c) => c.active));
      })
      .catch(() => {
        if (alive) setExpenseCategories([]);
      });
    return () => {
      alive = false;
    };
  }, []);
  const [attachBusyLineId, setAttachBusyLineId] = useState<string | null>(null);
  const [openExpenseNoteLineIds, setOpenExpenseNoteLineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [voidAttachBusy, setVoidAttachBusy] = useState(false);
  const isAttachmentUploadBusy = attachBusyLineId !== null || voidAttachBusy;
  const [openingEdit, setOpeningEdit] = useState(false);
  const [openingEditWarningOpen, setOpeningEditWarningOpen] = useState(false);
  const [historyDetailRow, setHistoryDetailRow] = useState<DailyEntryRow | null>(null);
  const [historyReceiptsOpen, setHistoryReceiptsOpen] = useState(false);
  /** When set, receipts gallery shows only this expense line index; `null` = all lines with receipts. */
  const [historyReceiptsLineIndex, setHistoryReceiptsLineIndex] = useState<number | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [pendingDeleteDateIso, setPendingDeleteDateIso] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [pendingLockDateIso, setPendingLockDateIso] = useState<string | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const [isLocking, setIsLocking] = useState(false);
  const [pendingUnlockDateIso, setPendingUnlockDateIso] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<{
    proceed: () => void;
    cancel?: () => void;
  } | null>(null);
  const openingInputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);
  const deleteConfirmInputRef = useRef<HTMLInputElement>(null);
  const expenseLinesRef = useRef<ExpenseLineDraft[]>(expenseLines);
  expenseLinesRef.current = expenseLines;
  /** Vendors whose auto expense row was removed by the user — skip recreate until totals change. */
  const dismissedPurchaseExpenseVendorsRef = useRef<Set<string>>(new Set());
  const lastPurchaseVendorTotalsRef = useRef<Map<string, number>>(new Map());
  const voidSaleAttachmentUrlsRef = useRef<string[]>(voidSaleAttachmentUrls);
  voidSaleAttachmentUrlsRef.current = voidSaleAttachmentUrls;
  const pendingStaffPayoutEmployeeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!openDateKey || !/^\d{4}-\d{2}-\d{2}$/.test(openDateKey)) return;
    setDateKey(openDateKey);
    setDateFieldText(formatDateKeyAsDisplay(openDateKey));
    setActiveView("entry");
    if (openStaffPayoutEmployeeId?.trim()) {
      pendingStaffPayoutEmployeeIdRef.current = openStaffPayoutEmployeeId.trim();
    }
    onOpenDateKeyConsumed?.();
    onOpenStaffPayoutEmployeeIdConsumed?.();
  }, [
    openDateKey,
    openStaffPayoutEmployeeId,
    onOpenDateKeyConsumed,
    onOpenStaffPayoutEmployeeIdConsumed,
  ]);

  const historyRows = useMemo(
    () => listDailyEntriesDescendingFromMap(entryMap),
    [entryMap, savedListVersion, activeView],
  );

  const [entryListSearchQuery, setEntryListSearchQuery] = useState("");

  const parsedEntryListSearch = useMemo(
    () => parseDailyEntrySearchQuery(entryListSearchQuery),
    [entryListSearchQuery],
  );

  const filteredHistoryRows = useMemo(() => {
    const q = entryListSearchQuery.trim();
    if (!q) return historyRows;
    return historyRows.filter((r) => dailyEntryMatchesSearch(r, parsedEntryListSearch));
  }, [historyRows, entryListSearchQuery, parsedEntryListSearch]);

  useEffect(() => {
    if (historyRows.length === 0) setEntryListSearchQuery("");
  }, [historyRows.length]);

  const savedRowForDate = useMemo(
    () => entryMap[dateKey],
    [dateKey, entryMap, savedListVersion],
  );

  const isFormLocked = Boolean(savedRowForDate?.isLocked);

  const carriedOpening = useMemo(
    () => carriedOpeningBalanceForDate(entryMap, dateKey),
    [dateKey, entryMap, savedListVersion],
  );
  const carriedOpeningFromPrevDay = carriedOpening.opening;

  const ledgerBookNames = useSyncExternalStore(
    subscribeLedgerWorkspace,
    () => getLedgerBookNamesSnapshot("all"),
    () => getLedgerBookNamesSnapshot("all"),
  );

  const vendorOptions = useMemo(
    () => buildVendorOptions(expenseLines, ledgerBookNames),
    [expenseLines, ledgerBookNames],
  );

  const purchaseVendorOptions = useMemo(() => {
    // Vendor-purpose books only (purchases are bills against suppliers).
    const vendorBooks = getLedgerBookNamesSnapshot("vendor");
    const set = new Set(vendorBooks);
    for (const line of expenseLines) {
      if (line.kind !== "purchase") continue;
      const v = line.vendor.trim();
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [expenseLines, ledgerBookNames]);

  /** Suppliers that already have an item-purchase bill on this day. */
  const purchaseVendorsOnDay = useMemo(() => {
    const set = new Set<string>();
    for (const l of expenseLines) {
      if (l.kind !== "purchase") continue;
      for (const item of l.items) {
        const v = item.vendor.trim();
        if (v) set.add(v);
      }
    }
    return set;
  }, [expenseLines]);

  /**
   * Expenses list: purchase cards + cash lines. Hide auto "Paid now" vendor
   * rows when that supplier already has a purchase card (Paid now lives there).
   */
  const visibleExpenseLines = useMemo(
    () =>
      expenseLines.filter((l) => {
        if (l.kind === "purchase") return true;
        if (l.kind !== "vendor") return true;
        if (l.syncedFromPurchaseVendor) return false;
        const v = l.vendor.trim();
        return !v || !purchaseVendorsOnDay.has(v);
      }),
    [expenseLines, purchaseVendorsOnDay],
  );

  /** First vendor-payment line for each vendor name (the "paid" side of a purchase). */
  const vendorPaymentLineByVendor = useMemo(() => {
    const map = new Map<string, ExpenseLineDraft>();
    for (const l of expenseLines) {
      if (l.kind !== "vendor") continue;
      const v = l.vendor.trim();
      if (v && !map.has(v)) map.set(v, l);
    }
    return map;
  }, [expenseLines]);

  const expenseSum = useMemo(
    () => expenseLines.reduce((s, line) => s + draftLineCashAmount(line), 0),
    [expenseLines],
  );

  const bankWithdrawnAmt = useMemo(() => parseAmount(bankWithdrawn), [bankWithdrawn]);

  const bankNetBalance = useMemo(
    () => bankNetAfterWithdrawals(parseAmount(bankSale), bankWithdrawnAmt),
    [bankSale, bankWithdrawnAmt],
  );

  const channelSalesGross = useMemo(
    () =>
      parseAmount(cashSale) +
      parseAmount(bankSale) +
      parseAmount(bkashSale) +
      parseAmount(nagadSale) +
      parseAmount(pathaoSale) +
      parseAmount(foodiSale) +
      parseAmount(foodpandaSale),
    [cashSale, bankSale, bkashSale, nagadSale, pathaoSale, foodiSale, foodpandaSale],
  );

  const netSalesAfterVoid = useMemo(
    () =>
      roundTaka(channelSalesGross - Math.max(0, parseAmount(voidSale))),
    [channelSalesGross, voidSale],
  );

  const remaining = useMemo(
    () =>
      computeRemainingFromParts(
        openingBalance,
        {
          cashSale,
          bkashSale,
          nagadSale,
          pathaoSale,
          foodiSale,
          foodpandaSale,
          voidSale,
        },
        expenseLines,
      ),
    [
      openingBalance,
      cashSale,
      bkashSale,
      nagadSale,
      pathaoSale,
      foodiSale,
      foodpandaSale,
      voidSale,
      expenseLines,
    ],
  );

  const enteredByName = userName.trim() || "Unknown";

  const dailyEntryCandidate = useMemo(
    () =>
      buildDailyEntryCandidateFromForm({
        dateKey,
        openingBalance,
        cashSale,
        bankSale,
        bkashSale,
        nagadSale,
        pathaoSale,
        foodiSale,
        foodpandaSale,
        voidSale,
        voidSaleRemarks,
        voidSaleAttachmentUrls,
        expenseLines,
        bankWithdrawn,
        remaining,
        enteredBy: enteredByName,
      }),
    [
      dateKey,
      openingBalance,
      cashSale,
      bankSale,
      bkashSale,
      nagadSale,
      pathaoSale,
      foodiSale,
      foodpandaSale,
      voidSale,
      voidSaleRemarks,
      voidSaleAttachmentUrls,
      expenseLines,
      bankWithdrawn,
      remaining,
      enteredByName,
    ],
  );

  const formIsDirty = useMemo(
    () =>
      activeView === "entry" &&
      !isFormLocked &&
      isDailyEntryFormDirty({
        savedRow: savedRowForDate,
        carriedOpeningFromPrevDay,
        enteredBy: enteredByName,
        candidate: dailyEntryCandidate,
        expenseLines,
        voidSaleAttachmentUrls,
        attachmentUploadBusy: isAttachmentUploadBusy,
      }),
    [
      activeView,
      isFormLocked,
      savedRowForDate,
      carriedOpeningFromPrevDay,
      enteredByName,
      dailyEntryCandidate,
      expenseLines,
      voidSaleAttachmentUrls,
      isAttachmentUploadBusy,
    ],
  );

  const voidRemarksErr = salesFieldErrorMessage(formNotice, "voidRemarks");
  const voidAttachErr = salesFieldErrorMessage(formNotice, "voidAttach");
  const bankWithdrawnErr = salesFieldErrorMessage(formNotice, "bankWithdrawn");

  useEffect(() => {
    setDateFieldText(formatDateKeyAsDisplay(dateKey));
  }, [dateKey]);

  useEffect(() => {
    setOpeningEdit(false);
    const existing = entryMap[dateKey];
    if (existing) {
      setOpeningBalance(String(existing.openingBalance));
      setCashSale(amountFieldText(existing.cashSale));
      setBankSale(amountFieldText(existing.bankSale));
      setBkashSale(amountFieldText(existing.bkashSale));
      setNagadSale(amountFieldText(existing.nagadSale));
      setPathaoSale(amountFieldText(existing.pathaoSale));
      setFoodiSale(amountFieldText(existing.foodiSale));
      setFoodpandaSale(amountFieldText(existing.foodpandaSale));
      setVoidSale(amountFieldText(existing.voidSale));
      setVoidSaleRemarks(existing.voidSaleRemarks ?? "");
      setVoidSaleAttachmentUrls([...(existing.voidSaleAttachmentDataUrls ?? [])]);
      const loadedDrafts = draftsFromRow(existing);
      dismissedPurchaseExpenseVendorsRef.current = new Set();
      lastPurchaseVendorTotalsRef.current = purchaseVendorTotalsFromLines(loadedDrafts);
      setExpenseLines(loadedDrafts);
      setBankWithdrawn(amountFieldText(existing.bankWithdrawn));
      setFormNotice({ kind: "none" });
      return;
    }

    setOpeningBalance(String(carriedOpeningBalanceForDate(entryMap, dateKey).opening));
    setCashSale("");
    setBankSale("");
    setBkashSale("");
    setNagadSale("");
    setPathaoSale("");
    setFoodiSale("");
    setFoodpandaSale("");
    setVoidSale("");
    setVoidSaleRemarks("");
    setVoidSaleAttachmentUrls([]);
    dismissedPurchaseExpenseVendorsRef.current = new Set();
    lastPurchaseVendorTotalsRef.current = new Map();
    setExpenseLines([]);
    setBankWithdrawn("");
    setFormNotice({ kind: "none" });
  }, [dateKey, entryMap, savedListVersion]);

  useEffect(() => {
    const employeeId = pendingStaffPayoutEmployeeIdRef.current;
    if (!employeeId || activeView !== "entry") return;
    // Wait for the roster so the employee select can show the name.
    const dirState = getEmployeeDirectoryLoadState();
    if (
      (dirState.loading || !dirState.loaded) &&
      staffSelectEmployees.length === 0 &&
      !getEmployeeById(employeeId)
    ) {
      return;
    }
    pendingStaffPayoutEmployeeIdRef.current = null;
    setExpenseLines((lines) => {
      if (
        lines.some(
          (line) =>
            line.kind === "staff" && line.employeeId === employeeId && line.amount.trim() === "",
        )
      ) {
        return lines;
      }
      return [...lines, { ...newStaffExpenseLine(), employeeId }];
    });
  }, [dateKey, entryMap, savedListVersion, activeView, staffSelectEmployees]);

  useEffect(() => {
    if (openingEdit) openingInputRef.current?.focus();
  }, [openingEdit]);

  useEffect(() => {
    if (formNotice.kind === "none") return;
    const ms =
      formNotice.kind === "field" || formNotice.kind === "salesField"
        ? 5200
        : formNotice.kind === "globalError"
          ? 8000
          : 2800;
    const timer = window.setTimeout(() => setFormNotice({ kind: "none" }), ms);
    return () => window.clearTimeout(timer);
  }, [formNotice]);

  useLayoutEffect(() => {
    if (formNotice.kind !== "field" && formNotice.kind !== "salesField") return;
    const sel =
      formNotice.kind === "field"
        ? `[data-field-error-anchor="${formNotice.lineId}:${formNotice.part}"]`
        : `[data-field-error-anchor="void:${formNotice.part}"]`;
    document.querySelector(sel)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [formNotice]);

  useEffect(() => {
    if (
      !pendingLeave &&
      !pendingDeleteDateIso &&
      !pendingLockDateIso &&
      !pendingUnlockDateIso &&
      !openingEditWarningOpen &&
      !historyDetailRow &&
      !receiptPreviewUrl &&
      !historyReceiptsOpen
    ) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pendingLeave) {
        pendingLeave.cancel?.();
        setPendingLeave(null);
        return;
      }
      if (receiptPreviewUrl) {
        setReceiptPreviewUrl(null);
        return;
      }
      if (historyReceiptsOpen) {
        setHistoryReceiptsOpen(false);
        setHistoryReceiptsLineIndex(null);
        return;
      }
      if (openingEditWarningOpen) {
        setOpeningEditWarningOpen(false);
        return;
      }
      if (pendingUnlockDateIso) {
        setPendingUnlockDateIso(null);
        setUnlockError(null);
        return;
      }
      if (pendingLockDateIso) {
        setPendingLockDateIso(null);
        setLockError(null);
        return;
      }
      if (pendingDeleteDateIso) {
        setPendingDeleteDateIso(null);
        setDeleteConfirmText("");
        return;
      }
      if (historyDetailRow) setHistoryDetailRow(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyDetailRow, receiptPreviewUrl, historyReceiptsOpen, pendingDeleteDateIso, pendingLockDateIso, pendingUnlockDateIso, openingEditWarningOpen, pendingLeave]);

  function requestOpeningBalanceEdit() {
    if (isFormLocked || openingEdit) return;
    setOpeningEditWarningOpen(true);
  }

  function confirmOpeningBalanceEdit() {
    setOpeningEditWarningOpen(false);
    setOpeningEdit(true);
  }

  function cancelOpeningBalanceEditWarning() {
    setOpeningEditWarningOpen(false);
  }

  useEffect(() => {
    if (!pendingDeleteDateIso) return;
    deleteConfirmInputRef.current?.focus();
  }, [pendingDeleteDateIso]);

  useEffect(() => {
    setHistoryReceiptsOpen(false);
    setHistoryReceiptsLineIndex(null);
  }, [historyDetailRow]);

  useEffect(() => {
    if (activeView !== "entry") {
      setDailyEntryNavGuard(null);
      return;
    }
    setDailyEntryNavGuard({
      isEditing: true,
      hasUnsavedChanges: formIsDirty,
      requestLeaveConfirmation: (proceed, cancel) => {
        setPendingLeave({ proceed, cancel });
      },
    });
    return () => setDailyEntryNavGuard(null);
  }, [activeView, formIsDirty]);

  useEffect(() => {
    if (activeView !== "entry" || !formIsDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [activeView, formIsDirty]);

  function requestLeaveIfNeeded(proceed: () => void, cancel?: () => void) {
    if (activeView !== "entry" || !formIsDirty) {
      proceed();
      return;
    }
    setPendingLeave({ proceed, cancel });
  }

  function confirmDiscardLeave() {
    const action = pendingLeave;
    purgeUnsavedAttachmentRefs(
      savedRowForDate,
      expenseLinesRef.current,
      voidSaleAttachmentUrlsRef.current,
    );
    setPendingLeave(null);
    action?.proceed();
  }

  function cancelDiscardLeave() {
    pendingLeave?.cancel?.();
    setPendingLeave(null);
  }

  // TEMP: Alt+X (Windows/Linux) or ⌥+X Option+X (Mac) — random fields for quick Save testing; remove when done.
  useEffect(() => {
    const rnd = () => String(Math.floor(Math.random() * 40_000) + 500);
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.key.toLowerCase() !== "x") return;
      if (activeView !== "entry") return;
      e.preventDefault();
      setOpeningEdit(false);
      setOpeningBalance(rnd());
      setCashSale(rnd());
      setBankSale(rnd());
      setBkashSale(rnd());
      setNagadSale(rnd());
      setPathaoSale(rnd());
      setFoodiSale(rnd());
      setFoodpandaSale(rnd());
      const ledgerSample = getLedgerBookNamesSnapshot("all")[0] ?? "Cashbook";
      setExpenseLines([
        { ...newVendorExpenseLine(), vendor: ledgerSample, amount: rnd() },
        {
          ...newRegularExpenseLine(),
          label: "Test misc",
          amount: rnd(),
          note: "Sample regular note",
        },
      ]);
      setFormNotice({ kind: "global", message: "Alt/⌥+X test fill" });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeView]);

  function applyPurchaseVendorExpenseSync(
    lines: ExpenseLineDraft[],
  ): ExpenseLineDraft[] {
    const totals = purchaseVendorTotalsFromLines(lines);
    const prev = lastPurchaseVendorTotalsRef.current;
    for (const [vendor, total] of totals) {
      if (prev.get(vendor) !== total) {
        dismissedPurchaseExpenseVendorsRef.current.delete(vendor);
      }
    }
    for (const vendor of prev.keys()) {
      if (!totals.has(vendor)) {
        dismissedPurchaseExpenseVendorsRef.current.delete(vendor);
      }
    }
    lastPurchaseVendorTotalsRef.current = totals;
    return syncVendorExpensesFromPurchases(
      lines,
      dismissedPurchaseExpenseVendorsRef.current,
    );
  }

  function patchLine(
    id: string,
    patch: Partial<
      Pick<
        ExpenseLineDraft,
        | "vendor"
        | "amount"
        | "paidAmount"
        | "expenseCategoryId"
        | "label"
        | "note"
        | "receiptDataUrls"
        | "vendorReceipts"
        | "vendorNotes"
        | "ledgerKind"
        | "ledgerEmployeeLineKind"
        | "ledgerNote"
        | "employeeId"
        | "staffLineKind"
        | "salaryPaymentId"
        | "items"
      >
    >,
  ) {
    let nextPatch = patch;
    if (typeof patch.amount === "string") {
      nextPatch = {
        ...nextPatch,
        amount: sanitizeNonNegativeDecimalInput(patch.amount),
      };
    }
    if (typeof patch.paidAmount === "string") {
      nextPatch = {
        ...nextPatch,
        paidAmount: sanitizeNonNegativeDecimalInput(patch.paidAmount),
      };
    }
    setFormNotice((n) => {
      if (n.kind !== "field" || n.lineId !== id) return n;
      if ("vendor" in nextPatch && n.part === "vendor") return { kind: "none" };
      if ("amount" in nextPatch && n.part === "amount") return { kind: "none" };
      if ("label" in nextPatch && n.part === "label") return { kind: "none" };
      if ("note" in nextPatch && n.part === "note") return { kind: "none" };
      if (
        ("receiptDataUrls" in nextPatch || "vendorReceipts" in nextPatch) &&
        n.part === "attach"
      ) {
        return { kind: "none" };
      }
      if ("ledgerKind" in nextPatch && n.part === "ledgerKind") return { kind: "none" };
      if ("ledgerEmployeeLineKind" in nextPatch && n.part === "ledgerKind") return { kind: "none" };
      if ("employeeId" in nextPatch && n.part === "employeeId") return { kind: "none" };
      if ("ledgerNote" in nextPatch && n.part === "ledgerNote") return { kind: "none" };
      if ("vendorNotes" in nextPatch && n.part === "ledgerNote") return { kind: "none" };
      if ("items" in nextPatch && n.part === "amount") return { kind: "none" };
      return n;
    });
    setExpenseLines((lines) => {
      const updated = lines.map((line) => {
        if (line.id !== id) return line;
        const next: ExpenseLineDraft = { ...line, ...nextPatch };
        if (
          line.kind === "vendor" &&
          line.syncedFromPurchaseVendor &&
          (("amount" in nextPatch && nextPatch.amount !== line.amount) ||
            ("vendor" in nextPatch && nextPatch.vendor !== line.vendor))
        ) {
          const syncedVendor = line.syncedFromPurchaseVendor;
          dismissedPurchaseExpenseVendorsRef.current.add(syncedVendor);
          delete next.syncedFromPurchaseVendor;
        }
        return next;
      });
      if ("items" in nextPatch) {
        return applyPurchaseVendorExpenseSync(updated);
      }
      return updated;
    });
  }

  function patchPurchaseItem(
    lineId: string,
    itemKey: string,
    patch: Partial<PurchaseItemDraft>,
  ) {
    setFormNotice((n) => {
      if (n.kind !== "field" || n.lineId !== lineId) return n;
      if (n.part === "amount" || n.part === "vendor") return { kind: "none" };
      return n;
    });
    setExpenseLines((lines) => {
      const updated = lines.map((line) => {
        if (line.id !== lineId || line.kind !== "purchase") return line;
        return {
          ...line,
          items: line.items.map((item) => {
            if (item.key !== itemKey) return item;
            const next = { ...item, ...patch };
            if (typeof patch.qty === "string") {
              next.qty = sanitizeNonNegativeDecimalInput(patch.qty);
            }
            if (typeof patch.rate === "string") {
              next.rate = sanitizeNonNegativeDecimalInput(patch.rate);
              next.lastEdited = "rate";
            }
            if (typeof patch.total === "string") {
              next.total = sanitizeNonNegativeDecimalInput(patch.total);
              next.lastEdited = "total";
            }
            return recomputePurchaseItem(next, patch);
          }),
        };
      });
      return applyPurchaseVendorExpenseSync(updated);
    });
  }

  async function attachReceiptFilesToExpenseLine(
    lineId: string,
    picked: readonly File[],
    purchaseVendor?: string,
  ) {
    if (picked.length === 0) return;
    const line = expenseLinesRef.current.find((l) => l.id === lineId);
    if (!line) return;
    const vendorKey = purchaseVendor?.trim() ?? "";
    const useVendorBucket = line.kind === "purchase" && vendorKey.length > 0;
    if (line.kind === "purchase" && !useVendorBucket) {
      setFormNotice({
        kind: "field",
        message: "Select a supplier before attaching a receipt.",
        lineId,
        part: "vendor",
      });
      return;
    }
    const urls = useVendorBucket
      ? purchaseVendorReceiptUrls(line, vendorKey)
      : line.receiptDataUrls;
    const busyKey = useVendorBucket ? `${lineId}::${vendorKey}` : lineId;

    if (!readValidAccessToken()) {
      setFormNotice({
        kind: "globalError",
        message: "Sign in to attach files (storage requires an active session).",
      });
      return;
    }
    const slice = picked;
    for (const file of slice) {
      if (!isReceiptAttachmentFile(file)) {
        setFormNotice({
          kind: "globalError",
          message: "Only images or PDF files can be attached.",
        });
        return;
      }
      const blocked = attachmentUploadBlockedMessage(file);
      if (blocked) {
        setFormNotice({ kind: "globalError", message: blocked });
        return;
      }
    }

    const previewUrls = slice.map((f) => URL.createObjectURL(f));
    let current = [...urls, ...previewUrls];
    const applyUrls = (nextUrls: string[]) => {
      if (useVendorBucket) {
        patchLine(lineId, {
          vendorReceipts: {
            ...(expenseLinesRef.current.find((l) => l.id === lineId)?.vendorReceipts ??
              line.vendorReceipts),
            [vendorKey]: nextUrls,
          },
          receiptDataUrls: [],
        });
      } else {
        patchLine(lineId, { receiptDataUrls: nextUrls });
      }
    };
    applyUrls(current);
    setAttachBusyLineId(busyKey);
    try {
      for (let i = 0; i < slice.length; i++) {
        const file = slice[i];
        const preview = previewUrls[i];
        try {
          const ref = await uploadFileToStorage(file, "receipts", file.name);
          current = current.map((u) => (u === preview ? ref : u));
          applyUrls(current);
        } catch (err) {
          URL.revokeObjectURL(preview);
          current = current.filter((u) => u !== preview);
          applyUrls(current);
          setFormNotice({
            kind: "globalError",
            message:
              err instanceof Error ? err.message : "Could not upload attachment.",
          });
          return;
        }
        requestAnimationFrame(() => URL.revokeObjectURL(preview));
      }
      setFormNotice((n) => (n.kind === "globalError" ? { kind: "none" } : n));
    } finally {
      setAttachBusyLineId(null);
    }
  }

  useEffect(() => {
    if (activeView !== "entry") return;
    const onPaste = (e: ClipboardEvent) => {
      const files = clipboardAttachmentFilesFromDataTransfer(e.clipboardData);
      if (files.length === 0) return;
      const voidRoot =
        (e.target as HTMLElement | null)?.closest?.("[data-void-attachment-anchor]") ??
        document.activeElement?.closest?.("[data-void-attachment-anchor]");
      if (voidRoot) {
        e.preventDefault();
        void (async () => {
          setVoidAttachBusy(true);
          try {
            const result = await mergeVoidAttachmentDataUrls(
              voidSaleAttachmentUrlsRef.current,
              files,
            );
            if (result.ok) {
              setFormNotice((n) =>
                n.kind === "salesField" ? { kind: "none" } : n,
              );
              setVoidSaleAttachmentUrls(result.urls);
            } else {
              setFormNotice({
                kind: "salesField",
                message: result.message,
                part: "voidAttach",
              });
            }
          } finally {
            setVoidAttachBusy(false);
          }
        })();
        return;
      }
      const lineId = expenseLineIdFromPasteEvent(e);
      if (!lineId) return;
      const line = expenseLinesRef.current.find((l) => l.id === lineId);
      if (!line) return;
      e.preventDefault();
      const purchaseVendor =
        line.kind === "purchase"
          ? purchaseVendorFromEventTarget(e.target) ??
            purchaseVendorFromEventTarget(document.activeElement)
          : null;
      void attachReceiptFilesToExpenseLine(
        lineId,
        files,
        purchaseVendor ?? undefined,
      );
    };
    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
  }, [activeView]);

  function addStaffExpenseLine() {
    setExpenseLines((lines) => [...lines, newStaffExpenseLine()]);
  }

  function addVendorExpenseLine() {
    setExpenseLines((lines) => [...lines, newVendorExpenseLine()]);
  }

  function addRegularExpenseLine() {
    setExpenseLines((lines) => [...lines, newRegularExpenseLine()]);
  }

  function addPurchaseExpenseLine() {
    setExpenseLines((lines) => [...lines, newPurchaseExpenseLine()]);
  }

  /**
   * Inline "Paid now" on a purchase card: set how much was paid to `vendor`
   * right now. Routes to the vendor's payment line (the cash-out side). Editing
   * an auto-synced line detaches it (see patchLine) so a partial amount sticks.
   */
  function setPurchaseVendorPaid(vendor: string, value: string) {
    const v = vendor.trim();
    if (!v) return;
    const existing = expenseLinesRef.current.find(
      (l) => l.kind === "vendor" && l.vendor.trim() === v,
    );
    if (existing) {
      patchLine(existing.id, { amount: value });
      return;
    }
    dismissedPurchaseExpenseVendorsRef.current.delete(v);
    setExpenseLines((lines) => [
      ...lines,
      { ...newVendorExpenseLine(), vendor: v, amount: value },
    ]);
  }

  function removeExpenseLine(id: string) {
    setFormNotice((n) =>
      n.kind === "field" && n.lineId === id ? { kind: "none" } : n,
    );
    setExpenseLines((lines) => {
      const removed = lines.find((l) => l.id === id);
      const filtered = lines.filter((l) => l.id !== id);
      if (removed?.kind === "purchase") {
        return applyPurchaseVendorExpenseSync(filtered);
      }
      if (removed?.syncedFromPurchaseVendor) {
        dismissedPurchaseExpenseVendorsRef.current.add(removed.syncedFromPurchaseVendor);
      }
      return filtered;
    });
  }

  function clearSalesFieldNotice() {
    setFormNotice((n) => (n.kind === "salesField" ? { kind: "none" } : n));
  }

  function toggleExpenseNoteLine(lineId: string) {
    setOpenExpenseNoteLineIds((prev) => {
      const next = new Set(prev);
      const willOpen = !next.has(lineId);
      if (willOpen) {
        next.add(lineId);
        requestAnimationFrame(() => {
          document.getElementById(`expense-note-${lineId}`)?.focus();
        });
      } else {
        next.delete(lineId);
      }
      return next;
    });
  }

  function purchaseVendorNoteKey(lineId: string, vendor: string): string {
    return `${lineId}::${vendor}`;
  }

  function togglePurchaseVendorNote(lineId: string, vendor: string) {
    const key = purchaseVendorNoteKey(lineId, vendor);
    setOpenExpenseNoteLineIds((prev) => {
      const next = new Set(prev);
      const willOpen = !next.has(key);
      if (willOpen) {
        next.add(key);
        requestAnimationFrame(() => {
          document.getElementById(`purchase-note-${lineId}-${vendor}`)?.focus();
        });
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function renderExpenseNoteToggle(line: ExpenseLineDraft) {
    const noteText =
      line.kind === "vendor" || line.kind === "purchase" ? line.ledgerNote : line.note;
    const hasNote = noteText.trim().length > 0;
    const noteOpen = openExpenseNoteLineIds.has(line.id);
    return (
      <button
        type="button"
        onClick={() => toggleExpenseNoteLine(line.id)}
        className={`${expenseIconBtnClass} ${hasNote || noteOpen ? expenseNoteBtnActiveClass : ""}`}
        aria-label={noteOpen ? "Hide note" : hasNote ? "Edit note" : "Add note"}
        aria-expanded={noteOpen}
        title={noteOpen ? "Hide note" : hasNote ? "Edit note" : "Add note"}
      >
        <StickyNote className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
      </button>
    );
  }

  function renderPurchaseVendorNoteToggle(
    line: ExpenseLineDraft,
    vendor: string,
    options?: { disabled?: boolean },
  ) {
    const noteText = (line.vendorNotes?.[vendor] ?? "").trim();
    const key = purchaseVendorNoteKey(line.id, vendor);
    const noteOpen = openExpenseNoteLineIds.has(key);
    const disabled = Boolean(options?.disabled);
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          togglePurchaseVendorNote(line.id, vendor);
        }}
        className={`${expenseIconBtnClass} ${noteText || noteOpen ? expenseNoteBtnActiveClass : ""} ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        }`}
        aria-label={
          disabled
            ? "Select a supplier before adding a note"
            : noteOpen
              ? "Hide note"
              : noteText
                ? "Edit note"
                : "Add note"
        }
        aria-expanded={noteOpen}
        title={
          disabled
            ? "Select a supplier before adding a note"
            : noteOpen
              ? "Hide note"
              : noteText
                ? "Edit note"
                : "Add note"
        }
      >
        <StickyNote className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
      </button>
    );
  }

  function removePurchaseItem(lineId: string, itemKey: string) {
    setFormNotice((n) =>
      n.kind === "field" && n.lineId === lineId ? { kind: "none" } : n,
    );
    const line = expenseLinesRef.current.find((l) => l.id === lineId);
    if (!line || line.kind !== "purchase") return;
    const removed = line.items.find((i) => i.key === itemKey);
    const vendor = removed?.vendor.trim() ?? "";
    const remaining = line.items.filter((i) => i.key !== itemKey);
    const vendorStillUsed = remaining.some((i) => i.vendor.trim() === vendor);
    if (vendor && !vendorStillUsed) {
      setOpenExpenseNoteLineIds((prev) => {
        const next = new Set(prev);
        next.delete(purchaseVendorNoteKey(lineId, vendor));
        return next;
      });
    }
    setExpenseLines((lines) => {
      const updated = lines.flatMap((l) => {
        if (l.id !== lineId || l.kind !== "purchase") return [l];
        const nextItems = l.items.filter((i) => i.key !== itemKey);
        if (nextItems.length === 0) return [];
        const removedVendor =
          l.items.find((i) => i.key === itemKey)?.vendor.trim() ?? "";
        const stillUsed = nextItems.some((i) => i.vendor.trim() === removedVendor);
        if (!removedVendor || stillUsed) {
          return [{ ...l, items: nextItems }];
        }
        const nextReceipts = { ...(l.vendorReceipts ?? {}) };
        const nextNotes = { ...(l.vendorNotes ?? {}) };
        delete nextReceipts[removedVendor];
        delete nextNotes[removedVendor];
        return [
          {
            ...l,
            items: nextItems,
            vendorReceipts: nextReceipts,
            vendorNotes: nextNotes,
          },
        ];
      });
      return applyPurchaseVendorExpenseSync(updated);
    });
  }

  function removePurchaseVendorGroup(lineId: string, vendor: string) {
    setFormNotice((n) =>
      n.kind === "field" && n.lineId === lineId ? { kind: "none" } : n,
    );
    setOpenExpenseNoteLineIds((prev) => {
      const next = new Set(prev);
      next.delete(purchaseVendorNoteKey(lineId, vendor));
      return next;
    });
    setExpenseLines((lines) => {
      const updated = lines.flatMap((line) => {
        if (line.id !== lineId || line.kind !== "purchase") return [line];
        const remaining = line.items.filter((i) => i.vendor.trim() !== vendor);
        if (remaining.length === 0) return [];
        const nextReceipts = { ...line.vendorReceipts };
        const nextNotes = { ...line.vendorNotes };
        delete nextReceipts[vendor];
        delete nextNotes[vendor];
        return [
          {
            ...line,
            items: remaining,
            vendorReceipts: nextReceipts,
            vendorNotes: nextNotes,
          },
        ];
      });
      return applyPurchaseVendorExpenseSync(updated);
    });
  }

  /** Add / attach receipt control — kept compact to sit on the same row as vendor, amount, and delete. */
  function renderReceiptAddControl(
    line: ExpenseLineDraft,
    options?: { purchaseVendor?: string; disabled?: boolean },
  ) {
    const purchaseVendor = options?.purchaseVendor?.trim() ?? "";
    const forPurchaseVendor = line.kind === "purchase" && purchaseVendor.length > 0;
    const btnSizeClass = "size-8 rounded-[7px]";
    const inputId = forPurchaseVendor
      ? `daily-expense-receipt-${line.id}-${purchaseVendor}`
      : `daily-expense-receipt-${line.id}`;
    const attachErr = fieldErrorMessage(formNotice, line.id, "attach");
    const busyKey = forPurchaseVendor ? `${line.id}::${purchaseVendor}` : line.id;
    const busy = attachBusyLineId === busyKey;
    const attachCount = forPurchaseVendor
      ? purchaseVendorReceiptUrls(line, purchaseVendor).length
      : line.receiptDataUrls.length;
    const disabled = Boolean(options?.disabled) || busy;
    return (
      <div className="flex shrink-0 flex-col items-center gap-0.5">
      <div
        className={`relative flex shrink-0 items-center justify-center ${btnSizeClass} ${attachErr ? FIELD_ERR_ATTACH_WRAP : ""}`}
      >
        <input
          id={inputId}
          type="file"
          accept={RECEIPT_FILE_ACCEPT}
          multiple
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const picked = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            void attachReceiptFilesToExpenseLine(
              line.id,
              picked,
              forPurchaseVendor ? purchaseVendor : undefined,
            );
          }}
        />
        <label
          htmlFor={disabled ? undefined : inputId}
          className={`relative inline-flex shrink-0 items-center justify-center border border-solid transition-colors ${btnSizeClass} ${
            disabled
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:bg-[var(--pos-nav-hover)]/30"
          } ${
            attachErr
              ? "border-red-500/70 text-red-700"
              : "border-[var(--pos-divider)] text-[var(--pos-text-2)] hover:border-[var(--pos-sb-base)] hover:text-[var(--pos-text-1)]"
          }`}
          aria-label={
            options?.disabled
              ? "Select a supplier before attaching"
              : attachCount > 0
                ? `Attach receipt image or PDF (${attachCount} attached)`
                : "Attach receipt image or PDF"
          }
          title={
            options?.disabled
              ? "Select a supplier before attaching"
              : attachErr ??
                (attachCount > 0
                  ? `${attachCount} attachment${attachCount === 1 ? "" : "s"} — add more, or paste (Ctrl+V / ⌘V) while this row is focused`
                  : "Attach image or PDF, or paste an image (Ctrl+V / ⌘V) while this row is focused")
          }
        >
          <Paperclip className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
          <AttachmentCountBadge count={attachCount} />
        </label>
      </div>
      {busy ? (
        <span className="text-[9px] leading-tight text-[var(--pos-text-2)]">Uploading…</span>
      ) : attachErr ? (
        <span
          role="alert"
          className="max-w-[5.5rem] text-center text-[9px] leading-tight text-red-700"
        >
          {attachErr}
        </span>
      ) : null}
      </div>
    );
  }

  function renderReceiptThumbnails(
    line: ExpenseLineDraft,
    options?: { purchaseVendor?: string },
  ) {
    const purchaseVendor = options?.purchaseVendor?.trim() ?? "";
    const forPurchaseVendor = line.kind === "purchase" && purchaseVendor.length > 0;
    const urls = forPurchaseVendor
      ? purchaseVendorReceiptUrls(line, purchaseVendor)
      : line.receiptDataUrls;
    if (urls.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1 border-t border-solid [border-color:var(--pos-divider)] pt-1">
        {urls.map((url, idx) => (
          <div key={`${line.id}-${purchaseVendor || "r"}-${idx}`} className="relative inline-flex">
            <button
              type="button"
              className="block overflow-hidden rounded-[6px] border border-solid [border-color:var(--pos-divider)] ring-offset-1 hover:ring-2 hover:ring-[var(--pos-sb-base)]/50"
              onClick={() => setReceiptPreviewUrl(url)}
              aria-label={
                isPdfMediaRef(url) ? `View PDF ${idx + 1}` : `View receipt ${idx + 1}`
              }
            >
              {isPdfMediaRef(url) ? (
                <span className="flex size-11 flex-col items-center justify-center gap-0.5 bg-[var(--pos-page)] text-[var(--pos-text-2)]">
                  <FileText className="size-5 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="text-[8px] font-semibold uppercase">PDF</span>
                </span>
              ) : (
                <MediaThumb
                  mediaRef={url}
                  alt={`Receipt ${idx + 1}`}
                  className="size-11 object-cover"
                />
              )}
            </button>
            <button
              type="button"
              className="absolute -right-0.5 -top-0.5 z-[1] flex size-4 items-center justify-center rounded-full border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] text-[10px] leading-none text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]"
              aria-label="Remove attachment"
              onClick={(e) => {
                e.stopPropagation();
                const removed = urls[idx];
                const nextUrls = urls.filter((_, j) => j !== idx);
                if (forPurchaseVendor) {
                  patchLine(line.id, {
                    vendorReceipts: {
                      ...line.vendorReceipts,
                      [purchaseVendor]: nextUrls,
                    },
                    receiptDataUrls: [],
                  });
                } else {
                  patchLine(line.id, { receiptDataUrls: nextUrls });
                }
                purgeAttachmentRefIfUnsaved(savedRowForDate, removed);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
  }

  function renderVoidAttachmentAddControl() {
    const urls = voidSaleAttachmentUrls;
    const attachCount = urls.length;
    const inputId = "daily-void-attachments";
    return (
      <div
        className={`relative flex size-9 shrink-0 items-center justify-center ${voidAttachErr ? FIELD_ERR_ATTACH_WRAP : ""}`}
        data-field-error-anchor="void:voidAttach"
      >
        <input
          id={inputId}
          type="file"
          accept={RECEIPT_FILE_ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            const picked = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (picked.length === 0) return;
            void (async () => {
              setVoidAttachBusy(true);
              try {
                const result = await mergeVoidAttachmentDataUrls(urls, picked);
                if (result.ok) {
                  clearSalesFieldNotice();
                  setVoidSaleAttachmentUrls(result.urls);
                } else {
                  setFormNotice({
                    kind: "salesField",
                    message: result.message,
                    part: "voidAttach",
                  });
                }
              } finally {
                setVoidAttachBusy(false);
              }
            })();
          }}
        />
        <label
          htmlFor={inputId}
          className="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] text-[var(--pos-text-2)] transition-colors hover:border-[var(--pos-sb-base)] hover:bg-[var(--pos-nav-hover)]/30 hover:text-[var(--pos-text-1)]"
          aria-label={
            attachCount > 0
              ? `Attach PDF or image for void sales (${attachCount} attached)`
              : "Attach PDF or image for void sales"
          }
          title={
            attachCount > 0
              ? `${attachCount} attachment${attachCount === 1 ? "" : "s"} — add more, or paste while this block is focused`
              : "Attach PDF or image, or paste an image while this section is focused"
          }
        >
          <Paperclip className="size-4 shrink-0" strokeWidth={2.25} />
          <AttachmentCountBadge count={attachCount} />
        </label>
      </div>
    );
  }

  function renderVoidAttachmentThumbnails() {
    const urls = voidSaleAttachmentUrls;
    if (urls.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1 border-t border-solid [border-color:var(--pos-divider)] pt-1.5">
        {urls.map((url, idx) => (
          <div key={`void-r-${idx}`} className="relative inline-flex">
            <button
              type="button"
              className="block overflow-hidden rounded-[6px] border border-solid [border-color:var(--pos-divider)] ring-offset-1 hover:ring-2 hover:ring-[var(--pos-sb-base)]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pos-sb-base)]"
              onClick={() => setReceiptPreviewUrl(url)}
              aria-label={isPdfMediaRef(url) ? `View PDF ${idx + 1}` : `View attachment ${idx + 1}`}
            >
              {isPdfMediaRef(url) ? (
                <span className="flex size-11 flex-col items-center justify-center gap-0.5 bg-[var(--pos-page)] text-[var(--pos-text-2)]">
                  <FileText className="size-5 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="text-[8px] font-semibold uppercase">PDF</span>
                </span>
              ) : (
                <MediaThumb
                  mediaRef={url}
                  alt={`Void attachment ${idx + 1}`}
                  className="size-11 object-cover"
                />
              )}
            </button>
            <button
              type="button"
              className="absolute -right-0.5 -top-0.5 z-[1] flex size-4 items-center justify-center rounded-full border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] text-[10px] leading-none text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]"
              aria-label="Remove attachment"
              onClick={(e) => {
                e.stopPropagation();
                clearSalesFieldNotice();
                const removed = urls[idx];
                setVoidSaleAttachmentUrls(urls.filter((_, j) => j !== idx));
                purgeAttachmentRefIfUnsaved(savedRowForDate, removed);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
  }

  async function handleSave() {
    if (isSaving || isFormLocked || isAttachmentUploadBusy) return;

    try {
      await Promise.all([loadEmployeeDirectory(), loadSalaryWorkspace()]);
      syncLoadedSalaryBundleToEmployees();
      const validation = findFirstExpenseValidationError(expenseLines, {
        dateKey,
        salaryBundle: getSalaryBundle(),
      });
      if (validation) {
        setFormNotice({
          kind: "field",
          message: validation.message,
          lineId: validation.lineId,
          part: validation.part,
        });
        return;
      }

      const voidAmtParsed = Math.max(0, parseAmount(voidSale));
      const voidRemarksTrim = voidSaleRemarks.trim();
      if (voidAmtParsed > 0 && !voidRemarksTrim) {
        setFormNotice({
          kind: "salesField",
          message: "Remarks are required when void sales is greater than zero.",
          part: "voidRemarks",
        });
        return;
      }

      const voidAttachmentsToSave = dailyEntryCandidate.voidSaleAttachmentDataUrls;
      const linesToSave = buildExpenseLinesToSaveFromDrafts(expenseLines);
      const expenseTotal = expenseTotalFromExpenseLines(linesToSave);
      const bankWithdrawnToSave = dailyEntryCandidate.bankWithdrawn ?? 0;

      const prior = entryMap[dateKey];
      const nextCandidate: DailyEntryRow = {
        ...dailyEntryCandidate,
        voidSaleAttachmentDataUrls: voidAttachmentsToSave,
        expenses: expenseTotal,
        bankWithdrawn: bankWithdrawnToSave,
        expenseLines: linesToSave,
        enteredBy: enteredByName,
      };

      if (prior && savedEntryBodyEquals(prior, nextCandidate)) {
        setFormNotice({
          kind: "global",
          message:
            "Nothing changed — this day already has that entry. Edit the form to update it, or choose another date.",
        });
        return;
      }

      const { lines: syncedExpenseLines, failed: ledgerPostFailed } =
        syncDailyExpenseLedgerLinks({
          prior,
          baseLines: linesToSave,
          expenseLines,
          dateKey,
        });

      // I3: derive the salary bundle in memory but do NOT persist it on its own —
      // it rides along in the single atomic commit below.
      const staffSync = await syncStaffExpensesToSalaryRegister({
        dateKey,
        nextLines: syncedExpenseLines,
        priorLines: prior?.expenseLines,
        persist: false,
      });
      if (!staffSync.ok) {
        setFormNotice({ kind: "globalError", message: staffSync.message });
        return;
      }

      const next: DailyEntryRow = {
        ...nextCandidate,
        expenseLines: staffSync.lines,
        expenses: expenseTotalFromExpenseLines(staffSync.lines),
      };

      setIsSaving(true);
      try {
        // I3 — atomic cross-module save. The daily entry, the derived ledger
        // workspace (mutated in-memory by syncDailyExpenseLedgerLinks), and the
        // salary bundle commit together in ONE server transaction, so a failure
        // in any leg rolls back all of them instead of orphaning data. Suppress
        // the stores' own debounced PUTs so they can't race or double-write.
        const ledgerWs = getWorkspace();
        cancelLedgerWorkspacePersist();
        cancelSalaryWorkspacePersist();

        const result = await commitDailyEntry(
          next,
          {
            suppliers: ledgerWs.suppliers,
            moves: ledgerWs.moves,
            ledger: ledgerWs.ledger,
          },
          {
            selectedMonthKey: staffSync.bundle.selectedMonthKey,
            months: staffSync.bundle.months,
          },
        );

        if (!result.ok) {
          // Nothing committed server-side; realign in-memory stores to the
          // (unchanged) server truth so no stale local state lingers.
          await Promise.all([reloadLedgerWorkspace(), reloadSalaryWorkspace()]);
          setFormNotice({ kind: "global", message: result.message });
          return;
        }

        // Pull the committed truth back into the ledger/salary stores.
        await Promise.all([
          refreshEntries(),
          reloadLedgerWorkspace(),
          reloadSalaryWorkspace(),
        ]);
        setSavedListVersion((v) => v + 1);
        setOpeningEdit(false);
        const baseMsg = prior
          ? `Updated ${formatDateKeyAsDisplay(dateKey)}. One entry per day — use Edit on a row or Add Entry for another date.`
          : `Saved ${formatDateKeyAsDisplay(dateKey)}. One entry per day — Add Entry for another date or review the list below.`;
        setFormNotice({
          kind: "global",
          message: ledgerPostFailed
            ? `${baseMsg} Supplier payments: one or more lines could not be saved — check amounts.`
            : baseMsg,
        });
        setActiveView("history");
      } finally {
        setIsSaving(false);
      }
    } catch (e) {
      setFormNotice({
        kind: "globalError",
        message: e instanceof Error ? e.message : "Could not save this entry.",
      });
    }
  }

  function openAddEntryForm() {
    const key = suggestedNewEntryDateKey(entryMap, todayKey());
    requestLeaveIfNeeded(() => {
      setDateKey(key);
      setDateFieldText(formatDateKeyAsDisplay(key));
      setActiveView("entry");
    });
  }

  function shiftEntryDate(days: number) {
    if (isFormLocked) return;
    const nextKey = dateAddDays(dateKey, days);
    requestLeaveIfNeeded(
      () => {
        setDateKey(nextKey);
        setDateFieldText(formatDateKeyAsDisplay(nextKey));
      },
      () => setDateFieldText(formatDateKeyAsDisplay(dateKey)),
    );
  }

  function openEntryForDate(dateIso: string) {
    requestLeaveIfNeeded(() => {
      setDateKey(dateIso);
      setDateFieldText(formatDateKeyAsDisplay(dateIso));
      setActiveView("entry");
    });
  }

  function leaveEntryFormForHistory() {
    requestLeaveIfNeeded(() => setActiveView("history"));
  }

  function openNativeDatePicker() {
    const el = datePickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // Fall through to click() if showPicker is blocked or fails.
      }
    }
    el.click();
  }

  function openDeleteEntryModal(dateIso: string) {
    if (entryMap[dateIso]?.isLocked) return;
    setPendingDeleteDateIso(dateIso);
    setDeleteConfirmText("");
  }

  function closeDeleteEntryModal() {
    setPendingDeleteDateIso(null);
    setDeleteConfirmText("");
  }

  function openLockEntryModal(dateIso: string) {
    if (entryMap[dateIso]?.isLocked) return;
    setLockError(null);
    setPendingLockDateIso(dateIso);
  }

  function closeLockEntryModal() {
    setPendingLockDateIso(null);
    setLockError(null);
  }

  async function executeLockHistoryEntry(dateIso: string) {
    if (!entryMap[dateIso] || entryMap[dateIso]?.isLocked) return;
    setIsLocking(true);
    setLockError(null);
    try {
      const result = await lockDailyEntry(dateIso, userName.trim() || "Unknown");
      if (!result.ok) {
        setLockError(result.message);
        setFormNotice({ kind: "globalError", message: result.message });
        return;
      }
      closeLockEntryModal();
      await refreshEntries();
      setSavedListVersion((v) => v + 1);
      setFormNotice({
        kind: "global",
        message: `Entry for ${formatDateKeyAsDisplay(dateIso)} is locked — it can no longer be edited or deleted.`,
      });
      setHistoryDetailRow((open) =>
        open?.date === dateIso ? { ...open, isLocked: true } : open,
      );
    } finally {
      setIsLocking(false);
    }
  }

  function openUnlockEntryModal(dateIso: string) {
    if (!entryMap[dateIso]?.isLocked) return;
    setUnlockError(null);
    setPendingUnlockDateIso(dateIso);
  }

  function closeUnlockEntryModal() {
    setPendingUnlockDateIso(null);
    setUnlockError(null);
  }

  async function executeUnlockHistoryEntry(dateIso: string) {
    if (!entryMap[dateIso]?.isLocked) return;
    setIsUnlocking(true);
    setUnlockError(null);
    try {
      const result = await unlockDailyEntry(dateIso, userName.trim() || "Unknown");
      if (!result.ok) {
        setUnlockError(result.message);
        setFormNotice({ kind: "globalError", message: result.message });
        return;
      }
      closeUnlockEntryModal();
      await refreshEntries();
      setSavedListVersion((v) => v + 1);
      setFormNotice({
        kind: "global",
        message: `Entry for ${formatDateKeyAsDisplay(dateIso)} is unlocked — it can be edited or deleted again.`,
      });
      setHistoryDetailRow((open) =>
        open?.date === dateIso
          ? { ...open, isLocked: false, lockedAt: undefined, lockedBy: undefined }
          : open,
      );
    } finally {
      setIsUnlocking(false);
    }
  }

  async function executeDeleteHistoryEntry(dateIso: string) {
    if (!entryMap[dateIso]) return;
    // Settle any pending ledger/salary edit first so a debounced write can't
    // re-add the day's bills/payouts after the server removes them.
    await Promise.all([
      flushLedgerWorkspacePersist(),
      flushSalaryWorkspacePersist().catch(() => {}),
    ]);
    const result = await deleteDailyEntry(dateIso);
    if (!result.ok) {
      setFormNotice({ kind: "global", message: result.message });
      return;
    }
    closeDeleteEntryModal();
    // The server safe-cascades this day's unreferenced bills/POs and its posted
    // staff payouts; pull fresh ledger + salary truth so neither Cashbooks nor
    // the Salary register shows (or re-saves) the removed rows.
    await Promise.all([
      refreshEntries(),
      reloadLedgerWorkspace(),
      reloadSalaryWorkspace(),
    ]);
    setSavedListVersion((v) => v + 1);
    setFormNotice({ kind: "global", message: "Entry deleted." });
    setHistoryDetailRow((open) => (open?.date === dateIso ? null : open));
  }

  const dailyEntryHeader = (
    <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1 border-b border-solid [border-color:var(--pos-divider)] px-3 py-2">
      <h1 className="min-w-0 justify-self-start text-left text-[14px] font-semibold leading-tight text-[var(--pos-text-1)]">
        Daily Entry Form
      </h1>
      {activeView === "entry" ? (
        <div className="col-start-2 flex shrink-0 items-center justify-center">
          <div className="relative flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => shiftEntryDate(-1)}
              disabled={isFormLocked}
              className="inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-nav-hover)]/50 hover:text-[var(--pos-text-1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pos-sb-base)] disabled:cursor-not-allowed disabled:opacity-50"
              title="Previous day"
              aria-label="Previous day"
            >
              <ChevronLeft className="size-5" strokeWidth={2.5} />
            </button>
            <input
              id="daily-entry-date"
              type="text"
              readOnly
              value={dateFieldText}
              disabled={isFormLocked}
              onClick={() => {
                if (!isFormLocked) openNativeDatePicker();
              }}
              onKeyDown={(e) => {
                if (isFormLocked) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openNativeDatePicker();
                }
              }}
              placeholder="DD-MMM-YYYY"
              title="Pick entry date"
              aria-label="Entry date — click to open calendar"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} !h-9 w-auto min-w-[9.25rem] cursor-pointer py-0 text-center font-semibold read-only:cursor-pointer disabled:cursor-not-allowed`}
            />
            <button
              type="button"
              onClick={() => shiftEntryDate(1)}
              disabled={isFormLocked}
              className="inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-nav-hover)]/50 hover:text-[var(--pos-text-1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pos-sb-base)] disabled:cursor-not-allowed disabled:opacity-50"
              title="Next day"
              aria-label="Next day"
            >
              <ChevronRight className="size-5" strokeWidth={2.5} />
            </button>
            <input
              ref={datePickerRef}
              type="date"
              value={dateKey}
              onChange={(e) => {
                const v = e.target.value;
                if (!v || v === dateKey) return;
                requestLeaveIfNeeded(
                  () => {
                    setDateKey(v);
                    setDateFieldText(formatDateKeyAsDisplay(v));
                  },
                  () => setDateFieldText(formatDateKeyAsDisplay(dateKey)),
                );
              }}
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
            />
          </div>
        </div>
      ) : (
        <span className="col-start-2 shrink-0" aria-hidden />
      )}
      <div className="col-start-3 flex justify-end gap-1.5 justify-self-end">
        {activeView === "entry" ? (
          <>
            {isFormLocked ? (
              <button
                type="button"
                disabled={isUnlocking}
                onClick={() => openUnlockEntryModal(dateKey)}
                className={headerUnlockBtnClass}
              >
                <LockOpen className="size-3" strokeWidth={2.25} aria-hidden />
                {isUnlocking ? "Unlocking…" : "Unlock entry"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isSaving || isAttachmentUploadBusy}
                  onClick={() => void handleSave()}
                  className={headerSaveBtnClass}
                  style={{ backgroundColor: "var(--pos-sb-base)" }}
                >
                  {isSaving ? "Saving…" : isAttachmentUploadBusy ? "Uploading…" : "Save"}
                </button>
                {savedRowForDate ? (
                  <button
                    type="button"
                    disabled={isLocking}
                    onClick={() => openLockEntryModal(dateKey)}
                    className={headerLockBtnClass}
                  >
                    <Lock className="size-3" strokeWidth={2.25} aria-hidden />
                    {isLocking ? "Locking…" : "Lock entry"}
                  </button>
                ) : null}
              </>
            )}
            <button
              type="button"
              onClick={leaveEntryFormForHistory}
              className={headerHistoryBtnClass}
            >
              History
            </button>
          </>
        ) : (
          <span
            className="self-center text-[11px] tabular-nums text-[var(--pos-text-2)]"
            title={
              entryListSearchQuery.trim()
                ? "Entries matching search / total saved"
                : "Total saved entries"
            }
          >
            {historyRows.length === 0
              ? "0 saved"
              : entryListSearchQuery.trim()
                ? `${filteredHistoryRows.length} / ${historyRows.length}`
                : `${historyRows.length} saved`}
          </span>
        )}
      </div>
    </div>
  );

  const editingExistingBanner =
    activeView === "entry" && savedRowForDate ? (
      <div
        className={`shrink-0 border-b border-solid px-3 py-2.5 sm:px-4 sm:py-3 ${
          isFormLocked
            ? "border-amber-700/40 border-l-4 border-l-amber-400 bg-amber-800 text-amber-50"
            : "border-[color-mix(in_srgb,var(--pos-sb-base)_50%,black)] border-l-4 border-l-[color-mix(in_srgb,var(--pos-sb-base)_70%,white)] bg-[var(--pos-sb-base)] text-white"
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-[14px] font-bold leading-snug sm:text-[15px]">
            {isFormLocked ? (
              <>
                <Lock className="mr-1.5 inline size-4 align-text-bottom" strokeWidth={2.25} />
                Locked · {formatDateKeyAsDisplay(dateKey)}
              </>
            ) : (
              <>Editing · {formatDateKeyAsDisplay(dateKey)}</>
            )}
          </p>
          {savedRowForDate.updatedAt ? (
            <p
              className={`shrink-0 text-[12px] font-medium tabular-nums leading-snug sm:text-[13px] ${
                isFormLocked ? "text-amber-100/90" : "text-white/80"
              }`}
            >
              Saved{" "}
              {new Date(savedRowForDate.updatedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          ) : null}
        </div>
        {isFormLocked ? (
          <p className="mt-1 text-[12px] font-medium leading-snug text-amber-100/85">
            Read-only
            {savedRowForDate.lockedAt ? (
              <>
                {" "}
                · locked{" "}
                {new Date(savedRowForDate.lockedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {savedRowForDate.lockedBy ? ` by ${savedRowForDate.lockedBy}` : ""}
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    ) : null;

  const globalNoticeEl =
    formNotice.kind === "global" ? (
      <div
        className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2 text-[11px] leading-snug text-[var(--pos-text-1)]"
        role="status"
        aria-live="polite"
      >
        {formNotice.message}
      </div>
    ) : formNotice.kind === "globalError" ? (
      <div
        className="shrink-0 border-b border-solid border-red-500/40 bg-red-50 px-3 py-2 text-[11px] font-medium leading-snug text-red-800"
        role="alert"
        aria-live="assertive"
      >
        {formNotice.message}
      </div>
    ) : null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[12px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]">
      {activeView === "history" ? (
        <>
          {dailyEntryHeader}
          {editingExistingBanner}
          {globalNoticeEl}
          {entriesLoading ? (
            <p className="px-3 py-2 text-[12px] text-[var(--pos-text-2)]">Loading saved entries…</p>
          ) : null}
          {entriesLoadError ? (
            <p className="px-3 py-2 text-[12px] text-red-600" role="alert">
              {entriesLoadError}
            </p>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col overflow-auto px-3 py-2">
            {!entriesLoading && historyRows.length > 0 ? (
              <div className="shrink-0" role="search">
                <label className="relative block">
                  <span className="sr-only">Search saved entries</span>
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--pos-text-2)]"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={entryListSearchQuery}
                    onChange={(e) => setEntryListSearchQuery(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] py-1.5 pl-8 pr-8 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)]/80 focus:border-[var(--pos-text-1)] focus:outline-none"
                    placeholder='Search — try supplier:Rent cash:1000 "apr" -legacy'
                  />
                  {entryListSearchQuery ? (
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/50 hover:text-[var(--pos-text-1)]"
                      onClick={() => setEntryListSearchQuery("")}
                      aria-label="Clear search"
                    >
                      <X className="size-3.5" strokeWidth={2.25} aria-hidden />
                    </button>
                  ) : null}
                </label>
              </div>
            ) : null}
            {!entriesLoading && historyRows.length === 0 ? (
              <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-dashed border-[var(--pos-border-medium)]">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-dashed border-[var(--pos-border-medium)] bg-[var(--pos-page)] px-3 py-2">
                  <h2 className={`m-0 min-w-0 leading-tight ${sectionTitleClass}`}>
                    Saved entries
                  </h2>
                  <button
                    type="button"
                    onClick={openAddEntryForm}
                    className="inline-flex shrink-0 items-center gap-1 rounded-[7px] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "var(--pos-sb-base)" }}
                  >
                    <Plus className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                    Add Entry
                  </button>
                </div>
                <p className="px-4 py-8 text-center text-[13px] text-[var(--pos-text-2)]">
                  No saved daily entries yet. Tap <span className="font-medium">Add Entry</span> in
                  the header row, fill the form, and save.
                </p>
              </div>
            ) : (
              <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-solid [border-color:var(--pos-divider)]">
                <div className="flex shrink-0 flex-col gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className={`m-0 min-w-0 leading-tight ${sectionTitleClass}`}>
                      Saved entries
                    </h2>
                    <button
                      type="button"
                      onClick={openAddEntryForm}
                      className="inline-flex shrink-0 items-center gap-1 rounded-[7px] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: "var(--pos-sb-base)" }}
                    >
                      <Plus className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                      Add Entry
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[820px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)]">
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Date</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Opening</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Net sales</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Expenses Σ</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Remaining</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Entered by</th>
                      <th className="px-3 py-2 text-right font-semibold text-[var(--pos-text-2)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistoryRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center text-[13px] text-[var(--pos-text-2)]"
                        >
                          <p className="m-0 font-medium text-[var(--pos-text-1)]">
                            No entries match this search
                          </p>
                          <p className="mt-1 text-[12px]">
                            Try broader keywords, remove a scoped filter, or clear exclusions (
                            <button
                              type="button"
                              className="font-semibold text-[var(--pos-sb-base)] underline-offset-2 hover:underline"
                              onClick={() => setEntryListSearchQuery("")}
                            >
                              clear search
                            </button>
                            ).
                          </p>
                        </td>
                      </tr>
                    ) : null}
                    {filteredHistoryRows.map((r) => (
                      <tr
                        key={r.date}
                        className="border-b border-solid [border-color:var(--pos-divider)] transition-colors hover:bg-[var(--pos-nav-hover)]/15"
                      >
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-[var(--pos-text-1)]">
                          <span className="inline-flex items-center gap-1.5">
                            {formatDateKeyAsDisplay(r.date)}
                            {r.isLocked ? (
                              <span title="Locked — cannot edit or delete" aria-label="Locked">
                                <Lock
                                  className="size-3 shrink-0 text-amber-600"
                                  strokeWidth={2.25}
                                  aria-hidden
                                />
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[var(--pos-text-1)]">
                          {formatSummaryMoney(r.openingBalance)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[var(--pos-text-1)]">
                          {formatSummaryMoney(netSalesTotal(r))}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[var(--pos-text-1)]">
                          {formatSummaryMoney(expenseTotalFromRow(r))}
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-[var(--pos-text-1)]">
                          {formatSummaryMoney(r.remainingBalance)}
                        </td>
                        <td
                          className="max-w-[140px] truncate px-3 py-2 text-[var(--pos-text-1)]"
                          title={r.enteredBy?.trim() || undefined}
                        >
                          {r.enteredBy?.trim() || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              className={historyActionBtnClass}
                              title="View details"
                              aria-label={`View saved entry ${formatDateKeyAsDisplay(r.date)}`}
                              onClick={() => setHistoryDetailRow(r)}
                            >
                              <Eye className="size-3.5" strokeWidth={2.25} />
                            </button>
                            {!r.isLocked ? (
                              <button
                                type="button"
                                className={historyActionBtnClass}
                                title="Edit in form"
                                aria-label={`Edit entry ${formatDateKeyAsDisplay(r.date)}`}
                                onClick={() => openEntryForDate(r.date)}
                              >
                                <Pencil className="size-3.5" strokeWidth={2.25} />
                              </button>
                            ) : null}
                            {r.isLocked ? (
                              <button
                                type="button"
                                className={historyActionBtnClass}
                                title="Unlock entry"
                                aria-label={`Unlock entry ${formatDateKeyAsDisplay(r.date)}`}
                                onClick={() => openUnlockEntryModal(r.date)}
                              >
                                <LockOpen className="size-3.5" strokeWidth={2.25} />
                              </button>
                            ) : null}
                            {!r.isLocked ? (
                              <>
                                <button
                                  type="button"
                                  className={historyActionBtnClass}
                                  title="Lock entry"
                                  aria-label={`Lock entry ${formatDateKeyAsDisplay(r.date)}`}
                                  onClick={() => openLockEntryModal(r.date)}
                                >
                                  <Lock className="size-3.5" strokeWidth={2.25} />
                                </button>
                                <button
                                  type="button"
                                  className={`${historyActionBtnClass} hover:border-red-400/40 hover:text-red-600`}
                                  title="Delete entry"
                                  aria-label={`Delete entry ${formatDateKeyAsDisplay(r.date)}`}
                                  onClick={() => openDeleteEntryModal(r.date)}
                                >
                                  <Trash2 className="size-3.5" strokeWidth={2.25} />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {dailyEntryHeader}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {editingExistingBanner}
            {globalNoticeEl}
            <form
              className="flex flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
            >
        <fieldset
          disabled={isFormLocked}
          className="m-0 min-w-0 border-0 p-0 disabled:opacity-100"
        >
        <div className="flex flex-col gap-3 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
          <div className={statsSummaryClass}>
            <div
              className={statCardHintClass}
              title="Previous day's closing balance · pencil to edit"
            >
              <p className={labelClass}>Opening Balance</p>
              <div className="flex min-h-[1.375rem] items-center gap-1.5">
                {openingEdit ? (
                  <input
                    ref={openingInputRef}
                    {...amountFieldProps("next")}
                    value={openingBalance}
                    onChange={linkNonNegativeAmount(setOpeningBalance)}
                    onBlur={() => setOpeningEdit(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setOpeningEdit(false);
                      }
                    }}
                    className={`${amountInputClass} flex-1`}
                    aria-label="Opening balance"
                  />
                ) : (
                  <>
                    <p className={`min-w-0 flex-1 ${statValueClass}`}>
                      {formatSummaryMoney(parseAmount(openingBalance))}
                    </p>
                    <button
                      type="button"
                      className={editOpeningBtnClass}
                      aria-label="Edit opening balance"
                      onClick={requestOpeningBalanceEdit}
                    >
                      <Pencil className="size-3.5" strokeWidth={2.25} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div
              className={statCardHintClass}
              title="All sales channels − void sales"
            >
              <p className={labelClass}>Sales</p>
              <p className={statValueClass}>
                {formatSummaryMoney(netSalesAfterVoid)}
              </p>
            </div>
            <div className={statCardHintClass} title="Sum of all expense line amounts">
              <p className={labelClass}>Expenses</p>
              <p className={statValueClass}>
                {formatSummaryMoney(expenseSum)}
              </p>
            </div>
            <div
              className={statCardHintClass}
              title="Bank sales − withdrawn today"
            >
              <p className={labelClass}>Bank balance (today)</p>
              <p className={statValueClass}>
                {formatSummaryMoney(bankNetBalance)}
              </p>
            </div>
            <div
              className={`${statCardHintClass} relative before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[var(--pos-sb-base)] !bg-[color-mix(in_srgb,var(--pos-sb-base)_5%,var(--pos-card))]`}
              title="Opening + sales (excl. bank) − void − expenses · bank sales stay in bank balance"
            >
              <p className={labelClass}>Closing Balance</p>
              <p className={statValueHighlightClass}>
                {formatSummaryMoney(remaining)}
              </p>
            </div>
          </div>

          <div className={entrySectionsGridClass}>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div
              className={`${columnShellClass} min-w-0 w-full !bg-red-50/65 ![border-color:rgba(220,38,38,0.28)]`}
            >
              <p className={`${sectionTitleClass} !text-red-800`}>Expenses</p>
              {visibleExpenseLines.length === 0 ? (
                <p className={`py-2 text-center ${expenseMetaClass}`}>
                  No expenses for this day yet — add one below.
                </p>
              ) : null}
              <div className="flex flex-col gap-3">
                {visibleExpenseLines.map((line) => {
                  if (line.kind === "purchase") {
                    const vendorErr = fieldErrorMessage(formNotice, line.id, "vendor");
                    const amountErr = fieldErrorMessage(formNotice, line.id, "amount");
                    const attachErr = fieldErrorMessage(formNotice, line.id, "attach");
                    const ledgerNoteErr = fieldErrorMessage(formNotice, line.id, "ledgerNote");
                    const vendorGroups = groupPurchaseDraftItemsByVendor(line.items);
                    const lastItemVendor =
                      [...line.items].reverse().find((i) => i.vendor.trim())?.vendor ?? "";
                    const itemField = expenseFieldClass;
                    const purchaseGridCols =
                      "minmax(5.5rem,0.9fr) minmax(0,1.3fr) 40px 44px 56px 56px 22px";
                    return (
                      <div key={line.id} className="flex flex-col gap-2">
                        {vendorGroups.map((group) => {
                          const groupTotal = purchaseItemsTotal(group.items);
                          const hasVendor = group.vendor.length > 0;
                          const paidLine = hasVendor
                            ? vendorPaymentLineByVendor.get(group.vendor.trim())
                            : undefined;
                          const paidNow = parseAmount(paidLine?.amount ?? "");
                          const dueNow = groupTotal - paidNow;
                          return (
                            <ExpenseCardShell
                              key={`${line.id}-vg-${group.vendor || "unassigned"}`}
                              kind="purchase"
                              lineId={line.id}
                              purchaseVendor={group.vendor}
                              actions={
                                <>
                                  {renderPurchaseVendorNoteToggle(line, group.vendor, {
                                    disabled: !hasVendor,
                                  })}
                                  {renderReceiptAddControl(line, {
                                    purchaseVendor: group.vendor,
                                    disabled: !hasVendor,
                                  })}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removePurchaseVendorGroup(line.id, group.vendor)
                                    }
                                    className={expenseRemoveBtnClass}
                                    aria-label={
                                      hasVendor
                                        ? `Remove ${group.vendor} purchase`
                                        : "Remove unassigned items"
                                    }
                                  >
                                    <Trash2
                                      className="size-3.5 shrink-0"
                                      strokeWidth={2.25}
                                      aria-hidden
                                    />
                                  </button>
                                </>
                              }
                            >
                              <div className="overflow-x-auto">
                                <div
                                  className={`mb-0.5 grid min-w-[360px] gap-1 px-0.5 ${expenseCardLabelClass}`}
                                  style={{ gridTemplateColumns: purchaseGridCols }}
                                >
                                  <span>Supplier</span>
                                  <span>Name</span>
                                  <span className="text-right">Qty</span>
                                  <span>Unit</span>
                                  <span className="text-right">Rate</span>
                                  <span className="text-right">Total</span>
                                  <span />
                                </div>
                                <div className="space-y-1">
                                  {group.items.map((row) => {
                                    const idx = line.items.findIndex((i) => i.key === row.key);
                                    return (
                                      <div
                                        key={row.key}
                                        className="grid min-w-[360px] items-center gap-1"
                                        style={{ gridTemplateColumns: purchaseGridCols }}
                                      >
                                        <SearchableSelect
                                          value={row.vendor}
                                          onChange={(vendor) =>
                                            patchPurchaseItem(line.id, row.key, { vendor })
                                          }
                                          options={[
                                            { value: "", label: "Supplier…" },
                                            ...purchaseVendorOptions.map((name) => ({
                                              value: name,
                                              label: name,
                                            })),
                                          ]}
                                          placeholder="Supplier…"
                                          aria-label={`Item ${idx + 1} supplier`}
                                          className={itemField}
                                        />
                                        <input
                                          type="text"
                                          value={row.name}
                                          onChange={(e) =>
                                            patchPurchaseItem(line.id, row.key, {
                                              name: e.target.value,
                                            })
                                          }
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
                                            patchPurchaseItem(line.id, row.key, {
                                              qty: e.target.value,
                                            })
                                          }
                                          placeholder="1"
                                          aria-label={`Item ${idx + 1} quantity`}
                                          className={`${itemField} text-right font-mono`}
                                        />
                                        <SearchableSelect
                                          value={row.unit}
                                          onChange={(unit) =>
                                            patchPurchaseItem(line.id, row.key, { unit })
                                          }
                                          options={PURCHASE_ITEM_UNITS.map((u) => ({
                                            value: u,
                                            label: u,
                                          }))}
                                          aria-label={`Item ${idx + 1} unit`}
                                          className={itemField}
                                        />
                                        <input
                                          type="number"
                                          inputMode="decimal"
                                          min={0}
                                          step="any"
                                          value={row.rate}
                                          onChange={(e) =>
                                            patchPurchaseItem(line.id, row.key, {
                                              rate: e.target.value,
                                            })
                                          }
                                          placeholder="0"
                                          aria-label={`Item ${idx + 1} rate`}
                                          className={`${itemField} text-right font-mono`}
                                        />
                                        <input
                                          type="number"
                                          inputMode="decimal"
                                          min={0}
                                          step="any"
                                          value={row.total}
                                          onChange={(e) =>
                                            patchPurchaseItem(line.id, row.key, {
                                              total: e.target.value,
                                            })
                                          }
                                          placeholder="0"
                                          aria-label={`Item ${idx + 1} total`}
                                          className={`${itemField} text-right font-mono`}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => removePurchaseItem(line.id, row.key)}
                                          className="inline-flex size-6 items-center justify-center rounded-full text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-nav-hover)]/50 hover:text-[var(--pos-text-1)]"
                                          aria-label={`Remove item ${idx + 1}`}
                                        >
                                          <Trash2 className="size-3" strokeWidth={2.25} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <ExpenseMoneyChips
                                total={groupTotal}
                                paid={paidLine?.amount ?? ""}
                                due={dueNow}
                                showPaidDue={hasVendor}
                                onPaidChange={
                                  hasVendor
                                    ? (v) => setPurchaseVendorPaid(group.vendor, v)
                                    : undefined
                                }
                                paidAriaLabel={
                                  hasVendor
                                    ? `Amount paid to ${group.vendor}`
                                    : "Amount paid now"
                                }
                                amountAnchor={`${line.id}:amount`}
                                paidInputProps={amountFieldProps("next")}
                                leading={
                                  <button
                                    type="button"
                                    onClick={() =>
                                      patchLine(line.id, {
                                        items: [
                                          ...line.items,
                                          newPurchaseItemDraft(
                                            group.vendor || lastItemVendor,
                                          ),
                                        ],
                                      })
                                    }
                                    className={`inline-flex h-8 shrink-0 items-center gap-0.5 rounded-[7px] px-1.5 font-medium transition-colors hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)] ${expenseMetaClass}`}
                                  >
                                    <Plus className="size-3" strokeWidth={2.5} aria-hidden />
                                    Item
                                  </button>
                                }
                              />
                              <ExpenseFieldErrorBubble message={amountErr ?? vendorErr} />
                              {openExpenseNoteLineIds.has(
                                purchaseVendorNoteKey(line.id, group.vendor),
                              ) && hasVendor ? (
                                <div
                                  className="min-w-0"
                                  data-field-error-anchor={`${line.id}:ledgerNote`}
                                >
                                  <input
                                    id={`purchase-note-${line.id}-${group.vendor}`}
                                    name="purchase-vendor-note"
                                    type="text"
                                    value={line.vendorNotes?.[group.vendor] ?? ""}
                                    onChange={(e) =>
                                      patchLine(line.id, {
                                        vendorNotes: {
                                          ...(line.vendorNotes ?? {}),
                                          [group.vendor]: e.target.value,
                                        },
                                      })
                                    }
                                    placeholder="Bill note (optional)"
                                    className={expenseQuietInputClass}
                                    autoComplete="off"
                                    aria-label={`${group.vendor} bill note`}
                                  />
                                  <ExpenseFieldErrorBubble message={ledgerNoteErr} />
                                </div>
                              ) : null}
                              {renderReceiptThumbnails(line, {
                                purchaseVendor: group.vendor,
                              })}
                            </ExpenseCardShell>
                          );
                        })}
                        {purchaseVendorOptions.length === 0 ? (
                          <p className={expenseMetaClass}>
                            Add a supplier in{" "}
                            <button
                              type="button"
                              onClick={() => openItemPurchaseSuppliers()}
                              className="font-semibold text-[var(--pos-text-1)] underline decoration-[var(--pos-divider)] underline-offset-2 hover:decoration-[var(--pos-sb-base)]"
                            >
                              Item Purchases
                            </button>{" "}
                            first.
                          </p>
                        ) : null}
                        {attachErr ? (
                          <div data-field-error-anchor={`${line.id}:attach`}>
                            <ExpenseFieldErrorBubble message={attachErr} />
                          </div>
                        ) : null}
                      </div>
                    );
                  }
                  if (line.kind === "staff") {
                    const employeeErr = fieldErrorMessage(formNotice, line.id, "employeeId");
                    const amountErr = fieldErrorMessage(formNotice, line.id, "amount");
                    const attachErr = fieldErrorMessage(formNotice, line.id, "attach");
                    return (
                      <ExpenseCardShell
                        key={line.id}
                        kind="staff"
                        lineId={line.id}
                        actions={
                          <>
                            {renderExpenseNoteToggle(line)}
                            {renderReceiptAddControl(line)}
                            <button
                              type="button"
                              onClick={() => removeExpenseLine(line.id)}
                              className={expenseRemoveBtnClass}
                              aria-label="Remove expense line"
                            >
                              <Trash2
                                className="size-3.5 shrink-0"
                                strokeWidth={2.25}
                                aria-hidden
                              />
                            </button>
                          </>
                        }
                      >
                        <div className={expenseCardRowClass}>
                          <div
                            className="flex min-w-0 flex-1 basis-44 flex-col gap-1"
                            data-field-error-anchor={`${line.id}:employeeId`}
                          >
                            <SearchableSelect
                              className={`${expensePrimarySelectClass} ${employeeErr ? FIELD_ERR_INPUT : ""}`}
                              value={line.employeeId}
                              onChange={(employeeId) =>
                                patchLine(line.id, { employeeId })
                              }
                              aria-label="Employee"
                              aria-invalid={employeeErr ? true : undefined}
                              placeholder="Employee…"
                              options={(() => {
                                const selectedId = line.employeeId.trim();
                                const selectedInList =
                                  !selectedId ||
                                  staffSelectEmployees.some((emp) => emp.id === selectedId);
                                const orphan =
                                  selectedInList || !selectedId
                                    ? null
                                    : getEmployeeById(selectedId);
                                return [
                                  { value: "", label: "Employee…" },
                                  ...(orphan
                                    ? [
                                        {
                                          value: selectedId,
                                          label: orphan.name?.trim() || "Unknown employee",
                                        },
                                      ]
                                    : []),
                                  ...staffSelectEmployees.map((emp) => ({
                                    value: emp.id,
                                    label: emp.name,
                                  })),
                                ];
                              })()}
                            />
                            <ExpenseFieldErrorBubble message={employeeErr} />
                          </div>
                          <div
                            className="flex w-[8.5rem] shrink-0 flex-col gap-1"
                            data-field-error-anchor={`${line.id}:amount`}
                          >
                            <input
                              {...amountFieldProps("next")}
                              value={line.amount}
                              onChange={(e) => patchLine(line.id, { amount: e.target.value })}
                              placeholder="0"
                              className={`${expenseAmountFieldClass} ${amountErr ? FIELD_ERR_INPUT : ""}`}
                              aria-label="Staff payout amount"
                              aria-invalid={amountErr ? true : undefined}
                            />
                            <ExpenseFieldErrorBubble message={amountErr} />
                          </div>
                        </div>
                        <label
                          className={`inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-[7px] border border-solid px-2 py-1 ${expenseMetaClass} ${
                            line.staffLineKind === STAFF_ADVANCE_LINE_KIND
                              ? "border-sky-500/40 bg-sky-500/10 text-sky-900"
                              : "[border-color:var(--pos-divider)]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={line.staffLineKind === STAFF_ADVANCE_LINE_KIND}
                            onChange={(e) =>
                              patchLine(line.id, {
                                staffLineKind: e.target.checked
                                  ? STAFF_ADVANCE_LINE_KIND
                                  : STAFF_LINE_KIND,
                              })
                            }
                            className="size-3.5 shrink-0 accent-[var(--pos-text-1)]"
                          />
                          Advance salary
                        </label>
                        {openExpenseNoteLineIds.has(line.id) ? (
                          <input
                            id={`expense-note-${line.id}`}
                            type="text"
                            value={line.note}
                            onChange={(e) => patchLine(line.id, { note: e.target.value })}
                            placeholder="Add a note (optional)"
                            className={expenseQuietInputClass}
                            autoComplete="off"
                            aria-label="Note"
                            data-field-error-anchor={`${line.id}:note`}
                          />
                        ) : null}
                        {attachErr ? (
                          <div data-field-error-anchor={`${line.id}:attach`}>
                            <ExpenseFieldErrorBubble message={attachErr} />
                          </div>
                        ) : null}
                        {renderReceiptThumbnails(line)}
                      </ExpenseCardShell>
                    );
                  }
                  if (line.kind === "regular") {
                    const labelErr = fieldErrorMessage(formNotice, line.id, "label");
                    const amountErr = fieldErrorMessage(formNotice, line.id, "amount");
                    const attachErr = fieldErrorMessage(formNotice, line.id, "attach");
                    const totalAmt = parseAmount(line.amount);
                    const paidAmt =
                      line.paidAmount.trim() === ""
                        ? totalAmt
                        : parseAmount(line.paidAmount);
                    const dueAmt = Math.max(0, totalAmt - paidAmt);
                    return (
                      <ExpenseCardShell
                        key={line.id}
                        kind="regular"
                        lineId={line.id}
                        actions={
                          <>
                            {renderExpenseNoteToggle(line)}
                            {renderReceiptAddControl(line)}
                            <button
                              type="button"
                              onClick={() => removeExpenseLine(line.id)}
                              className={expenseRemoveBtnClass}
                              aria-label="Remove expense line"
                            >
                              <Trash2
                                className="size-3.5 shrink-0"
                                strokeWidth={2.25}
                                aria-hidden
                              />
                            </button>
                          </>
                        }
                      >
                        <div className="flex min-w-0 flex-wrap items-start gap-1.5">
                          <div className="flex w-[8.5rem] shrink-0 flex-col gap-0.5">
                            <span className={expenseCardLabelClass}>Category</span>
                            <SearchableSelect
                              className={expensePrimarySelectClass}
                              value={line.expenseCategoryId}
                              onChange={(val) => {
                                if (val === NEW_EXPENSE_CATEGORY_VALUE) {
                                  setCategoryModalLineId(line.id);
                                  setCategoryModalName("");
                                  setCategoryModalError(null);
                                  return;
                                }
                                patchLine(line.id, { expenseCategoryId: val });
                              }}
                              aria-label="Expense category"
                              placeholder="Category…"
                              options={[
                                { value: "", label: "Category…" },
                                ...expenseCategories.map((c) => ({
                                  value: c.id,
                                  label: c.name,
                                })),
                                {
                                  value: NEW_EXPENSE_CATEGORY_VALUE,
                                  label: "+ New category…",
                                },
                              ]}
                            />
                          </div>
                          <div
                            className="flex min-w-0 flex-1 flex-col gap-0.5"
                            data-field-error-anchor={`${line.id}:label`}
                          >
                            <span className={expenseCardLabelClass}>Title</span>
                            <input
                              type="text"
                              value={line.label}
                              onChange={(e) => patchLine(line.id, { label: e.target.value })}
                              placeholder="Expense title"
                              className={`${expenseFieldClass} font-semibold ${labelErr ? FIELD_ERR_INPUT : ""}`}
                              autoComplete="off"
                              aria-label="Expense title"
                              aria-invalid={labelErr ? true : undefined}
                              aria-required
                            />
                            <ExpenseFieldErrorBubble message={labelErr} />
                          </div>
                          <div className="ml-auto min-w-0 shrink-0">
                            <ExpenseMoneyChips
                              labelsAbove
                              total={line.amount}
                              paid={line.paidAmount}
                              due={dueAmt}
                              onTotalChange={(next) => {
                                const prevTotal = line.amount;
                                const prevPaid = line.paidAmount;
                                const keepPaidSynced =
                                  prevPaid.trim() === "" || prevPaid === prevTotal;
                                patchLine(line.id, {
                                  amount: next,
                                  ...(keepPaidSynced ? { paidAmount: next } : {}),
                                });
                              }}
                              onPaidChange={(v) => patchLine(line.id, { paidAmount: v })}
                              paidPlaceholder={line.amount || "0"}
                              totalAriaLabel="Expense total"
                              totalInvalid={Boolean(amountErr)}
                              amountAnchor={`${line.id}:amount`}
                              totalInputProps={amountFieldProps("next")}
                              paidInputProps={amountFieldProps("next")}
                            />
                          </div>
                        </div>
                        <ExpenseFieldErrorBubble message={amountErr} />
                        {openExpenseNoteLineIds.has(line.id) ? (
                          <input
                            id={`expense-note-${line.id}`}
                            type="text"
                            value={line.note}
                            onChange={(e) => patchLine(line.id, { note: e.target.value })}
                            placeholder="Add a note (optional)"
                            className={expenseQuietInputClass}
                            autoComplete="off"
                            aria-label="Note"
                            data-field-error-anchor={`${line.id}:note`}
                          />
                        ) : null}
                        {attachErr ? (
                          <div data-field-error-anchor={`${line.id}:attach`}>
                            <ExpenseFieldErrorBubble message={attachErr} />
                          </div>
                        ) : null}
                        {renderReceiptThumbnails(line)}
                      </ExpenseCardShell>
                    );
                  }
                  if (line.kind === "vendor") {
                    const trimmed = line.vendor.trim();
                    const inList = trimmed !== "" && vendorOptions.includes(trimmed);
                    const selectValue =
                      trimmed === "" ? "" : inList ? trimmed : VENDOR_OTHER_VALUE;
                    const showOtherInput = selectValue === VENDOR_OTHER_VALUE;
                    const vendorErr = fieldErrorMessage(formNotice, line.id, "vendor");
                    const vendorAmountErr = fieldErrorMessage(
                      formNotice,
                      line.id,
                      "amount",
                    );
                    const attachErr = fieldErrorMessage(formNotice, line.id, "attach");
                    const ledgerNoteErr = fieldErrorMessage(formNotice, line.id, "ledgerNote");
                    const ledgerSupplierForLine = resolveLedgerSupplierIdByBookName(trimmed);

                    return (
                      <ExpenseCardShell
                        key={line.id}
                        kind="vendor"
                        lineId={line.id}
                        actions={
                          <>
                            {renderExpenseNoteToggle(line)}
                            {renderReceiptAddControl(line)}
                            <button
                              type="button"
                              onClick={() => removeExpenseLine(line.id)}
                              className={expenseRemoveBtnClass}
                              aria-label="Remove expense line"
                            >
                              <Trash2
                                className="size-3.5 shrink-0"
                                strokeWidth={2.25}
                                aria-hidden
                              />
                            </button>
                          </>
                        }
                      >
                        <div className={expenseCardRowClass}>
                          <div
                            className="flex min-w-0 flex-1 basis-44 flex-col gap-1"
                            data-field-error-anchor={`${line.id}:vendor`}
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              <SearchableSelect
                                className={`${expensePrimarySelectClass} flex-1 ${vendorErr ? FIELD_ERR_INPUT : ""}`}
                                value={selectValue}
                                onChange={(val) => {
                                  const ledgerReset = {
                                    ledgerKind: "" as const,
                                    ledgerEmployeeLineKind: "" as const,
                                    ledgerNote: "",
                                  };
                                  if (val === "") {
                                    patchLine(line.id, { vendor: "", ...ledgerReset });
                                  } else if (val === VENDOR_OTHER_VALUE) {
                                    if (inList)
                                      patchLine(line.id, { vendor: "", ...ledgerReset });
                                  } else {
                                    patchLine(line.id, {
                                      vendor: val,
                                      ledgerKind: "" as const,
                                      ledgerEmployeeLineKind: "" as const,
                                    });
                                  }
                                }}
                                aria-label="Supplier"
                                aria-invalid={vendorErr ? true : undefined}
                                placeholder="Supplier…"
                                options={[
                                  { value: "", label: "Supplier…" },
                                  ...vendorOptions.map((name) => ({
                                    value: name,
                                    label: name,
                                  })),
                                  { value: VENDOR_OTHER_VALUE, label: "Other…" },
                                ]}
                              />
                              {showOtherInput ? (
                                <input
                                  type="text"
                                  value={line.vendor}
                                  onChange={(e) =>
                                    patchLine(line.id, { vendor: e.target.value })
                                  }
                                  placeholder="Name"
                                  className={`${expensePrimaryInputClass} min-w-[4.5rem] shrink-0 flex-1`}
                                  autoComplete="off"
                                  aria-label="Custom supplier name"
                                />
                              ) : null}
                            </div>
                            <ExpenseFieldErrorBubble message={vendorErr} />
                          </div>
                          <div
                            className="flex w-[8.5rem] shrink-0 flex-col gap-1"
                            data-field-error-anchor={`${line.id}:amount`}
                          >
                            <input
                              {...amountFieldProps("next")}
                              value={line.amount}
                              onChange={(e) => patchLine(line.id, { amount: e.target.value })}
                              placeholder="0"
                              className={`${expenseAmountFieldClass} ${vendorAmountErr ? FIELD_ERR_INPUT : ""}`}
                              aria-label="Expense amount"
                              aria-invalid={vendorAmountErr ? true : undefined}
                            />
                            <ExpenseFieldErrorBubble message={vendorAmountErr} />
                          </div>
                        </div>
                        {openExpenseNoteLineIds.has(line.id) ? (
                          <div
                            className="min-w-0"
                            data-field-error-anchor={`${line.id}:ledgerNote`}
                          >
                            <input
                              id={`expense-note-${line.id}`}
                              name="ledger-note"
                              type="text"
                              value={line.ledgerNote}
                              onChange={(e) =>
                                patchLine(line.id, { ledgerNote: e.target.value })
                              }
                              placeholder="Add a note (optional)"
                              className={expenseQuietInputClass}
                              autoComplete="off"
                              aria-label="Payment note"
                            />
                            <ExpenseFieldErrorBubble message={ledgerNoteErr} />
                          </div>
                        ) : null}
                        {!ledgerSupplierForLine && trimmed ? (
                          <p className={expenseMetaClass}>
                            Name doesn’t match a supplier — expense only. Add suppliers from{" "}
                            <button
                              type="button"
                              onClick={() => openItemPurchaseSuppliers()}
                              className="font-semibold text-[var(--pos-text-1)] underline decoration-[var(--pos-divider)] underline-offset-2 hover:decoration-[var(--pos-sb-base)]"
                            >
                              Item Purchases
                            </button>
                            .
                          </p>
                        ) : null}
                        {attachErr ? (
                          <div data-field-error-anchor={`${line.id}:attach`}>
                            <ExpenseFieldErrorBubble message={attachErr} />
                          </div>
                        ) : null}
                        {renderReceiptThumbnails(line)}
                      </ExpenseCardShell>
                    );
                  }
                  return null;
                })}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={addRegularExpenseLine}
                    className={expenseAddPrimaryClass}
                  >
                    <Plus className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={addStaffExpenseLine}
                    className={expenseAddStaffBtnClass}
                  >
                    <Plus className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
                    Staff
                  </button>
                  <button
                    type="button"
                    onClick={addPurchaseExpenseLine}
                    className={expenseAddPurchaseBtnClass}
                  >
                    <Plus className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
                    Purchase
                  </button>
                  <button
                    type="button"
                    onClick={addVendorExpenseLine}
                    className={expenseAddVendorBtnClass}
                  >
                    <Plus className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
                    Supplier
                  </button>
                </div>

            </div>


            </div>

            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-[11.5rem]">
            <div
              className={`${columnShellClass} min-w-0 w-full !bg-sky-50/65 ![border-color:rgba(2,132,199,0.28)]`}
            >
              <p className={`${sectionTitleClass} !text-sky-800`}>Withdraw</p>
              <label className={salesFieldGroupClass} htmlFor="daily-bank-withdrawn">
                <span className={labelClass}>Bank Withdraw</span>
                <input
                  id="daily-bank-withdrawn"
                  {...amountFieldProps("next")}
                  value={bankWithdrawn}
                  onChange={(e) => {
                    clearSalesFieldNotice();
                    setBankWithdrawn(sanitizeNonNegativeDecimalInput(e.target.value));
                  }}
                  className={`${amountInputClass} ${bankWithdrawnErr ? FIELD_ERR_INPUT : ""}`}
                  data-field-error-anchor="void:bankWithdrawn"
                  aria-invalid={bankWithdrawnErr ? true : undefined}
                />
                <ExpenseFieldErrorBubble message={bankWithdrawnErr} />
              </label>
            </div>
            <div
              className={`${columnShellClass} min-w-0 w-full !bg-emerald-50/65 ![border-color:rgba(5,150,105,0.28)]`}
            >
                <p className={`${sectionTitleClass} !text-emerald-800`}>Sales</p>
                <div
                  className="flex min-w-0 flex-col gap-3"
                  data-void-attachment-anchor
                >
                <div className={salesChannelGridClass}>
                  <label className={salesFieldGroupClass} htmlFor="daily-cash">
                    <span className={labelClass}>Cash</span>
                    <input
                      id="daily-cash"
                      {...amountFieldProps("next")}
                      value={cashSale}
                      onChange={linkNonNegativeAmount(setCashSale)}
                      className={amountInputClass}
                    />
                  </label>
                  <label className={salesFieldGroupClass} htmlFor="daily-bank">
                    <span className={labelClass}>Bank</span>
                    <input
                      id="daily-bank"
                      {...amountFieldProps("next")}
                      value={bankSale}
                      onChange={linkNonNegativeAmount(setBankSale)}
                      className={amountInputClass}
                    />
                  </label>
                  <label className={salesFieldGroupClass} htmlFor="daily-bkash">
                    <span className={labelClass}>bKash</span>
                    <input
                      id="daily-bkash"
                      {...amountFieldProps("next")}
                      value={bkashSale}
                      onChange={linkNonNegativeAmount(setBkashSale)}
                      className={amountInputClass}
                    />
                  </label>
                  <label className={salesFieldGroupClass} htmlFor="daily-nagad">
                    <span className={labelClass}>Nagad</span>
                    <input
                      id="daily-nagad"
                      {...amountFieldProps("next")}
                      value={nagadSale}
                      onChange={linkNonNegativeAmount(setNagadSale)}
                      className={amountInputClass}
                    />
                  </label>
                  <label className={salesFieldGroupClass} htmlFor="daily-pathao">
                    <span className={labelClass}>Pathao</span>
                    <input
                      id="daily-pathao"
                      {...amountFieldProps("next")}
                      value={pathaoSale}
                      onChange={linkNonNegativeAmount(setPathaoSale)}
                      className={amountInputClass}
                    />
                  </label>
                  <label className={salesFieldGroupClass} htmlFor="daily-foodi">
                    <span className={labelClass}>Foodi</span>
                    <input
                      id="daily-foodi"
                      {...amountFieldProps("next")}
                      value={foodiSale}
                      onChange={linkNonNegativeAmount(setFoodiSale)}
                      className={amountInputClass}
                    />
                  </label>
                  <label className={salesFieldGroupClass} htmlFor="daily-foodpanda">
                    <span className={labelClass}>Foodpanda</span>
                    <input
                      id="daily-foodpanda"
                      {...amountFieldProps("next")}
                      value={foodpandaSale}
                      onChange={linkNonNegativeAmount(setFoodpandaSale)}
                      className={amountInputClass}
                    />
                  </label>
                  <label className={salesFieldGroupClass} htmlFor="daily-void-sale">
                    <span className={labelClass}>Void sales</span>
                    <input
                      id="daily-void-sale"
                      {...amountFieldProps("next")}
                      value={voidSale}
                      onChange={(e) => {
                        clearSalesFieldNotice();
                        setVoidSale(sanitizeNonNegativeDecimalInput(e.target.value));
                      }}
                      className={amountInputClass}
                    />
                  </label>
                </div>
                {parseAmount(voidSale) > 0 ? (
                  <div className="space-y-3">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label className={labelClass} htmlFor="daily-void-remarks">
                        Remarks
                        <span className="text-red-600/90"> *</span>
                      </label>
                      <input
                        id="daily-void-remarks"
                        type="text"
                        value={voidSaleRemarks}
                        onChange={(e) => {
                          clearSalesFieldNotice();
                          setVoidSaleRemarks(e.target.value);
                        }}
                        placeholder="Describe the voided sale"
                        className={`${textInputClass} ${voidRemarksErr ? FIELD_ERR_INPUT : ""}`}
                        data-field-error-anchor="void:voidRemarks"
                        aria-invalid={voidRemarksErr ? true : undefined}
                        aria-required
                      />
                      <ExpenseFieldErrorBubble message={voidRemarksErr} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {renderVoidAttachmentAddControl()}
                      <span className="min-w-0 flex-1 text-[10px] leading-snug text-[var(--pos-text-2)]">
                        Attach PDF or image. Paste an image with this block focused.
                      </span>
                    </div>
                    {voidAttachErr ? (
                      <div data-field-error-anchor="void:voidAttach">
                        <ExpenseFieldErrorBubble message={voidAttachErr} />
                      </div>
                    ) : null}
                    {renderVoidAttachmentThumbnails()}
                  </div>
                ) : null}
                </div>
              </div>
            </div>
          </div>

        </div>
        </fieldset>
            </form>
          </div>
        </div>
      )}

      {historyDetailRow ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-detail-title"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          onClick={() => {
            setHistoryReceiptsOpen(false);
            setHistoryReceiptsLineIndex(null);
            setHistoryDetailRow(null);
          }}
        >
          <div
            className="flex max-h-[720px] w-full max-w-4xl flex-col overflow-hidden rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 space-y-2 border-b border-solid [border-color:var(--pos-divider)] px-4 pb-3 pt-4">
              <div className="flex items-start justify-between gap-2">
                <h2
                  id="history-detail-title"
                  className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
                >
                  Daily entry — {formatDateKeyAsDisplay(historyDetailRow.date)}
                </h2>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[12px] text-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)]"
                  onClick={() => {
                    setHistoryReceiptsOpen(false);
                    setHistoryReceiptsLineIndex(null);
                    setHistoryDetailRow(null);
                  }}
                >
                  Close
                </button>
              </div>
              <p className="text-[10px] text-[var(--pos-text-2)]">
                {historyDetailRow.isLocked ? (
                  <>
                    <Lock className="mr-1 inline size-3 align-text-bottom text-amber-600" strokeWidth={2.25} />
                    Locked
                    {historyDetailRow.lockedAt
                      ? ` ${new Date(historyDetailRow.lockedAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}`
                      : ""}
                    {historyDetailRow.lockedBy ? ` by ${historyDetailRow.lockedBy}` : ""}
                    {historyDetailRow.updatedAt ? " · " : ""}
                  </>
                ) : null}
                {historyDetailRow.updatedAt ? (
                  <>
                    {historyDetailRow.isLocked ? null : "Saved "}
                    {new Date(historyDetailRow.updatedAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </>
                ) : (
                  <>Saved time not recorded for this entry.</>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["Opening", historyDetailRow.openingBalance],
                    ["Net sales", netSalesTotal(historyDetailRow)],
                    ["Expenses total", expenseTotalFromRow(historyDetailRow)],
                    [
                      "Bank Withdraw",
                      historyDetailRow.bankWithdrawn ?? 0,
                    ],
                    [
                      "Bank balance (net − withdrawn)",
                      bankNetAfterWithdrawals(
                        historyDetailRow.bankSale,
                        historyDetailRow.bankWithdrawn ?? 0,
                      ),
                    ],
                    ["Remaining (closing)", historyDetailRow.remainingBalance],
                  ] as const
                ).map(([label, amt]) => (
                  <div
                    key={label}
                    className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-2 py-1.5"
                  >
                    <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
                      {label}
                    </p>
                    <p className="text-[13px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
                      {formatSummaryMoney(amt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <div className="rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className={sectionTitleClass}>Expense lines</p>
                  {totalReceiptCountForRow(historyDetailRow) > 0 ? (
                    <button
                      type="button"
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 text-[11px] font-semibold text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-nav-hover)]/30"
                      onClick={() => {
                        setHistoryReceiptsLineIndex(null);
                        setHistoryReceiptsOpen(true);
                      }}
                    >
                      <Paperclip className="size-3.5" strokeWidth={2.25} aria-hidden />
                      View receipts ({totalReceiptCountForRow(historyDetailRow)})
                    </button>
                  ) : null}
                </div>
                {historyDetailRow.expenseLines && historyDetailRow.expenseLines.length > 0 ? (
                  <div className="overflow-x-auto rounded-[8px] border border-solid [border-color:var(--pos-divider)]">
                    <table className="w-full min-w-[32rem] border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]/40">
                          <th className="px-2 py-1.5 font-semibold text-[var(--pos-text-2)]">#</th>
                          <th className="px-2 py-1.5 font-semibold text-[var(--pos-text-2)]">
                            Expense title
                          </th>
                          <th className="whitespace-nowrap px-2 py-1.5 font-semibold text-[var(--pos-text-2)]">
                            Type
                          </th>
                          <th className="min-w-[6rem] px-2 py-1.5 font-semibold text-[var(--pos-text-2)]">
                            Note
                          </th>
                          <th className="px-2 py-1.5 text-right font-semibold text-[var(--pos-text-2)]">
                            Amount
                          </th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-right font-semibold text-[var(--pos-text-2)]">
                            Receipts
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyDetailRow.expenseLines
                          .filter((line) => !isStaffFineExpenseLine(line))
                          .map((line, idx) => {
                          const kind = savedLineKind(line);
                          const title =
                            kind === "staff"
                              ? staffExpenseLineTitle(line)
                              : kind === "vendor"
                                ? (line.vendor ?? "").trim() || "Supplier"
                                : kind === "purchase"
                                  ? (line.vendor ?? "").trim() || "Purchase"
                                  : (line.label ?? "").trim() || "Regular expense";
                          const noteText =
                            kind === "staff"
                              ? staffExpenseLineNote(line)
                              : kind === "vendor" || kind === "purchase"
                                ? (line.ledgerNote ?? "").trim() ||
                                  (kind === "purchase" && line.items?.length
                                    ? `${line.items.length} item${line.items.length === 1 ? "" : "s"}`
                                    : "")
                                : (line.note ?? "").trim();
                          const rc = receiptCountForLine(line);
                          return (
                            <tr
                              key={`${title}-${idx}`}
                              className="border-b border-solid [border-color:var(--pos-divider)] last:border-b-0"
                            >
                              <td className="px-2 py-1.5 tabular-nums text-[var(--pos-text-2)]">
                                {idx + 1}
                              </td>
                              <td className="max-w-[14rem] px-2 py-1.5 break-words text-[var(--pos-text-1)]">
                                {title}
                              </td>
                              <td className="whitespace-nowrap px-2 py-1.5 text-[var(--pos-text-2)]">
                                {kind === "staff"
                                  ? "Payout"
                                  : kind === "vendor"
                                    ? "Supplier"
                                    : kind === "purchase"
                                      ? "Purchase"
                                      : "Regular"}
                              </td>
                              <td className="max-w-[12rem] px-2 py-1.5 break-words text-[var(--pos-text-2)]">
                                {noteText ? noteText : "—"}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-[var(--pos-text-1)]">
                                {formatMoney(line.amount)}
                              </td>
                              <td className="px-2 py-1.5 text-[var(--pos-text-2)]">
                                {rc > 0 ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className="tabular-nums">{rc}</span>
                                    <button
                                      type="button"
                                      className={`${historyActionBtnClass} !p-1`}
                                      title={`View ${rc} receipt${rc === 1 ? "" : "s"} for this line`}
                                      aria-label={`View ${rc} receipt${rc === 1 ? "" : "s"} for ${title}`}
                                      onClick={() => {
                                        setHistoryReceiptsLineIndex(idx);
                                        setHistoryReceiptsOpen(true);
                                      }}
                                    >
                                      <Eye className="size-3.5" strokeWidth={2.25} aria-hidden />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="text-right">—</div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[var(--pos-card)]/30">
                          <td
                            colSpan={4}
                            className="px-2 py-1.5 text-right font-semibold text-[var(--pos-text-2)]"
                          >
                            Expenses total
                          </td>
                          <td className="px-2 py-1.5 text-right text-[12px] font-semibold tabular-nums text-[var(--pos-text-1)]">
                            {formatSummaryMoney(expenseTotalFromRow(historyDetailRow))}
                          </td>
                          <td className="px-2 py-1.5 text-right text-[var(--pos-text-2)]">—</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (historyDetailRow.expenses ?? 0) > 0 ? (
                  <p className="text-[12px] text-[var(--pos-text-2)]">
                    Legacy total (no line breakdown): {formatMoney(historyDetailRow.expenses)}
                  </p>
                ) : (
                  <p className="text-[12px] text-[var(--pos-text-2)]">No expenses recorded.</p>
                )}
              </div>

              <div className="rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-3">
                <p className={`mb-2 ${sectionTitleClass}`}>Sales by channel</p>
                <div className="overflow-x-auto rounded-[8px] border border-solid [border-color:var(--pos-divider)]">
                  <table className="w-full min-w-[18rem] border-collapse text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]/40">
                        <th className="px-2 py-1.5 font-semibold text-[var(--pos-text-2)]">
                          Channel
                        </th>
                        <th className="px-2 py-1.5 text-right font-semibold text-[var(--pos-text-2)]">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const bankGross = historyDetailRow.bankSale;
                        const bankWithdrawnHist = historyDetailRow.bankWithdrawn ?? 0;
                        const rows: readonly (readonly [string, number])[] = [
                          ["Cash", historyDetailRow.cashSale],
                          ["Bank", bankGross],
                          ...(bankWithdrawnHist > 0
                            ? ([["Bank Withdraw", -bankWithdrawnHist]] as const)
                            : ([] as const)),
                          ["bKash", historyDetailRow.bkashSale],
                          ["Nagad", historyDetailRow.nagadSale],
                          ["Pathao", historyDetailRow.pathaoSale],
                          ["Foodi", historyDetailRow.foodiSale],
                          ["Foodpanda", historyDetailRow.foodpandaSale],
                          ...((historyDetailRow.voidSale ?? 0) > 0
                            ? ([
                                [
                                  "Void sales",
                                  -(historyDetailRow.voidSale ?? 0),
                                ] as const,
                              ] as const)
                            : ([] as const)),
                        ];
                        return rows;
                      })().map(([label, amt]) => (
                        <tr
                          key={label}
                          className="border-b border-solid [border-color:var(--pos-divider)] last:border-b-0"
                        >
                          <td className="px-2 py-1.5 text-[var(--pos-text-2)]">{label}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[var(--pos-text-1)]">
                            {formatSummaryMoney(amt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[var(--pos-card)]/30">
                        <td className="px-2 py-1.5 font-semibold text-[var(--pos-text-2)]">
                          Net sales
                        </td>
                        <td className="px-2 py-1.5 text-right text-[12px] font-semibold tabular-nums text-[var(--pos-text-1)]">
                          {formatSummaryMoney(netSalesTotal(historyDetailRow))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {(historyDetailRow.voidSale ?? 0) > 0 ||
              (historyDetailRow.voidSaleRemarks ?? "").trim() ||
              (historyDetailRow.voidSaleAttachmentDataUrls?.length ?? 0) > 0 ? (
                <div className="rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-3">
                  <p className={`mb-2 ${sectionTitleClass}`}>Void sales detail</p>
                  {(historyDetailRow.voidSale ?? 0) > 0 ? (
                    <p className="mb-2 text-[12px] tabular-nums text-[var(--pos-text-1)]">
                      <span className="font-semibold text-[var(--pos-text-2)]">Amount: </span>
                      {formatMoney(historyDetailRow.voidSale ?? 0)}
                    </p>
                  ) : null}
                  {(historyDetailRow.voidSaleRemarks ?? "").trim() ? (
                    <p className="mb-2 whitespace-pre-wrap text-[12px] leading-snug text-[var(--pos-text-1)]">
                      <span className="font-semibold text-[var(--pos-text-2)]">Remarks: </span>
                      {(historyDetailRow.voidSaleRemarks ?? "").trim()}
                    </p>
                  ) : null}
                  {(historyDetailRow.voidSaleAttachmentDataUrls?.length ?? 0) > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {(historyDetailRow.voidSaleAttachmentDataUrls ?? []).map((url, vi) => (
                        <button
                          key={`void-h-${vi}`}
                          type="button"
                          className="block overflow-hidden rounded-[8px] border border-solid [border-color:var(--pos-divider)] ring-offset-1 hover:ring-2 hover:ring-[var(--pos-sb-base)]/45"
                          onClick={() => setReceiptPreviewUrl(url)}
                          aria-label={
                            isPdfDataUrl(url)
                              ? `View void sales PDF ${vi + 1}`
                              : `View void sales attachment ${vi + 1}`
                          }
                        >
                          {isPdfDataUrl(url) ? (
                            <span className="flex size-[5.5rem] flex-col items-center justify-center gap-0.5 bg-[var(--pos-card)] text-[var(--pos-text-2)] sm:size-28">
                              <FileText className="size-8" strokeWidth={2} aria-hidden />
                              <span className="text-[9px] font-semibold uppercase">PDF</span>
                            </span>
                          ) : (
                            <img
                              src={url}
                              alt=""
                              className="size-[5.5rem] object-cover sm:size-28"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2 border-t border-solid [border-color:var(--pos-divider)] px-4 py-3">
              <button
                type="button"
                className="inline-flex h-9 min-w-[7rem] items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30"
                onClick={() => {
                  setHistoryReceiptsOpen(false);
                  setHistoryReceiptsLineIndex(null);
                  setHistoryDetailRow(null);
                }}
              >
                Done
              </button>
              <button
                type="button"
                className="inline-flex h-9 min-w-[7rem] items-center justify-center rounded-[8px] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--pos-sb-base)" }}
                onClick={() => {
                  if (!historyDetailRow) return;
                  openEntryForDate(historyDetailRow.date);
                  setHistoryReceiptsOpen(false);
                  setHistoryReceiptsLineIndex(null);
                  setHistoryDetailRow(null);
                }}
              >
                {historyDetailRow.isLocked ? "View in form" : "Edit in form"}
              </button>
              {!historyDetailRow.isLocked ? (
                <button
                  type="button"
                  disabled={isLocking}
                  className="inline-flex h-9 min-w-[7rem] items-center justify-center gap-1.5 rounded-[8px] border border-solid border-amber-500/50 bg-amber-500/10 px-3 text-[12px] font-semibold text-amber-800 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => openLockEntryModal(historyDetailRow.date)}
                >
                  <Lock className="size-3.5" strokeWidth={2.25} />
                  Lock entry
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isUnlocking}
                  className="inline-flex h-9 min-w-[7rem] items-center justify-center gap-1.5 rounded-[8px] border border-solid border-emerald-500/50 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-800 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => openUnlockEntryModal(historyDetailRow.date)}
                >
                  <LockOpen className="size-3.5" strokeWidth={2.25} />
                  Unlock entry
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {historyDetailRow && historyReceiptsOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-receipts-title"
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => {
            setHistoryReceiptsOpen(false);
            setHistoryReceiptsLineIndex(null);
          }}
        >
          <div
            className="flex max-h-[704px] w-full max-w-2xl flex-col overflow-hidden rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
              <div>
                <h2
                  id="history-receipts-title"
                  className="text-[14px] font-semibold leading-tight text-[var(--pos-text-1)]"
                >
                  {historyReceiptsLineIndex === null
                    ? "Receipts"
                    : `Receipts — line ${historyReceiptsLineIndex + 1}`}
                </h2>
                <p className="mt-0.5 text-[11px] text-[var(--pos-text-2)]">
                  {formatDateKeyAsDisplay(historyDetailRow.date)}
                  {historyReceiptsLineIndex === null
                    ? " — tap an image to enlarge"
                    : " — receipts for this expense line only"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-[12px] text-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)]"
                onClick={() => {
                  setHistoryReceiptsOpen(false);
                  setHistoryReceiptsLineIndex(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-3">
              {historyDetailRow.expenseLines
                ?.filter((line) => !isStaffFineExpenseLine(line))
                .map((line, idx) => {
                const urls = line.receiptDataUrls ?? [];
                if (urls.length === 0) return null;
                if (historyReceiptsLineIndex !== null && idx !== historyReceiptsLineIndex) {
                  return null;
                }
                const kind = savedLineKind(line);
                const title =
                  kind === "staff"
                    ? staffExpenseLineTitle(line)
                    : kind === "vendor"
                      ? (line.vendor ?? "").trim() || "Supplier"
                      : kind === "purchase"
                        ? (line.vendor ?? "").trim() || "Purchase"
                        : (line.label ?? "").trim() || "Regular expense";
                const lineNote =
                  kind === "staff"
                    ? staffExpenseLineNote(line)
                    : kind === "vendor" || kind === "purchase"
                      ? (line.ledgerNote ?? "").trim()
                      : (line.note ?? "").trim();
                return (
                  <section key={`receipt-block-${idx}`} className="space-y-2">
                    <p className="text-[11px] font-semibold text-[var(--pos-text-1)]">
                      {title}{" "}
                      <span className="font-normal text-[var(--pos-text-2)]">
                        · {formatMoney(line.amount)}
                      </span>
                    </p>
                    {lineNote ? (
                      <p className="text-[10px] leading-snug text-[var(--pos-text-2)]">{lineNote}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {urls.map((url, ri) => (
                        <button
                          key={`${idx}-g-${ri}`}
                          type="button"
                          className="block overflow-hidden rounded-[8px] border border-solid [border-color:var(--pos-divider)] ring-offset-1 hover:ring-2 hover:ring-[var(--pos-sb-base)]/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pos-sb-base)]"
                          onClick={() => setReceiptPreviewUrl(url)}
                          aria-label={`View receipt ${ri + 1} for ${title}`}
                        >
                          <img
                            src={url}
                            alt=""
                            className="size-[5.5rem] object-cover sm:size-28"
                          />
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="shrink-0 border-t border-solid [border-color:var(--pos-divider)] px-4 py-3">
              <button
                type="button"
                className="inline-flex h-9 min-w-[7rem] items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30"
                onClick={() => {
                  setHistoryReceiptsOpen(false);
                  setHistoryReceiptsLineIndex(null);
                }}
              >
                Back to summary
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {receiptPreviewUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Receipt preview"
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-black/85 p-4"
          onClick={() => setReceiptPreviewUrl(null)}
        >
          <button
            type="button"
            className="absolute right-3 top-3 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white/90 hover:bg-white/10"
            onClick={() => setReceiptPreviewUrl(null)}
          >
            Close
          </button>
          <ReceiptPreviewBody mediaRef={receiptPreviewUrl} />
          <p className="mt-3 max-w-lg text-center text-[11px] text-white/60">
            Tap outside or press Escape to close
          </p>
        </div>
      ) : null}

      {pendingLeave ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-daily-entry-title"
          className="fixed inset-0 z-[140] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={cancelDiscardLeave}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="unsaved-daily-entry-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              Discard unsaved changes?
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
              You have unsaved changes for{" "}
              <span className="font-semibold text-[var(--pos-text-1)]">
                {formatDateKeyAsDisplay(dateKey)}
              </span>
              . Leaving now will discard them. Save first if you want to keep this entry.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                onClick={cancelDiscardLeave}
              >
                Stay
              </button>
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid border-red-500/55 bg-red-600 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 sm:flex-none"
                onClick={confirmDiscardLeave}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {categoryModalLineId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-expense-category-title"
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => {
            if (!categoryModalBusy) {
              setCategoryModalLineId(null);
              setCategoryModalName("");
              setCategoryModalError(null);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="new-expense-category-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              New expense category
            </h2>
            <p className="mt-1.5 text-[12px] leading-snug text-[var(--pos-text-2)]">
              Used for Other Expenses and Daily Entry. You can reuse it anytime.
            </p>
            <label className="mt-3 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[var(--pos-text-2)]">Name</span>
              <input
                type="text"
                autoFocus
                value={categoryModalName}
                onChange={(e) => {
                  setCategoryModalName(e.target.value);
                  if (categoryModalError) setCategoryModalError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const btn = document.getElementById("new-expense-category-save");
                    btn?.click();
                  }
                }}
                placeholder="e.g. Utilities"
                className="h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 text-[13px] text-[var(--pos-text-1)] outline-none focus:border-[var(--pos-sb-base)]"
                aria-label="Category name"
              />
            </label>
            {categoryModalError ? (
              <p role="alert" className="mt-2 text-[12px] text-red-700">
                {categoryModalError}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                disabled={categoryModalBusy}
                onClick={() => {
                  setCategoryModalLineId(null);
                  setCategoryModalName("");
                  setCategoryModalError(null);
                }}
              >
                Cancel
              </button>
              <button
                id="new-expense-category-save"
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                style={{ backgroundColor: "var(--pos-sb-base)" }}
                disabled={categoryModalBusy || !categoryModalName.trim()}
                onClick={() => {
                  const name = categoryModalName.trim();
                  const lineId = categoryModalLineId;
                  if (!name || !lineId) return;
                  void (async () => {
                    setCategoryModalBusy(true);
                    setCategoryModalError(null);
                    try {
                      const existing = expenseCategories.find(
                        (c) => c.name.toLowerCase() === name.toLowerCase(),
                      );
                      if (existing) {
                        patchLine(lineId, { expenseCategoryId: existing.id });
                        setCategoryModalLineId(null);
                        setCategoryModalName("");
                        return;
                      }
                      const created = await createExpenseCategory(name);
                      setExpenseCategories((prev) =>
                        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
                      );
                      patchLine(lineId, { expenseCategoryId: created.id });
                      setCategoryModalLineId(null);
                      setCategoryModalName("");
                    } catch {
                      setCategoryModalError("Could not create category. Try again.");
                    } finally {
                      setCategoryModalBusy(false);
                    }
                  })();
                }}
              >
                {categoryModalBusy ? "Saving…" : "Save category"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {openingEditWarningOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="opening-edit-warning-title"
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={cancelOpeningBalanceEditWarning}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="opening-edit-warning-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              Change opening balance?
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
              It&apos;s{" "}
              <span className="font-semibold tabular-nums text-[var(--pos-text-1)]">
                {formatSummaryMoney(parseAmount(openingBalance))}
              </span>{" "}
              right now
              {carriedOpening.sourceDate &&
              parseAmount(openingBalance) === carriedOpeningFromPrevDay ? (
                <> — from {formatDateKeyAsDisplay(carriedOpening.sourceDate)}</>
              ) : null}
              {!carriedOpening.sourceDate &&
              !savedRowForDate &&
              parseAmount(openingBalance) === carriedOpeningFromPrevDay ? (
                <> — no earlier day saved</>
              ) : null}
              . Changing it also changes closing balance.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                onClick={cancelOpeningBalanceEditWarning}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid border-amber-500/55 bg-amber-500/90 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 sm:flex-none"
                onClick={confirmOpeningBalanceEdit}
              >
                Change
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingLockDateIso ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lock-entry-title"
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={closeLockEntryModal}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="lock-entry-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              Lock daily entry?
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
              Once locked, the entry for{" "}
              <span className="font-semibold text-[var(--pos-text-1)]">
                {formatDateKeyAsDisplay(pendingLockDateIso)}
              </span>{" "}
              cannot be edited or deleted.
            </p>
            {lockError ? (
              <p
                className="mt-3 rounded-[8px] border border-solid border-red-500/40 bg-red-50 px-3 py-2 text-[12px] font-medium leading-snug text-red-800"
                role="alert"
              >
                {lockError}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                onClick={closeLockEntryModal}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isLocking}
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-solid border-amber-500/55 bg-amber-500/90 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                onClick={() => executeLockHistoryEntry(pendingLockDateIso)}
              >
                <Lock className="size-3.5" strokeWidth={2.25} />
                {isLocking ? "Locking…" : "Lock entry"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingUnlockDateIso ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unlock-entry-title"
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={closeUnlockEntryModal}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="unlock-entry-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              Unlock daily entry?
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
              Unlocking allows editing and deleting the entry for{" "}
              <span className="font-semibold text-[var(--pos-text-1)]">
                {formatDateKeyAsDisplay(pendingUnlockDateIso)}
              </span>{" "}
              again.
            </p>
            {unlockError ? (
              <p
                className="mt-3 rounded-[8px] border border-solid border-red-500/40 bg-red-50 px-3 py-2 text-[12px] font-medium leading-snug text-red-800"
                role="alert"
              >
                {unlockError}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                onClick={closeUnlockEntryModal}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUnlocking}
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-solid border-emerald-600/55 bg-emerald-600/90 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                onClick={() => executeUnlockHistoryEntry(pendingUnlockDateIso)}
              >
                <LockOpen className="size-3.5" strokeWidth={2.25} />
                {isUnlocking ? "Unlocking…" : "Unlock entry"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteDateIso ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-entry-title"
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={closeDeleteEntryModal}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-entry-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              Delete daily entry?
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
              This removes the saved entry for{" "}
              <span className="font-semibold text-[var(--pos-text-1)]">
                {formatDateKeyAsDisplay(pendingDeleteDateIso)}
              </span>{" "}
              from this device. This cannot be undone.
            </p>
            <label className={`${labelClass} mt-4`}>
              Type <span className="text-[var(--pos-text-1)]">Delete</span> to confirm
              <input
                ref={deleteConfirmInputRef}
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (deleteConfirmText === "Delete") {
                    executeDeleteHistoryEntry(pendingDeleteDateIso);
                  }
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder="Delete"
                aria-label="Type Delete to confirm removal"
                className={`${textInputClass} mt-1`}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                onClick={closeDeleteEntryModal}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== "Delete"}
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid border-red-600/55 bg-red-600/90 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                onClick={() => executeDeleteHistoryEntry(pendingDeleteDateIso)}
              >
                Delete entry
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
