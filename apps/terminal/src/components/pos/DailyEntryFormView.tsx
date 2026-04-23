import {
  CalendarDays,
  Eye,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Search,
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
  type InputHTMLAttributes,
} from "react";
import {
  commitLedgerFromDailyExpenseLine,
  EMPLOYEE_LEDGER_LINE_OPTIONS,
  getLedgerBookNamesSnapshot,
  isEmployeesLedgerSupplierId,
  LEDGER_DRAWER_KINDS,
  removeDailyLedgerExpenseLink,
  resolveLedgerSupplierIdByBookName,
  subscribeLedgerWorkspace,
  validateDailyExpenseLedgerAmount,
  type EmployeeLedgerLineKind,
} from "./LedgerModuleView";
import {
  type DailyEntryRow,
  type ExpenseLineSaved,
  listDailyEntriesDescending,
  readDailyEntryMap,
  savedLineKind,
  seedDummyDailyEntriesIfEmpty,
  writeDailyEntryMap,
} from "../../lib/dailyEntryStorage";
import { useDevAuth } from "../../context/DevAuthContext";

type ExpenseLineDraft = {
  id: string;
  kind: "vendor" | "regular";
  vendor: string;
  /** Regular expense title (no vendor) */
  label: string;
  /** Regular expense memo (vendor lines leave empty). */
  note: string;
  amount: string;
  receiptDataUrls: string[];
  /** Vendor lines: optional Bills & payments row on save (same book, amount, entry date). */
  ledgerKind: "" | NonNullable<ExpenseLineSaved["ledgerKind"]>;
  /** Staff ledger books — salary, rent, etc. When set, line posts like Ledger Management staff flow. */
  ledgerEmployeeLineKind: "" | EmployeeLedgerLineKind;
  ledgerNote: string;
};

const MAX_RECEIPTS_PER_LINE = 4;
const MAX_VOID_ATTACHMENTS = 4;
const MAX_RECEIPT_BYTES = 2_500_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Only image files can be attached as receipts."));
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      reject(
        new Error(
          `Each receipt image must be under ${(MAX_RECEIPT_BYTES / 1_000_000).toFixed(1)} MB.`,
        ),
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read the image."));
    };
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}

function isPdfOrImageFile(file: File): boolean {
  return file.type.startsWith("image/") || file.type === "application/pdf";
}

/** Void-sales attachments: PDF or images (stored as data URLs). */
function readVoidAttachmentAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isPdfOrImageFile(file)) {
      reject(new Error("Only PDF or image files can be attached."));
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      reject(
        new Error(
          `Each file must be under ${(MAX_RECEIPT_BYTES / 1_000_000).toFixed(1)} MB.`,
        ),
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read the file."));
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

function isPdfDataUrl(url: string): boolean {
  return url.startsWith("data:application/pdf");
}

function clipboardImageFilesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  if (data.items?.length) {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.kind !== "file") continue;
      if (!item.type.startsWith("image/")) continue;
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length === 0 && data.files?.length) {
    for (let i = 0; i < data.files.length; i++) {
      const f = data.files[i];
      if (f.type.startsWith("image/")) files.push(f);
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

async function mergeReceiptDataUrls(
  existing: readonly string[],
  files: readonly File[],
): Promise<{ ok: true; urls: string[] } | { ok: false; message: string }> {
  const room = MAX_RECEIPTS_PER_LINE - existing.length;
  if (room <= 0) {
    return {
      ok: false,
      message: `At most ${MAX_RECEIPTS_PER_LINE} receipt images per expense line.`,
    };
  }
  const next = [...existing];
  const slice = files.slice(0, room);
  try {
    for (const file of slice) {
      next.push(await readFileAsDataUrl(file));
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not add receipt image.",
    };
  }
  return { ok: true, urls: next };
}

async function mergeVoidAttachmentDataUrls(
  existing: readonly string[],
  files: readonly File[],
): Promise<{ ok: true; urls: string[] } | { ok: false; message: string }> {
  const room = MAX_VOID_ATTACHMENTS - existing.length;
  if (room <= 0) {
    return {
      ok: false,
      message: `At most ${MAX_VOID_ATTACHMENTS} attachments for void sales.`,
    };
  }
  const next = [...existing];
  const slice = files.slice(0, room);
  try {
    for (const file of slice) {
      next.push(await readVoidAttachmentAsDataUrl(file));
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

const inputClass =
  "h-8 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-[12px] tabular-nums text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none";
const textInputClass =
  "h-8 w-full min-w-0 rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none";
const selectClass =
  "h-8 w-full min-w-0 cursor-pointer rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none";
const labelClass =
  "flex min-w-0 flex-col gap-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]";
const sectionTitleClass =
  "text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--pos-text-2)]";
const columnShellClass =
  "flex min-h-0 min-w-0 flex-col gap-2 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-2";
const statCardClass =
  "flex min-w-0 flex-col gap-0.5 rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] sm:p-3";
const editOpeningBtnClass =
  "inline-flex shrink-0 items-center justify-center rounded-md p-1 text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-nav-hover)]/50 hover:text-[var(--pos-text-1)]";

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
    vendor: "",
    label: "",
    note: "",
    amount: "",
    receiptDataUrls: [],
    ledgerKind: "",
    ledgerEmployeeLineKind: "",
    ledgerNote: "",
  };
}

function newRegularExpenseLine(): ExpenseLineDraft {
  return {
    id: newLineId(),
    kind: "regular",
    vendor: "",
    label: "",
    note: "",
    amount: "",
    receiptDataUrls: [],
    ledgerKind: "",
    ledgerEmployeeLineKind: "",
    ledgerNote: "",
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dateAddDays(dateKey: string, days: number) {
  const parts = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  const [y, m, d] = parts;
  if (!y || !m || !d) return dateKey;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** `dateKey` is YYYY-MM-DD; returns e.g. `09-Apr-2026`. */
function formatDateKeyAsDisplay(dateKey: string): string {
  const parts = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  const [y, m, d] = parts;
  if (!y || !m || m < 1 || m > 12 || !d || d < 1 || d > 31) return dateKey;
  const mon = MONTH_ABBR[m - 1];
  if (!mon) return dateKey;
  const dd = String(d).padStart(2, "0");
  return `${dd}-${mon}-${y}`;
}

/** Parses `DD-MMM-YYYY` (English month abbr, case-insensitive) to YYYY-MM-DD or null. */
function parseDisplayDateToKey(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, "");
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const day = Number.parseInt(match[1], 10);
  const monToken = match[2].toLowerCase();
  const year = Number.parseInt(match[3], 10);
  const monthIndex = MONTH_ABBR.findIndex((abbr) => abbr.toLowerCase() === monToken);
  if (
    monthIndex === -1 ||
    !Number.isFinite(day) ||
    day < 1 ||
    day > 31 ||
    !Number.isFinite(year)
  ) {
    return null;
  }
  const dt = new Date(Date.UTC(year, monthIndex, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== monthIndex ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt.toISOString().slice(0, 10);
}

function parseAmount(raw: string): number {
  const n = Number.parseFloat(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

type ExpenseFieldPart =
  | "vendor"
  | "amount"
  | "label"
  | "attach"
  | "ledgerKind"
  | "ledgerNote"
  | "note";

type SalesFieldPart = "voidRemarks" | "voidAttach";

type FormNotice =
  | { kind: "none" }
  | { kind: "global"; message: string }
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
): { message: string; lineId: string; part: ExpenseFieldPart } | null {
  for (const line of lines) {
    if (line.kind === "vendor") {
      if (parseAmount(line.amount) > 0 && !line.vendor.trim()) {
        return {
          message: "Select or enter a ledger book name, or remove this row.",
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
      const isEmp = Boolean(supplierId && isEmployeesLedgerSupplierId(supplierId));
      if (noteTrim && !isEmp && !line.ledgerKind) {
        return {
          message: "Select a ledger entry type, or clear the note.",
          lineId: line.id,
          part: "ledgerKind",
        };
      }
      if (noteTrim && isEmp && !line.ledgerEmployeeLineKind) {
        return {
          message: "Select a payment or deal type, or clear the note.",
          lineId: line.id,
          part: "ledgerKind",
        };
      }
      if (isEmp ? line.ledgerEmployeeLineKind : line.ledgerKind) {
        if (!supplierId) {
          return {
            message: "Ledger posting needs a book name that matches Ledger Management.",
            lineId: line.id,
            part: "vendor",
          };
        }
        const ledgerAmtErr = validateDailyExpenseLedgerAmount({
          supplierId,
          amountStr: line.amount,
          kind: isEmp
            ? "payment"
            : (line.ledgerKind as NonNullable<ExpenseLineSaved["ledgerKind"]>),
          employeeLineKind: isEmp ? line.ledgerEmployeeLineKind : "",
        });
        if (ledgerAmtErr) {
          return {
            message: ledgerAmtErr,
            lineId: line.id,
            part: "amount",
          };
        }
      }
    } else {
      if (parseAmount(line.amount) > 0 && !line.label.trim()) {
        return {
          message: "Enter an expense title.",
          lineId: line.id,
          part: "label",
        };
      }
      if (line.label.trim() && parseAmount(line.amount) <= 0) {
        return {
          message: "Enter an amount for this expense.",
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
const FIELD_ERR_VENDOR_COL = "rounded-[8px] ring-2 ring-red-500/35 ring-offset-0";
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

function expenseTotalFromRow(r: DailyEntryRow): number {
  if (r.expenseLines && r.expenseLines.length > 0) {
    return r.expenseLines.reduce((s, line) => s + line.amount, 0);
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
  if (!line || line.kind !== "vendor") return false;
  const v = line.vendor.trim();
  if (!v) return false;
  const sid = resolveLedgerSupplierIdByBookName(v);
  if (sid && isEmployeesLedgerSupplierId(sid)) return Boolean(line.ledgerEmployeeLineKind);
  return Boolean(line.ledgerKind);
}

function savedLinePostsToLedger(line: ExpenseLineSaved): boolean {
  if (savedLineKind(line) !== "vendor") return false;
  const v = (line.vendor ?? "").trim();
  if (!v) return false;
  const sid = resolveLedgerSupplierIdByBookName(v);
  if (sid && isEmployeesLedgerSupplierId(sid)) {
    return Boolean(line.ledgerEmployeeLineKind && line.ledgerKind);
  }
  return Boolean(line.ledgerKind);
}

/** Multiset key for vendor expense rows that post to the ledger (dedupe commits vs prior save). */
function vendorLedgerFingerprintSaved(line: ExpenseLineSaved): string | null {
  if (!savedLinePostsToLedger(line)) return null;
  const v = (line.vendor ?? "").trim();
  const sid = resolveLedgerSupplierIdByBookName(v);
  const note = (line.ledgerNote ?? "").trim();
  if (sid && isEmployeesLedgerSupplierId(sid)) {
    return `${v}\0${line.amount}\0${line.ledgerEmployeeLineKind}\0${note}`;
  }
  return `${v}\0${line.amount}\0${line.ledgerKind!}\0${note}`;
}

function vendorLedgerFingerprintDraft(line: ExpenseLineDraft): string | null {
  if (!draftLinePostsToLedger(line)) return null;
  const v = line.vendor.trim();
  const sid = resolveLedgerSupplierIdByBookName(v);
  const amt = parseAmount(line.amount);
  if (sid && isEmployeesLedgerSupplierId(sid)) {
    return `${v}\0${amt}\0${line.ledgerEmployeeLineKind}\0${line.ledgerNote.trim()}`;
  }
  return `${v}\0${amt}\0${line.ledgerKind}\0${line.ledgerNote.trim()}`;
}

function normalizeExpenseLinesForCompare(lines: ExpenseLineSaved[] | undefined): string {
  const rows = [...(lines ?? [])].map((line) => {
    const kind = savedLineKind(line);
    return {
      kind,
      lineId: line.lineId ?? "",
      vendor: kind === "vendor" ? (line.vendor ?? "").trim() : "",
      label: kind === "regular" ? (line.label ?? "").trim() : "",
      amount: line.amount,
      receipts: normalizeReceiptUrls(line.receiptDataUrls),
      ledgerKind: kind === "vendor" ? (line.ledgerKind ?? "") : "",
      ledgerEmployeeLineKind:
        kind === "vendor" ? (line.ledgerEmployeeLineKind ?? "") : "",
      ledgerNote: kind === "vendor" ? (line.ledgerNote ?? "").trim() : "",
      note: kind === "regular" ? (line.note ?? "").trim() : "",
    };
  });
  rows.sort((a, b) =>
    `${a.kind}\0${a.lineId}\0${a.vendor}\0${a.label}\0${a.amount}\0${a.ledgerKind}\0${a.ledgerEmployeeLineKind}\0${a.ledgerNote}\0${a.note}`.localeCompare(
      `${b.kind}\0${b.lineId}\0${b.vendor}\0${b.label}\0${b.amount}\0${b.ledgerKind}\0${b.ledgerEmployeeLineKind}\0${b.ledgerNote}\0${b.note}`,
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
    if (savedLineKind(base) !== "vendor") return base;

    const lineId = base.lineId;
    const draft = lineId ? draftById.get(lineId) : undefined;
    const priorLine = lineId ? priorByLineId.get(lineId) : undefined;

    if (!savedLinePostsToLedger(base) || !draftLinePostsToLedger(draft)) {
      if (priorLine?.ledgerLink) {
        removeDailyLedgerExpenseLink(priorLine.ledgerLink);
      }
      return base;
    }
    if (!draft) return base;

    const fpDraft = vendorLedgerFingerprintDraft(draft);
    const fpPrior = priorLine && savedLinePostsToLedger(priorLine)
      ? vendorLedgerFingerprintSaved(priorLine)
      : null;

    if (priorLine?.ledgerLink && fpPrior === fpDraft) {
      return { ...base, ledgerLink: priorLine.ledgerLink };
    }

    const supplierId = resolveLedgerSupplierIdByBookName(draft.vendor.trim());
    if (!supplierId) {
      failed = true;
      return { ...base, ledgerLink: priorLine?.ledgerLink };
    }

    const isEmp = isEmployeesLedgerSupplierId(supplierId);
    const res = commitLedgerFromDailyExpenseLine({
      supplierId,
      entryDateIso: dateKey,
      amountStr: draft.amount,
      kind: isEmp ? "payment" : (draft.ledgerKind as NonNullable<ExpenseLineSaved["ledgerKind"]>),
      notes: draft.ledgerNote,
      ...(isEmp
        ? { employeeLineKind: draft.ledgerEmployeeLineKind as EmployeeLedgerLineKind }
        : {}),
    });

    if (!res.ok) {
      failed = true;
      return { ...base, ledgerLink: priorLine?.ledgerLink };
    }

    if (priorLine?.ledgerLink) {
      removeDailyLedgerExpenseLink(priorLine.ledgerLink);
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
    if (savedLineKind(pl) !== "vendor") continue;
    if (baseLineIds.has(pl.lineId)) continue;
    removeDailyLedgerExpenseLink(pl.ledgerLink);
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
    prior.pathaoSale === next.pathaoSale &&
    prior.foodiSale === next.foodiSale &&
    prior.foodpandaSale === next.foodpandaSale &&
    priorVoid === nextVoid &&
    (prior.voidSaleRemarks ?? "").trim() === (next.voidSaleRemarks ?? "").trim() &&
    normalizeVoidSaleAttachments(prior.voidSaleAttachmentDataUrls) ===
      normalizeVoidSaleAttachments(next.voidSaleAttachmentDataUrls) &&
    prior.remainingBalance === next.remainingBalance &&
    normalizeExpenseLinesForCompare(prior.expenseLines) ===
      normalizeExpenseLinesForCompare(next.expenseLines) &&
    (prior.enteredBy ?? "") === (next.enteredBy ?? "")
  );
}

function draftsFromRow(r: DailyEntryRow): ExpenseLineDraft[] {
  if (r.expenseLines && r.expenseLines.length > 0) {
    return r.expenseLines.map((line) => {
      const kind = savedLineKind(line);
      return {
        id: line.lineId ?? newLineId(),
        kind,
        vendor: kind === "vendor" ? (line.vendor ?? "") : "",
        label: kind === "regular" ? (line.label ?? "") : "",
        amount: line.amount === 0 ? "" : String(line.amount),
        receiptDataUrls: [...(line.receiptDataUrls ?? [])],
        ledgerKind: kind === "vendor" && line.ledgerKind ? line.ledgerKind : "",
        ledgerEmployeeLineKind:
          kind === "vendor" && line.ledgerEmployeeLineKind
            ? line.ledgerEmployeeLineKind
            : "",
        ledgerNote: kind === "vendor" ? (line.ledgerNote ?? "") : "",
        note: kind === "regular" ? (line.note ?? "") : "",
      };
    });
  }
  if ((r.expenses ?? 0) > 0) {
    return [
      {
        id: newLineId(),
        kind: "vendor",
        vendor: "Legacy total",
        label: "",
        note: "",
        amount: String(r.expenses),
        receiptDataUrls: [],
        ledgerKind: "",
        ledgerEmployeeLineKind: "",
        ledgerNote: "",
      },
    ];
  }
  return [];
}

function computeRemainingFromParts(
  openingBalance: string,
  sales: {
    cashSale: string;
    bankSale: string;
    bkashSale: string;
    pathaoSale: string;
    foodiSale: string;
    foodpandaSale: string;
    voidSale: string;
  },
  expenseLineDrafts: ExpenseLineDraft[],
): number {
  const salesSum =
    parseAmount(sales.cashSale) +
    parseAmount(sales.bankSale) +
    parseAmount(sales.bkashSale) +
    parseAmount(sales.pathaoSale) +
    parseAmount(sales.foodiSale) +
    parseAmount(sales.foodpandaSale);
  const voidAmt = Math.max(0, parseAmount(sales.voidSale));
  const expenseSum = expenseLineDrafts.reduce((s, line) => s + parseAmount(line.amount), 0);
  return parseAmount(openingBalance) + salesSum - voidAmt - expenseSum;
}

function buildVendorOptions(
  draftLines: ExpenseLineDraft[],
  ledgerBookNames: readonly string[],
): string[] {
  const set = new Set<string>([...ledgerBookNames]);
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
    r.pathaoSale +
    r.foodiSale +
    r.foodpandaSale
  );
}

function netSalesTotal(r: DailyEntryRow): number {
  const gross = salesTotal(r);
  const voidAmt = Math.max(0, r.voidSale ?? 0);
  return gross - voidAmt;
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
  remaining: string;
  cash: string;
  bank: string;
  bkash: string;
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
    const k = savedLineKind(line);
    if (k === "vendor") {
      vendors.push((line.vendor ?? "").trim());
      expenseNotes.push((line.ledgerNote ?? "").trim());
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
    amountSearchText(r.remainingBalance),
    cashS,
    bankS,
    bkashS,
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
    remaining: amountSearchText(r.remainingBalance),
    cash: cashS.toLowerCase(),
    bank: bankS.toLowerCase(),
    bkash: bkashS.toLowerCase(),
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
  vendor: "vendor",
  v: "vendor",
  title: "title",
  regular: "title",
  expense: "expenses",
  expenses: "expenses",
  opening: "opening",
  sales: "sales",
  remaining: "remaining",
  cash: "cash",
  bank: "bank",
  bkash: "bkash",
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
  "type" | "inputMode" | "step" | "autoComplete" | "enterKeyHint"
> {
  return {
    type: "number",
    inputMode: "decimal",
    step: "any",
    autoComplete: "off",
    enterKeyHint: enterKeyHint,
  };
}

export function DailyEntryFormView() {
  const { userName } = useDevAuth();
  const [activeView, setActiveView] = useState<"entry" | "history">("history");
  const [savedListVersion, setSavedListVersion] = useState(0);
  const [dateKey, setDateKey] = useState(todayKey);
  const [dateFieldText, setDateFieldText] = useState(() => formatDateKeyAsDisplay(todayKey()));
  const [openingBalance, setOpeningBalance] = useState("0");
  const [cashSale, setCashSale] = useState("0");
  const [bankSale, setBankSale] = useState("0");
  const [bkashSale, setBkashSale] = useState("0");
  const [pathaoSale, setPathaoSale] = useState("0");
  const [foodiSale, setFoodiSale] = useState("0");
  const [foodpandaSale, setFoodpandaSale] = useState("0");
  const [voidSale, setVoidSale] = useState("0");
  const [voidSaleRemarks, setVoidSaleRemarks] = useState("");
  const [voidSaleAttachmentUrls, setVoidSaleAttachmentUrls] = useState<string[]>([]);
  const [expenseLines, setExpenseLines] = useState<ExpenseLineDraft[]>(() => []);
  const [formNotice, setFormNotice] = useState<FormNotice>({ kind: "none" });
  const [openingEdit, setOpeningEdit] = useState(false);
  const [historyDetailRow, setHistoryDetailRow] = useState<DailyEntryRow | null>(null);
  const [historyReceiptsOpen, setHistoryReceiptsOpen] = useState(false);
  /** When set, receipts gallery shows only this expense line index; `null` = all lines with receipts. */
  const [historyReceiptsLineIndex, setHistoryReceiptsLineIndex] = useState<number | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [pendingDeleteDateIso, setPendingDeleteDateIso] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const openingInputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);
  const deleteConfirmInputRef = useRef<HTMLInputElement>(null);
  const expenseLinesRef = useRef<ExpenseLineDraft[]>(expenseLines);
  expenseLinesRef.current = expenseLines;
  const voidSaleAttachmentUrlsRef = useRef<string[]>(voidSaleAttachmentUrls);
  voidSaleAttachmentUrlsRef.current = voidSaleAttachmentUrls;
  /** Regular expense lines whose note field is expanded (or opened via pencil). */
  const [regularNoteOpenIds, setRegularNoteOpenIds] = useState(() => new Set<string>());
  const regularNoteInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const historyRows = useMemo(() => listDailyEntriesDescending(), [
    savedListVersion,
    activeView,
  ]);

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

  useEffect(() => {
    if (seedDummyDailyEntriesIfEmpty()) setSavedListVersion((v) => v + 1);
  }, []);

  const savedRowForDate = useMemo(
    () => readDailyEntryMap()[dateKey],
    [dateKey, savedListVersion],
  );

  const ledgerBookNames = useSyncExternalStore(
    subscribeLedgerWorkspace,
    () => getLedgerBookNamesSnapshot("all"),
    () => getLedgerBookNamesSnapshot("all"),
  );

  const vendorOptions = useMemo(
    () => buildVendorOptions(expenseLines, ledgerBookNames),
    [expenseLines, ledgerBookNames],
  );

  const expenseSum = useMemo(
    () => expenseLines.reduce((s, line) => s + parseAmount(line.amount), 0),
    [expenseLines],
  );

  const channelSalesGross = useMemo(
    () =>
      parseAmount(cashSale) +
      parseAmount(bankSale) +
      parseAmount(bkashSale) +
      parseAmount(pathaoSale) +
      parseAmount(foodiSale) +
      parseAmount(foodpandaSale),
    [cashSale, bankSale, bkashSale, pathaoSale, foodiSale, foodpandaSale],
  );

  const netSalesAfterVoid = useMemo(
    () => channelSalesGross - Math.max(0, parseAmount(voidSale)),
    [channelSalesGross, voidSale],
  );

  const remaining = useMemo(
    () =>
      computeRemainingFromParts(
        openingBalance,
        {
          cashSale,
          bankSale,
          bkashSale,
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
      bankSale,
      bkashSale,
      pathaoSale,
      foodiSale,
      foodpandaSale,
      voidSale,
      expenseLines,
    ],
  );

  const voidRemarksErr = salesFieldErrorMessage(formNotice, "voidRemarks");
  const voidAttachErr = salesFieldErrorMessage(formNotice, "voidAttach");

  useEffect(() => {
    setDateFieldText(formatDateKeyAsDisplay(dateKey));
  }, [dateKey]);

  useEffect(() => {
    setOpeningEdit(false);
    setRegularNoteOpenIds(new Set());
    regularNoteInputRefs.current.clear();
    const rows = readDailyEntryMap();
    const existing = rows[dateKey];
    if (existing) {
      setOpeningBalance(String(existing.openingBalance));
      setCashSale(String(existing.cashSale));
      setBankSale(String(existing.bankSale));
      setBkashSale(String(existing.bkashSale));
      setPathaoSale(String(existing.pathaoSale));
      setFoodiSale(String(existing.foodiSale));
      setFoodpandaSale(String(existing.foodpandaSale));
      setVoidSale(
        (existing.voidSale ?? 0) === 0 ? "0" : String(existing.voidSale ?? 0),
      );
      setVoidSaleRemarks(existing.voidSaleRemarks ?? "");
      setVoidSaleAttachmentUrls([...(existing.voidSaleAttachmentDataUrls ?? [])]);
      setExpenseLines(draftsFromRow(existing));
      setFormNotice({ kind: "none" });
      return;
    }

    const prevDayKey = dateAddDays(dateKey, -1);
    const prevClosing = rows[prevDayKey]?.remainingBalance ?? 0;
    setOpeningBalance(String(prevClosing));
    setCashSale("0");
    setBankSale("0");
    setBkashSale("0");
    setPathaoSale("0");
    setFoodiSale("0");
    setFoodpandaSale("0");
    setVoidSale("0");
    setVoidSaleRemarks("");
    setVoidSaleAttachmentUrls([]);
    setExpenseLines([]);
    setFormNotice({ kind: "none" });
  }, [dateKey, savedListVersion]);

  useEffect(() => {
    if (openingEdit) openingInputRef.current?.focus();
  }, [openingEdit]);

  useEffect(() => {
    if (formNotice.kind === "none") return;
    const ms =
      formNotice.kind === "field" || formNotice.kind === "salesField" ? 5200 : 2800;
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
    if (!pendingDeleteDateIso && !historyDetailRow && !receiptPreviewUrl && !historyReceiptsOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (receiptPreviewUrl) {
        setReceiptPreviewUrl(null);
        return;
      }
      if (historyReceiptsOpen) {
        setHistoryReceiptsOpen(false);
        setHistoryReceiptsLineIndex(null);
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
  }, [historyDetailRow, receiptPreviewUrl, historyReceiptsOpen, pendingDeleteDateIso]);

  useEffect(() => {
    if (!pendingDeleteDateIso) return;
    deleteConfirmInputRef.current?.focus();
  }, [pendingDeleteDateIso]);

  useEffect(() => {
    setHistoryReceiptsOpen(false);
    setHistoryReceiptsLineIndex(null);
  }, [historyDetailRow]);

  useEffect(() => {
    if (activeView !== "entry") return;
    const onPaste = (e: ClipboardEvent) => {
      const files = clipboardImageFilesFromDataTransfer(e.clipboardData);
      if (files.length === 0) return;
      const lineId = expenseLineIdFromEventTarget(e.target);
      const voidRoot = (e.target as HTMLElement | null)?.closest?.(
        "[data-void-attachment-anchor]",
      );
      if (voidRoot) {
        e.preventDefault();
        void (async () => {
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
        })();
        return;
      }
      if (!lineId) return;
      const line = expenseLinesRef.current.find((l) => l.id === lineId);
      if (!line) return;
      e.preventDefault();
      void (async () => {
        const result = await mergeReceiptDataUrls(line.receiptDataUrls, files);
        if (result.ok) {
          setExpenseLines((lines) =>
            lines.map((l) =>
              l.id === lineId ? { ...l, receiptDataUrls: result.urls } : l,
            ),
          );
        } else {
          setFormNotice({
            kind: "field",
            message: result.message,
            lineId,
            part: "attach",
          });
        }
      })();
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [activeView]);

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
      setPathaoSale(rnd());
      setFoodiSale(rnd());
      setFoodpandaSale(rnd());
      const ledgerSample = getLedgerBookNamesSnapshot("all")[0] ?? "Ledger book";
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

  function patchLine(
    id: string,
    patch: Partial<
      Pick<
        ExpenseLineDraft,
        | "vendor"
        | "amount"
        | "label"
        | "note"
        | "receiptDataUrls"
        | "ledgerKind"
        | "ledgerEmployeeLineKind"
        | "ledgerNote"
      >
    >,
  ) {
    setFormNotice((n) => {
      if (n.kind !== "field" || n.lineId !== id) return n;
      if ("vendor" in patch && n.part === "vendor") return { kind: "none" };
      if ("amount" in patch && n.part === "amount") return { kind: "none" };
      if ("label" in patch && n.part === "label") return { kind: "none" };
      if ("note" in patch && n.part === "note") return { kind: "none" };
      if ("receiptDataUrls" in patch && n.part === "attach") return { kind: "none" };
      if ("ledgerKind" in patch && n.part === "ledgerKind") return { kind: "none" };
      if ("ledgerEmployeeLineKind" in patch && n.part === "ledgerKind") return { kind: "none" };
      if ("ledgerNote" in patch && n.part === "ledgerNote") return { kind: "none" };
      return n;
    });
    setExpenseLines((lines) =>
      lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }

  function addVendorExpenseLine() {
    setExpenseLines((lines) => [...lines, newVendorExpenseLine()]);
  }

  function addRegularExpenseLine() {
    setExpenseLines((lines) => [...lines, newRegularExpenseLine()]);
  }

  function removeExpenseLine(id: string) {
    setFormNotice((n) =>
      n.kind === "field" && n.lineId === id ? { kind: "none" } : n,
    );
    setRegularNoteOpenIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    regularNoteInputRefs.current.delete(id);
    setExpenseLines((lines) => lines.filter((l) => l.id !== id));
  }

  function openRegularNoteField(lineId: string) {
    setRegularNoteOpenIds((prev) => {
      const next = new Set(prev);
      next.add(lineId);
      return next;
    });
    requestAnimationFrame(() => {
      regularNoteInputRefs.current.get(lineId)?.focus();
    });
  }

  function clearSalesFieldNotice() {
    setFormNotice((n) => (n.kind === "salesField" ? { kind: "none" } : n));
  }

  /** Add / attach receipt control — kept compact to sit on the same row as vendor, amount, and delete. */
  function renderReceiptAddControl(line: ExpenseLineDraft) {
    const urls = line.receiptDataUrls;
    const canAddMore = urls.length < MAX_RECEIPTS_PER_LINE;
    const inputId = `daily-expense-receipt-${line.id}`;
    const attachErr = fieldErrorMessage(formNotice, line.id, "attach");
    if (!canAddMore) {
      return (
        <div
          className={`relative flex min-h-8 items-center ${attachErr ? FIELD_ERR_ATTACH_WRAP : ""}`}
        >
          <span className="text-[8px] leading-tight text-[var(--pos-text-2)]">
            Max {MAX_RECEIPTS_PER_LINE} imgs
          </span>
        </div>
      );
    }
    return (
      <div
        className={`relative flex h-8 w-full min-w-0 items-center justify-center ${attachErr ? FIELD_ERR_ATTACH_WRAP : ""}`}
      >
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            const list = e.target.files;
            e.target.value = "";
            if (!list?.length) return;
            void (async () => {
              const result = await mergeReceiptDataUrls(urls, Array.from(list));
              if (result.ok) patchLine(line.id, { receiptDataUrls: result.urls });
              else
                setFormNotice({
                  kind: "field",
                  message: result.message,
                  lineId: line.id,
                  part: "attach",
                });
            })();
          }}
        />
        <label
          htmlFor={inputId}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[6px] border border-solid [border-color:var(--pos-divider)] text-[var(--pos-text-2)] transition-colors hover:border-[var(--pos-sb-base)] hover:bg-[var(--pos-nav-hover)]/30 hover:text-[var(--pos-text-1)]"
          aria-label="Attach receipt image from files or paste from clipboard"
          title="Attach file, or paste an image (Ctrl+V / ⌘V) while this row is focused"
        >
          <Paperclip className="size-4 shrink-0" strokeWidth={2.25} />
        </label>
      </div>
    );
  }

  function renderReceiptThumbnails(line: ExpenseLineDraft) {
    const urls = line.receiptDataUrls;
    if (urls.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1 border-t border-solid [border-color:var(--pos-divider)] pt-1">
        {urls.map((url, idx) => (
          <div key={`${line.id}-r-${idx}`} className="relative inline-flex">
            <button
              type="button"
              className="block overflow-hidden rounded-[6px] border border-solid [border-color:var(--pos-divider)] ring-offset-1 hover:ring-2 hover:ring-[var(--pos-sb-base)]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pos-sb-base)]"
              onClick={() => setReceiptPreviewUrl(url)}
              aria-label={`View receipt ${idx + 1}`}
            >
              <img
                src={url}
                alt={`Receipt ${idx + 1}`}
                className="size-11 object-cover"
              />
            </button>
            <button
              type="button"
              className="absolute -right-0.5 -top-0.5 z-[1] flex size-4 items-center justify-center rounded-full border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] text-[10px] leading-none text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]"
              aria-label="Remove receipt image"
              onClick={(e) => {
                e.stopPropagation();
                patchLine(line.id, {
                  receiptDataUrls: urls.filter((_, j) => j !== idx),
                });
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
    const canAddMore = urls.length < MAX_VOID_ATTACHMENTS;
    const inputId = "daily-void-attachments";
    if (!canAddMore) {
      return (
        <div
          className={`relative flex min-h-8 items-center ${voidAttachErr ? FIELD_ERR_ATTACH_WRAP : ""}`}
          data-field-error-anchor="void:voidAttach"
        >
          <span className="text-[8px] leading-tight text-[var(--pos-text-2)]">
            Max {MAX_VOID_ATTACHMENTS} files
          </span>
        </div>
      );
    }
    return (
      <div
        className={`relative flex h-8 w-8 shrink-0 items-center justify-center ${voidAttachErr ? FIELD_ERR_ATTACH_WRAP : ""}`}
        data-field-error-anchor="void:voidAttach"
      >
        <input
          id={inputId}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            const list = e.target.files;
            e.target.value = "";
            if (!list?.length) return;
            void (async () => {
              const result = await mergeVoidAttachmentDataUrls(urls, Array.from(list));
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
            })();
          }}
        />
        <label
          htmlFor={inputId}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[6px] border border-solid [border-color:var(--pos-divider)] text-[var(--pos-text-2)] transition-colors hover:border-[var(--pos-sb-base)] hover:bg-[var(--pos-nav-hover)]/30 hover:text-[var(--pos-text-1)]"
          aria-label="Attach PDF or image for void sales"
          title="Attach PDF or image, or paste an image while this section is focused"
        >
          <Paperclip className="size-4 shrink-0" strokeWidth={2.25} />
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
              aria-label={isPdfDataUrl(url) ? `View PDF ${idx + 1}` : `View attachment ${idx + 1}`}
            >
              {isPdfDataUrl(url) ? (
                <span className="flex size-11 flex-col items-center justify-center gap-0.5 bg-[var(--pos-page)] text-[var(--pos-text-2)]">
                  <FileText className="size-5 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="text-[8px] font-semibold uppercase">PDF</span>
                </span>
              ) : (
                <img
                  src={url}
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
                setVoidSaleAttachmentUrls(urls.filter((_, j) => j !== idx));
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
  }

  function handleSave() {
    const validation = findFirstExpenseValidationError(expenseLines);
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

    const voidSaleToSave = voidAmtParsed;
    const voidRemarksToSave = voidAmtParsed > 0 ? voidRemarksTrim : "";
    const voidAttachmentsFiltered = voidSaleAttachmentUrls.filter(Boolean);
    const voidAttachmentsToSave =
      voidAmtParsed > 0 && voidAttachmentsFiltered.length > 0
        ? voidAttachmentsFiltered
        : undefined;

    const linesToSave: ExpenseLineSaved[] = [];
    for (const line of expenseLines) {
      const amt = parseAmount(line.amount);
      const receiptUrls = line.receiptDataUrls.filter(Boolean);
      const receiptField =
        receiptUrls.length > 0 ? ({ receiptDataUrls: receiptUrls } as const) : {};
      const lineIdField = { lineId: line.id } as const;
      if (line.kind === "vendor") {
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
          const isEmp = Boolean(supplierId && isEmployeesLedgerSupplierId(supplierId));
          if (isEmp) {
            if (line.ledgerEmployeeLineKind) {
              linesToSave.push({
                ...base,
                ledgerKind: "payment",
                ledgerEmployeeLineKind: line.ledgerEmployeeLineKind,
                ledgerNote: line.ledgerNote.trim(),
              });
            } else {
              linesToSave.push(base);
            }
          } else if (line.ledgerKind) {
            linesToSave.push({
              ...base,
              ledgerKind: line.ledgerKind,
              ledgerNote: line.ledgerNote.trim(),
            });
          } else {
            linesToSave.push(base);
          }
        }
      } else {
        const expenseTitle = line.label.trim();
        if (expenseTitle && amt > 0) {
          const noteTrim = line.note.trim();
          linesToSave.push({
            kind: "regular",
            label: expenseTitle,
            amount: amt,
            ...lineIdField,
            ...(noteTrim ? { note: noteTrim } : {}),
            ...receiptField,
          });
        }
      }
    }

    const expenseTotal = linesToSave.reduce((s, line) => s + line.amount, 0);

    const rows = readDailyEntryMap();
    const prior = rows[dateKey];
    const enteredBy = userName.trim() || "Unknown";
    const nextCandidate: DailyEntryRow = {
      date: dateKey,
      openingBalance: parseAmount(openingBalance),
      cashSale: parseAmount(cashSale),
      bankSale: parseAmount(bankSale),
      bkashSale: parseAmount(bkashSale),
      pathaoSale: parseAmount(pathaoSale),
      foodiSale: parseAmount(foodiSale),
      foodpandaSale: parseAmount(foodpandaSale),
      voidSale: voidSaleToSave > 0 ? voidSaleToSave : undefined,
      voidSaleRemarks:
        voidSaleToSave > 0 && voidRemarksToSave ? voidRemarksToSave : undefined,
      voidSaleAttachmentDataUrls: voidAttachmentsToSave,
      expenses: expenseTotal,
      expenseLines: linesToSave,
      remainingBalance: remaining,
      updatedAt: new Date().toISOString(),
      enteredBy,
    };

    if (prior && savedEntryBodyEquals(prior, nextCandidate)) {
      setFormNotice({
        kind: "global",
        message:
          "Nothing changed — this day already has that entry. Edit the form to update it, or choose another date.",
      });
      return;
    }

    const { lines: syncedExpenseLines, failed: ledgerPostFailed } = syncDailyExpenseLedgerLinks({
      prior,
      baseLines: linesToSave,
      expenseLines,
      dateKey,
    });

    const next: DailyEntryRow = {
      ...nextCandidate,
      expenseLines: syncedExpenseLines,
      expenses: syncedExpenseLines.reduce((s, line) => s + line.amount, 0),
    };

    rows[dateKey] = next;
    const result = writeDailyEntryMap(rows);
    if (!result.ok) {
      setFormNotice({ kind: "global", message: result.message });
      return;
    }

    setSavedListVersion((v) => v + 1);
    setOpeningEdit(false);
    const baseMsg = prior
      ? `Updated ${formatDateKeyAsDisplay(dateKey)}. One entry per day — use Edit on a row or Add Entry for another date.`
      : `Saved ${formatDateKeyAsDisplay(dateKey)}. One entry per day — Add Entry for another date or review the list below.`;
    setFormNotice({
      kind: "global",
      message: ledgerPostFailed
        ? `${baseMsg} Bills & payments: one or more ledger lines could not be saved — check amounts and types.`
        : baseMsg,
    });
    setActiveView("history");
  }

  function commitDateFieldText() {
    const parsed = parseDisplayDateToKey(dateFieldText);
    if (parsed) {
      setDateKey(parsed);
      setDateFieldText(formatDateKeyAsDisplay(parsed));
    } else {
      setDateFieldText(formatDateKeyAsDisplay(dateKey));
    }
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
    setPendingDeleteDateIso(dateIso);
    setDeleteConfirmText("");
  }

  function closeDeleteEntryModal() {
    setPendingDeleteDateIso(null);
    setDeleteConfirmText("");
  }

  function executeDeleteHistoryEntry(dateIso: string) {
    const rows = readDailyEntryMap();
    if (!rows[dateIso]) return;
    delete rows[dateIso];
    const result = writeDailyEntryMap(rows);
    if (!result.ok) {
      setFormNotice({ kind: "global", message: result.message });
      return;
    }
    closeDeleteEntryModal();
    setSavedListVersion((v) => v + 1);
    setFormNotice({ kind: "global", message: "Entry deleted from this device." });
    setHistoryDetailRow((open) => (open?.date === dateIso ? null : open));
  }

  const dailyEntryHeader = (
    <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1 border-b border-solid [border-color:var(--pos-divider)] px-3 py-2">
      <h1 className="min-w-0 justify-self-start text-left text-[14px] font-semibold leading-tight text-[var(--pos-text-1)]">
        Daily Entry Form
      </h1>
      {activeView === "entry" ? (
        <div className="col-start-2 flex shrink-0 items-center gap-1.5 text-[10px] text-[var(--pos-text-2)]">
          <span className="font-medium uppercase tracking-[0.06em] text-[var(--pos-text-2)]/80">
            Date
          </span>
          <div className="relative flex items-center gap-0.5">
            <input
              id="daily-entry-date"
              type="text"
              value={dateFieldText}
              onChange={(e) => setDateFieldText(e.target.value)}
              onBlur={commitDateFieldText}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="DD-MMM-YYYY"
              title="Entry date (DD-MMM-YYYY)"
              aria-label="Entry date, format DD-MMM-YYYY"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} !h-7 w-auto min-w-[9.25rem] py-0 text-[11px]`}
            />
            <button
              type="button"
              onClick={openNativeDatePicker}
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] p-1.5 text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-nav-hover)]/50 hover:text-[var(--pos-text-1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pos-sb-base)]"
              title="Open calendar"
              aria-label="Open calendar to pick date"
            >
              <CalendarDays className="size-3.5" strokeWidth={2.25} />
            </button>
            <input
              ref={datePickerRef}
              type="date"
              value={dateKey}
              onChange={(e) => {
                const v = e.target.value;
                if (v) setDateKey(v);
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
          <button
            type="button"
            onClick={() => setActiveView("history")}
            className="rounded-[7px] border border-solid [border-color:var(--pos-divider)] px-2.5 py-1 text-[11px] font-semibold text-[var(--pos-text-2)] transition-colors hover:text-[var(--pos-text-1)]"
          >
            History
          </button>
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
        className="shrink-0 border-b border-solid [border-color:var(--pos-sb-base)] bg-[var(--pos-sb-base)]/15 px-3 py-1.5"
        role="status"
        aria-live="polite"
      >
        <p className="text-[12px] font-bold leading-tight text-[var(--pos-text-1)]">
          Editing an existing entry for {formatDateKeyAsDisplay(dateKey)}
          {savedRowForDate.updatedAt ? (
            <span className="ml-1.5 font-normal tabular-nums text-[9px] text-[var(--pos-text-2)]">
              · Last saved{" "}
              {new Date(savedRowForDate.updatedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-[10px] leading-tight text-[var(--pos-text-2)]">
          Saved data exists for this day — saving replaces that record (one entry per day).
        </p>
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
    ) : null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[12px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]">
      {activeView === "history" ? (
        <>
          {dailyEntryHeader}
          {editingExistingBanner}
          {globalNoticeEl}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col overflow-auto px-3 py-2">
            {historyRows.length > 0 ? (
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
                    placeholder='Search — try vendor:Rent cash:1000 "apr" -legacy'
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
            {historyRows.length === 0 ? (
              <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-dashed border-[var(--pos-border-medium)]">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-dashed border-[var(--pos-border-medium)] bg-[var(--pos-page)] px-3 py-2">
                  <h2 className={`m-0 min-w-0 leading-tight ${sectionTitleClass}`}>
                    Saved entries
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveView("entry")}
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
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2">
                  <h2 className={`m-0 min-w-0 leading-tight ${sectionTitleClass}`}>
                    Saved entries 
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveView("entry")}
                    className="inline-flex shrink-0 items-center gap-1 rounded-[7px] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "var(--pos-sb-base)" }}
                  >
                    <Plus className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                    Add Entry
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)]">
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Date</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Opening</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Net sales</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Expenses Σ</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Remaining</th>
                      <th className="px-3 py-2 text-right font-semibold text-[var(--pos-text-2)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistoryRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
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
                          {formatDateKeyAsDisplay(r.date)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[var(--pos-text-1)]">
                          {formatMoney(r.openingBalance)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[var(--pos-text-1)]">
                          {formatMoney(netSalesTotal(r))}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[var(--pos-text-1)]">
                          {formatMoney(expenseTotalFromRow(r))}
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-[var(--pos-text-1)]">
                          {formatMoney(r.remainingBalance)}
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
                            <button
                              type="button"
                              className={historyActionBtnClass}
                              title="Edit in form"
                              aria-label={`Edit entry ${formatDateKeyAsDisplay(r.date)}`}
                              onClick={() => {
                                setDateKey(r.date);
                                setActiveView("entry");
                              }}
                            >
                              <Pencil className="size-3.5" strokeWidth={2.25} />
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
        <div className="flex flex-col gap-2 px-3 py-2">
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <div className={statCardClass}>
              <p className={labelClass}>Opening</p>
              <div className="flex min-h-[1.25rem] items-center gap-1.5">
                {openingEdit ? (
                  <input
                    ref={openingInputRef}
                    {...amountFieldProps("next")}
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    onBlur={() => setOpeningEdit(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setOpeningEdit(false);
                      }
                    }}
                    className={`${inputClass} !h-9 flex-1 text-[15px] font-semibold`}
                    aria-label="Opening balance"
                  />
                ) : (
                  <>
                    <p className="min-w-0 flex-1 text-[15px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
                      {formatMoney(parseAmount(openingBalance))}
                    </p>
                    <button
                      type="button"
                      className={editOpeningBtnClass}
                      aria-label="Edit opening balance"
                      onClick={() => setOpeningEdit(true)}
                    >
                      <Pencil className="size-3.5" strokeWidth={2.25} />
                    </button>
                  </>
                )}
              </div>
              <p className="text-[9px] normal-case font-normal leading-snug tracking-normal text-[var(--pos-text-2)]">
                From previous closing — tap pencil to adjust
              </p>
            </div>
            <div className={statCardClass}>
              <p className={labelClass}>Expenses</p>
              <p className="text-[15px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
                {formatMoney(expenseSum)}
              </p>
              <p className="text-[9px] normal-case font-normal leading-snug tracking-normal text-[var(--pos-text-2)]">
                Total from expense lines below
              </p>
            </div>
            <div className={statCardClass}>
              <p className={labelClass}>Sales</p>
              <p className="text-[15px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
                {formatMoney(netSalesAfterVoid)}
              </p>
              <p className="text-[9px] normal-case font-normal leading-snug tracking-normal text-[var(--pos-text-2)]">
                Channel total minus void sales
              </p>
            </div>
            <div className={statCardClass}>
              <p className={labelClass}>Remaining</p>
              <p className="text-[15px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
                {formatMoney(remaining)}
              </p>
              <p className="text-[9px] normal-case font-normal leading-snug tracking-normal text-[var(--pos-text-2)]">
                Opening + net sales − expenses (closing)
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] md:items-start">
              <div className={`${columnShellClass} min-w-0`}>
                <p className="border-b border-solid [border-color:var(--pos-divider)] pb-1 text-[11px] font-semibold text-[var(--pos-text-1)]">
                  Regular expense
                </p>
                <p className="text-[10px] leading-snug text-[var(--pos-text-2)]">
                  Title, amount, receipt images — use the pencil to add an optional note — max{" "}
                  {MAX_RECEIPTS_PER_LINE} per line.
                </p>
                {expenseLines.some((l) => l.kind === "regular") ? (
                  <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,0.75fr)_2.25rem_2.25rem_2.25rem] items-center gap-x-2 border-b border-solid [border-color:var(--pos-divider)] pb-1.5 text-[9px] font-semibold uppercase leading-none tracking-[0.06em] text-[var(--pos-text-2)]">
                    <span className="flex min-h-8 items-center pl-0.5">Expense title</span>
                    <span className="flex h-8 items-center justify-center text-center">Amt</span>
                    <span
                      className="flex h-8 w-full items-center justify-center"
                      title="Attachment"
                    >
                      <Paperclip
                        className="size-3.5 shrink-0 text-[var(--pos-text-2)]"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                      <span className="sr-only">Attachment</span>
                    </span>
                    <span
                      className="flex h-8 w-full items-center justify-center"
                      title="Note"
                    >
                      <Pencil
                        className="size-3.5 shrink-0 text-[var(--pos-text-2)]"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                      <span className="sr-only">Note</span>
                    </span>
                    <span
                      className="flex h-8 w-full items-center justify-center"
                      title="Remove line"
                    >
                      <Trash2
                        className="size-3.5 shrink-0 text-[var(--pos-text-2)]"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                      <span className="sr-only">Remove</span>
                    </span>
                  </div>
                ) : (
                  <p className="text-[10px] italic text-[var(--pos-text-2)]">
                    No regular expense lines yet.
                  </p>
                )}
                <div className="space-y-1.5 pr-0.5">
                  {expenseLines.filter((l) => l.kind === "regular").map((line) => {
                    const labelErr = fieldErrorMessage(formNotice, line.id, "label");
                    const amountErr = fieldErrorMessage(formNotice, line.id, "amount");
                    const attachErr = fieldErrorMessage(formNotice, line.id, "attach");
                    const showNoteField =
                      regularNoteOpenIds.has(line.id) || line.note.trim().length > 0;
                    return (
                      <div
                        key={line.id}
                        data-expense-line-id={line.id}
                        className="space-y-1 rounded-[6px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]/30 p-1"
                      >
                        <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,0.75fr)_2.25rem_2.25rem_2.25rem] items-start gap-x-2 gap-y-1">
                          <div className="flex min-w-0 flex-col">
                            <input
                              type="text"
                              value={line.label}
                              onChange={(e) => patchLine(line.id, { label: e.target.value })}
                              placeholder="Expense title"
                              className={`${textInputClass} ${labelErr ? FIELD_ERR_INPUT : ""}`}
                              autoComplete="off"
                              aria-label="Regular expense title"
                              aria-invalid={labelErr ? true : undefined}
                              aria-required
                              data-field-error-anchor={`${line.id}:label`}
                            />
                            <ExpenseFieldErrorBubble message={labelErr} />
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <input
                              {...amountFieldProps("next")}
                              value={line.amount}
                              onChange={(e) => patchLine(line.id, { amount: e.target.value })}
                              className={`${inputClass} ${amountErr ? FIELD_ERR_INPUT : ""}`}
                              aria-label="Regular expense amount"
                              aria-invalid={amountErr ? true : undefined}
                              data-field-error-anchor={`${line.id}:amount`}
                            />
                            <ExpenseFieldErrorBubble message={amountErr} />
                          </div>
                          <div className="flex h-8 w-full min-w-0 items-center justify-center">
                            {renderReceiptAddControl(line)}
                          </div>
                          <div className="flex h-8 w-full items-center justify-center">
                            <button
                              type="button"
                              onClick={() => openRegularNoteField(line.id)}
                              className="inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-solid [border-color:var(--pos-divider)] text-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)]"
                              aria-label="Open note field"
                              title="Note"
                            >
                              <Pencil className="size-3.5" strokeWidth={2.25} aria-hidden />
                            </button>
                          </div>
                          <div className="flex h-8 w-full items-center justify-center">
                            <button
                              type="button"
                              onClick={() => removeExpenseLine(line.id)}
                              className="inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-solid [border-color:var(--pos-divider)] text-[16px] leading-none text-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)]"
                              aria-label="Remove expense line"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        {showNoteField ? (
                          <label
                            className={`mt-1 block ${labelClass}`}
                            data-field-error-anchor={`${line.id}:note`}
                          >
                            Note
                            <input
                              ref={(el) => {
                                if (el) regularNoteInputRefs.current.set(line.id, el);
                                else regularNoteInputRefs.current.delete(line.id);
                              }}
                              type="text"
                              value={line.note}
                              onChange={(e) => patchLine(line.id, { note: e.target.value })}
                              placeholder="Optional memo"
                              className={`${textInputClass} mt-0.5`}
                              autoComplete="off"
                              aria-label="Regular expense note"
                            />
                          </label>
                        ) : null}
                        {attachErr ? (
                          <div data-field-error-anchor={`${line.id}:attach`}>
                            <ExpenseFieldErrorBubble message={attachErr} />
                          </div>
                        ) : null}
                        {renderReceiptThumbnails(line)}
                      </div>
                    );
                  })}
                </div>
                <div className="shrink-0 border-t border-solid [border-color:var(--pos-divider)] pt-2">
                  <button
                    type="button"
                    onClick={addRegularExpenseLine}
                    className="w-full rounded-[7px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-2 py-1.5 text-center text-[10px] font-semibold leading-tight text-[var(--pos-text-1)] transition-colors hover:border-[var(--pos-sb-base)] hover:bg-[var(--pos-nav-hover)]/30"
                  >
                    Add regular expense
                  </button>
                </div>
              </div>

              <div className={`${columnShellClass} min-w-0`}>
                <p className="border-b border-solid [border-color:var(--pos-divider)] pb-1 text-[11px] font-semibold text-[var(--pos-text-1)]">
                  Sales
                </p>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                  <label className={labelClass} htmlFor="daily-cash">
                    Cash
                    <input
                      id="daily-cash"
                      {...amountFieldProps("next")}
                      value={cashSale}
                      onChange={(e) => setCashSale(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass} htmlFor="daily-bank">
                    Bank
                    <input
                      id="daily-bank"
                      {...amountFieldProps("next")}
                      value={bankSale}
                      onChange={(e) => setBankSale(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass} htmlFor="daily-bkash">
                    bKash
                    <input
                      id="daily-bkash"
                      {...amountFieldProps("next")}
                      value={bkashSale}
                      onChange={(e) => setBkashSale(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass} htmlFor="daily-pathao">
                    Pathao
                    <input
                      id="daily-pathao"
                      {...amountFieldProps("next")}
                      value={pathaoSale}
                      onChange={(e) => setPathaoSale(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass} htmlFor="daily-foodi">
                    Foodi
                    <input
                      id="daily-foodi"
                      {...amountFieldProps("next")}
                      value={foodiSale}
                      onChange={(e) => setFoodiSale(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass} htmlFor="daily-foodpanda">
                    Foodpanda
                    <input
                      id="daily-foodpanda"
                      {...amountFieldProps("next")}
                      value={foodpandaSale}
                      onChange={(e) => setFoodpandaSale(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                </div>
                <div
                  className="mt-2 space-y-2 border-t border-solid [border-color:var(--pos-divider)] pt-2"
                  data-void-attachment-anchor
                >
                  <label className={labelClass} htmlFor="daily-void-sale">
                    Void sales
                    <input
                      id="daily-void-sale"
                      {...amountFieldProps("next")}
                      value={voidSale}
                      onChange={(e) => {
                        clearSalesFieldNotice();
                        setVoidSale(e.target.value);
                      }}
                      className={inputClass}
                    />
                  </label>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <label className={labelClass} htmlFor="daily-void-remarks">
                      Remarks
                      {parseAmount(voidSale) > 0 ? (
                        <span className="text-red-600/90"> *</span>
                      ) : null}
                    </label>
                    <input
                      id="daily-void-remarks"
                      type="text"
                      value={voidSaleRemarks}
                      onChange={(e) => {
                        clearSalesFieldNotice();
                        setVoidSaleRemarks(e.target.value);
                      }}
                      placeholder="Required when void sales is greater than zero"
                      className={`${textInputClass} ${voidRemarksErr ? FIELD_ERR_INPUT : ""}`}
                      data-field-error-anchor="void:voidRemarks"
                      aria-invalid={voidRemarksErr ? true : undefined}
                      aria-required={parseAmount(voidSale) > 0 ? true : undefined}
                    />
                    <ExpenseFieldErrorBubble message={voidRemarksErr} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {renderVoidAttachmentAddControl()}
                    <span className="min-w-0 flex-1 text-[9px] leading-snug text-[var(--pos-text-2)]">
                      Attach PDF or image (max {MAX_VOID_ATTACHMENTS}). Paste an image with this block
                      focused.
                    </span>
                  </div>
                  {voidAttachErr ? (
                    <div data-field-error-anchor="void:voidAttach">
                      <ExpenseFieldErrorBubble message={voidAttachErr} />
                    </div>
                  ) : null}
                  {renderVoidAttachmentThumbnails()}
                </div>
              </div>
            </div>

            <div className={`${columnShellClass} w-full min-w-0`}>
              <p className="border-b border-solid [border-color:var(--pos-divider)] pb-1 text-[11px] font-semibold text-[var(--pos-text-1)]">
                Ledger book entry
              </p>
              <p className="text-[10px] leading-snug text-[var(--pos-text-2)]">
                Books from Ledger Management. Optional type and note; saving posts matching lines to
                Bills &amp; payments using each row&apos;s amount and the entry date.
              </p>
              {expenseLines.some((l) => l.kind === "vendor") ? (
                <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(4.75rem,0.55fr)_minmax(0,0.45fr)_minmax(0,1fr)_2.25rem_2.25rem] items-center gap-x-1.5 border-b border-solid [border-color:var(--pos-divider)] pb-1.5 text-[9px] font-semibold uppercase leading-none tracking-[0.06em] text-[var(--pos-text-2)]">
                  <span className="flex min-h-8 min-w-0 items-center pl-0.5">Book</span>
                  <span className="flex h-8 items-center justify-center text-center">Type</span>
                  <span className="flex h-8 items-center justify-center text-center">Amt</span>
                  <span className="flex min-h-8 min-w-0 items-center">Note</span>
                  <span
                    className="flex h-8 w-full items-center justify-center"
                    title="Attachment"
                  >
                    <Paperclip
                      className="size-3.5 shrink-0 text-[var(--pos-text-2)]"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="sr-only">Attachment</span>
                  </span>
                  <span
                    className="flex h-8 w-full items-center justify-center"
                    title="Remove line"
                  >
                    <Trash2
                      className="size-3.5 shrink-0 text-[var(--pos-text-2)]"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="sr-only">Remove</span>
                  </span>
                </div>
              ) : (
                <p className="text-[10px] italic text-[var(--pos-text-2)]">
                  No ledger book lines yet.
                </p>
              )}
              <div className="space-y-1.5 pr-0.5">
                {expenseLines.filter((l) => l.kind === "vendor").map((line) => {
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
                    const ledgerKindErr = fieldErrorMessage(formNotice, line.id, "ledgerKind");
                    const ledgerSupplierForLine = resolveLedgerSupplierIdByBookName(trimmed);
                    const isEmployeeLedgerRow = Boolean(
                      ledgerSupplierForLine &&
                        isEmployeesLedgerSupplierId(ledgerSupplierForLine),
                    );

                    return (
                      <div
                        key={line.id}
                        data-expense-line-id={line.id}
                        className="space-y-1 rounded-[6px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]/30 p-1"
                      >
                        <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1.1fr)_minmax(4.75rem,0.55fr)_minmax(0,0.45fr)_minmax(0,1fr)_2.25rem_2.25rem] items-center gap-x-1.5 gap-y-0 overflow-x-auto">
                          <div
                            className={`flex min-h-8 min-w-0 items-center gap-1 ${vendorErr ? FIELD_ERR_VENDOR_COL : ""}`}
                            data-field-error-anchor={`${line.id}:vendor`}
                          >
                            <select
                              className={`${selectClass} min-h-8 min-w-0 flex-1 py-0 text-[11px] leading-tight`}
                              value={selectValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                const ledgerReset = {
                                  ledgerKind: "" as const,
                                  ledgerEmployeeLineKind: "" as const,
                                  ledgerNote: "",
                                };
                                if (val === "") {
                                  patchLine(line.id, { vendor: "", ...ledgerReset });
                                } else if (val === VENDOR_OTHER_VALUE) {
                                  if (inList) patchLine(line.id, { vendor: "", ...ledgerReset });
                                } else {
                                  const sid = resolveLedgerSupplierIdByBookName(val);
                                  if (sid && isEmployeesLedgerSupplierId(sid)) {
                                    patchLine(line.id, {
                                      vendor: val,
                                      ledgerKind: "payment",
                                      ledgerEmployeeLineKind: "salary",
                                      ledgerNote: "",
                                    });
                                  } else if (sid) {
                                    patchLine(line.id, {
                                      vendor: val,
                                      ...ledgerReset,
                                    });
                                  } else {
                                    patchLine(line.id, { vendor: val });
                                  }
                                }
                              }}
                              aria-label="Ledger book"
                              aria-invalid={vendorErr ? true : undefined}
                            >
                              <option value="">Book…</option>
                              {vendorOptions.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                              <option value={VENDOR_OTHER_VALUE}>Other…</option>
                            </select>
                            {showOtherInput ? (
                              <input
                                type="text"
                                value={line.vendor}
                                onChange={(e) => patchLine(line.id, { vendor: e.target.value })}
                                placeholder="Name"
                                className={`${textInputClass} min-h-8 min-w-[4.5rem] shrink-0 flex-1 py-0 text-[11px]`}
                                autoComplete="off"
                                aria-label="Custom ledger book name"
                              />
                            ) : null}
                          </div>
                          <div
                            className={`min-w-0 ${!ledgerSupplierForLine ? "opacity-60" : ""}`}
                            data-field-error-anchor={`${line.id}:ledgerKind`}
                          >
                            {isEmployeeLedgerRow ? (
                              <select
                                name="ledger-employee-line-kind"
                                value={line.ledgerEmployeeLineKind}
                                disabled={!ledgerSupplierForLine}
                                onChange={(e) =>
                                  patchLine(line.id, {
                                    ledgerEmployeeLineKind: (e.target.value ||
                                      "") as "" | EmployeeLedgerLineKind,
                                  })
                                }
                                className={`${selectClass} h-8 w-full min-w-0 py-0 text-[10px] leading-tight ${ledgerKindErr ? FIELD_ERR_INPUT : ""}`}
                                aria-label="Payment or deal type for this staff book"
                              >
                                <option value="">None</option>
                                {EMPLOYEE_LEDGER_LINE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <select
                                name="ledger-type"
                                value={line.ledgerKind}
                                disabled={!ledgerSupplierForLine}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  patchLine(line.id, {
                                    ledgerKind: (v || "") as ExpenseLineDraft["ledgerKind"],
                                  });
                                }}
                                className={`${selectClass} h-8 w-full min-w-0 py-0 text-[11px] leading-tight ${ledgerKindErr ? FIELD_ERR_INPUT : ""}`}
                                aria-label="Ledger entry type for this book"
                              >
                                <option value="">None</option>
                                {LEDGER_DRAWER_KINDS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div className="min-w-0">
                            <input
                              {...amountFieldProps("next")}
                              value={line.amount}
                              onChange={(e) => patchLine(line.id, { amount: e.target.value })}
                              className={`${inputClass} h-8 py-0 text-[12px] ${vendorAmountErr ? FIELD_ERR_INPUT : ""}`}
                              aria-label="Expense amount"
                              aria-invalid={vendorAmountErr ? true : undefined}
                              data-field-error-anchor={`${line.id}:amount`}
                            />
                          </div>
                          <div
                            className={`min-w-0 ${!ledgerSupplierForLine ? "opacity-60" : ""}`}
                            data-field-error-anchor={`${line.id}:ledgerNote`}
                          >
                            <input
                              name="ledger-note"
                              type="text"
                              value={line.ledgerNote}
                              disabled={!ledgerSupplierForLine}
                              onChange={(e) => patchLine(line.id, { ledgerNote: e.target.value })}
                              placeholder={
                                ledgerSupplierForLine ? "Memo" : "Book first"
                              }
                              className={`${textInputClass} h-8 min-w-0 py-0 text-[12px] disabled:opacity-60`}
                              autoComplete="off"
                              aria-label="Ledger note for this expense line"
                            />
                          </div>
                          <div className="flex h-8 w-full min-w-0 items-center justify-center">
                            {renderReceiptAddControl(line)}
                          </div>
                          <div className="flex h-8 w-full items-center justify-center">
                            <button
                              type="button"
                              onClick={() => removeExpenseLine(line.id)}
                              className="inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-solid [border-color:var(--pos-divider)] text-[16px] leading-none text-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)]"
                              aria-label="Remove expense line"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        {!ledgerSupplierForLine ? (
                          <p className="text-[9px] leading-snug text-[var(--pos-text-2)]">
                            Match a Ledger Management book to enable type and note.
                          </p>
                        ) : null}
                        <div className="flex flex-col gap-0.5">
                          <ExpenseFieldErrorBubble message={vendorErr} />
                          <ExpenseFieldErrorBubble message={vendorAmountErr} />
                          <ExpenseFieldErrorBubble message={ledgerKindErr} />
                        </div>
                        {attachErr ? (
                          <div data-field-error-anchor={`${line.id}:attach`}>
                            <ExpenseFieldErrorBubble message={attachErr} />
                          </div>
                        ) : null}
                        {renderReceiptThumbnails(line)}
                      </div>
                    );
                  })}
                </div>
                <div className="shrink-0 border-t border-solid [border-color:var(--pos-divider)] pt-2">
                  <button
                    type="button"
                    onClick={addVendorExpenseLine}
                    className="w-full rounded-[7px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-2 py-1.5 text-center text-[10px] font-semibold leading-tight text-[var(--pos-text-1)] transition-colors hover:border-[var(--pos-sb-base)] hover:bg-[var(--pos-nav-hover)]/30"
                  >
                    Add ledger book expense
                  </button>
                </div>
              </div>
            </div>
          </div>

        <div className="flex flex-col gap-1.5 border-t border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2">
          <p className="text-[10px] leading-snug text-[var(--pos-text-2)]">
            {savedRowForDate
              ? "Save updates the one record for this day (see banner above)."
              : "No entry for this date yet. Save creates it (one record per calendar day)."}
          </p>
          <button
            type="submit"
            className="inline-flex h-9 w-fit min-w-[7.5rem] cursor-pointer items-center justify-center rounded-[8px] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-95"
            style={{ backgroundColor: "var(--pos-sb-base)" }}
          >
            Save
          </button>
        </div>
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
            className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-lg sm:rounded-[14px]"
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
                {historyDetailRow.updatedAt ? (
                  <>
                    Saved{" "}
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
                      {formatMoney(amt)}
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
                        {historyDetailRow.expenseLines.map((line, idx) => {
                          const kind = savedLineKind(line);
                          const title =
                            kind === "vendor"
                              ? (line.vendor ?? "").trim() || "Ledger book"
                              : (line.label ?? "").trim() || "Regular expense";
                          const noteText =
                            kind === "vendor"
                              ? (line.ledgerNote ?? "").trim()
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
                                {kind === "vendor" ? "Ledger book" : "Regular"}
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
                            {formatMoney(expenseTotalFromRow(historyDetailRow))}
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
                      {(
                        [
                          ["Cash", historyDetailRow.cashSale],
                          ["Bank", historyDetailRow.bankSale],
                          ["bKash", historyDetailRow.bkashSale],
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
                        ] as const
                      ).map(([label, amt]) => (
                        <tr
                          key={label}
                          className="border-b border-solid [border-color:var(--pos-divider)] last:border-b-0"
                        >
                          <td className="px-2 py-1.5 text-[var(--pos-text-2)]">{label}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[var(--pos-text-1)]">
                            {formatMoney(amt)}
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
                          {formatMoney(netSalesTotal(historyDetailRow))}
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
                  setDateKey(historyDetailRow.date);
                  setActiveView("entry");
                  setHistoryReceiptsOpen(false);
                  setHistoryReceiptsLineIndex(null);
                  setHistoryDetailRow(null);
                }}
              >
                Edit in form
              </button>
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
            className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-lg sm:rounded-[14px]"
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
              {historyDetailRow.expenseLines?.map((line, idx) => {
                const urls = line.receiptDataUrls ?? [];
                if (urls.length === 0) return null;
                if (historyReceiptsLineIndex !== null && idx !== historyReceiptsLineIndex) {
                  return null;
                }
                const kind = savedLineKind(line);
                const title =
                  kind === "vendor"
                    ? (line.vendor ?? "").trim() || "Ledger book"
                    : (line.label ?? "").trim() || "Regular expense";
                const lineNote =
                  kind === "vendor"
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
          {isPdfDataUrl(receiptPreviewUrl) ? (
            <iframe
              title="Attachment preview"
              src={receiptPreviewUrl}
              className="h-[min(90dvh,900px)] w-full max-w-3xl rounded-md bg-white shadow-lg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={receiptPreviewUrl}
              alt="Receipt"
              className="max-h-[min(90dvh,900px)] max-w-full object-contain shadow-lg"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <p className="mt-3 max-w-lg text-center text-[11px] text-white/60">
            Tap outside or press Escape to close
          </p>
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
