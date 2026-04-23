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
  Paperclip,
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

export const LEDGER_LEAF_IDS = new Set([
  "lm-ledger",
  "lm-suppliers",
  "lm-return",
]);

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
  | "house_rent"
  | "deal"
  | "advance"
  | "bonus"
  | "other";

export const EMPLOYEE_LEDGER_LINE_OPTIONS: {
  value: EmployeeLedgerLineKind;
  label: string;
}[] = [
  { value: "salary", label: "Salary" },
  { value: "service_charge", label: "Service charge" },
  { value: "house_rent", label: "House rent" },
  { value: "deal", label: "Deal / one-off" },
  { value: "advance", label: "Advance" },
  { value: "bonus", label: "Bonus" },
  { value: "other", label: "Other" },
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
  /** When set, this row belongs to an employee book (salary, rent, deals, etc.). */
  employeeLineKind?: EmployeeLedgerLineKind;
};

type Workspace = {
  suppliers: Supplier[];
  moves: StockMove[];
  ledger: LedgerEntry[];
  ledgerSupplierFilter: string;
  /** Ledger book list → open ledger drawer on New bill with lines for this book. */
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
  suppliers: [
    {
      id: "v-1",
      name: "Fresh Foods Wholesale",
      bookPurpose: "vendor",
      contactPerson: "Roksana Ahmed",
      phone: "+880 1711‑000111",
      email: "orders@freshfoods.example",
      address: "Tejgaon IA, Dhaka",
      notes: "Net 14 · delivery Tue/Fri",
    },
    {
      id: "v-2",
      name: "Capital Beverage Co.",
      bookPurpose: "vendor",
      contactPerson: "Karim Hassan",
      phone: "+880 1812‑000222",
      email: "b2b@capitalbev.example",
      address: "Uttara Sector 7",
      notes: "COD under ৳50k",
    },
    {
      id: "v-3",
      name: "Prime Packaging Ltd.",
      bookPurpose: "vendor",
      contactPerson: "Sabrina Alam",
      phone: "+880 1913‑000333",
      email: "sales@primepack.example",
      address: "Narayanganj",
      notes: "",
    },
    {
      id: "v-4",
      name: "Bay Seafood Trading",
      bookPurpose: "vendor",
      contactPerson: "Nusrat Jahan",
      phone: "+880 1614‑000444",
      email: "supply@bayseafood.example",
      address: "Khatunganj, Chattogram",
      notes: "Live catch · order by 10am",
    },
    {
      id: "v-5",
      name: "Golden Grain Mills",
      bookPurpose: "vendor",
      contactPerson: "Jamil Hossain",
      phone: "+880 1715‑000555",
      email: "b2b@goldengrain.example",
      address: "Gazipur",
      notes: "Flour · rice · bulk sacks",
    },
    {
      id: "v-6",
      name: "Dhaka Dairy Collective",
      bookPurpose: "vendor",
      contactPerson: "Ayesha Siddiqui",
      phone: "+880 1816‑000666",
      email: "orders@dhakadairy.example",
      address: "Mohammadpur, Dhaka",
      notes: "Daily milk & cream · AM drop",
    },
    {
      id: "v-7",
      name: "Spice Route Imports",
      bookPurpose: "vendor",
      contactPerson: "Farid Uddin",
      phone: "+880 1917‑000777",
      email: "import@spiceroute.example",
      address: "Motijheel C/A, Dhaka",
      notes: "Whole spices · MOQ 5kg",
    },
    {
      id: "v-8",
      name: "EcoClean Janitorial Supply",
      bookPurpose: "vendor",
      contactPerson: "Mehedi Hasan",
      phone: "+880 1318‑000888",
      email: "sales@ecoclean.example",
      address: "Banani, Dhaka",
      notes: "Chemicals · SDS on file",
    },
    {
      id: "o-1",
      name: "Owner — Rahim Chowdhury",
      bookPurpose: "owners",
      contactPerson: "Rahim Chowdhury",
      phone: "+880 1711‑900001",
      email: "rahim@krunch.example",
      address: "Dhanmondi, Dhaka",
      notes: "Capital injections · owner draws",
    },
    {
      id: "o-2",
      name: "Owner — Nadia Rahman",
      bookPurpose: "owners",
      contactPerson: "Nadia Rahman",
      phone: "+880 1811‑900002",
      email: "nadia@krunch.example",
      address: "Gulshan 2, Dhaka",
      notes: "Silent partner · quarterly true-up",
    },
    {
      id: "o-3",
      name: "Partnership operating pool",
      bookPurpose: "owners",
      contactPerson: "Kamal Hossain",
      phone: "—",
      email: "finance@krunch.example",
      address: "Head office",
      notes: "Shared owner float · reimbursements · treasurer of record",
    },
    {
      id: "e-1",
      name: `${EMPLOYEE_LEDGER_BOOK_NAME_PREFIX}Faisal Mahmud`,
      bookPurpose: "employees",
      contactPerson: "Faisal Mahmud",
      phone: "+880 1911‑700001",
      email: "faisal.mahmud@krunch.example",
      address: "Same as venue",
      notes: "Kitchen line prep · net wages · tips settlement",
    },
    {
      id: "e-2",
      name: `${EMPLOYEE_LEDGER_BOOK_NAME_PREFIX}Tanvir Islam`,
      bookPurpose: "employees",
      contactPerson: "Tanvir Islam",
      phone: "+880 1611‑700002",
      email: "tanvir.islam@krunch.example",
      address: "Dhaka metro",
      notes: "Delivery (Pathao / in-house) · advances · fuel top-ups · bonuses",
    },
    {
      id: "e-3",
      name: `${EMPLOYEE_LEDGER_BOOK_NAME_PREFIX}Sharmin Akter`,
      bookPurpose: "employees",
      contactPerson: "Sharmin Akter",
      phone: "+880 1511‑700003",
      email: "sharmin.akter@krunch.example",
      address: "Venue",
      notes: "Shift supervisor · petty cash recoveries · salary loans",
    },
  ],
  moves: [
    {
      kind: "purchase",
      id: "po-0005",
      ref: "PO-2026-0422",
      supplierId: "v-5",
      date: "2026-04-09",
      status: "draft",
      amountCents: 3120000,
      note: "Basmati rice 25kg ×4 bag; Atta flour 50lb ×6 bag",
    },
    {
      kind: "purchase",
      id: "po-0004",
      ref: "PO-2026-0421",
      supplierId: "v-4",
      date: "2026-04-08",
      status: "partial",
      amountCents: 2235000,
      note: "Pomfret (fresh) ×15 kg; Prawn medium ×8 kg",
    },
    {
      kind: "purchase",
      id: "po-0003",
      ref: "PO-2026-0420",
      supplierId: "v-3",
      date: "2026-04-07",
      status: "received",
      amountCents: 620400,
      note: "Kraft takeout boxes 12in ×50; Packaging tape rolls ×24",
    },
    {
      kind: "purchase",
      id: "po-0001",
      ref: "PO-2026-0412",
      supplierId: "v-1",
      date: "2026-04-02",
      status: "received",
      amountCents: 3956000,
      note: "Ribeye 12oz (case) ×2; Frozen fries 4kg ×8 bag",
    },
    {
      kind: "purchase",
      id: "po-0002",
      ref: "PO-2026-0415",
      supplierId: "v-2",
      date: "2026-04-05",
      status: "sent",
      amountCents: 4000000,
      note: "Cola syrup · cases",
    },
    {
      kind: "return",
      id: "pr-0001",
      ref: "PR-2026-0401",
      supplierId: "v-1",
      linkedPurchaseId: "po-0001",
      date: "2026-04-04",
      reason: "Temperature excursion — one case compromised",
      status: "credited",
      lines: [
        {
          id: "rl1",
          description: "Ribeye 12oz (case)",
          qty: 1,
          unit: "case",
          creditCents: 1850000,
        },
      ],
    },
  ],
  ledger: [
    {
      id: "lg-8",
      supplierId: "v-5",
      date: "2026-04-09",
      type: "invoice",
      ref: "PO-2026-0422",
      memo: "Golden Grain · weekly dry stock",
      amountCents: 3120000,
    },
    {
      id: "lg-7",
      supplierId: "v-4",
      date: "2026-04-08",
      type: "invoice",
      ref: "PO-2026-0421",
      memo: "Bay Seafood · morning lot",
      amountCents: 2235000,
    },
    {
      id: "lg-6",
      supplierId: "v-3",
      date: "2026-04-07",
      type: "invoice",
      ref: "PO-2026-0420",
      memo: "Prime Packaging · disposables restock",
      amountCents: 620400,
    },
    {
      id: "lg-1",
      supplierId: "v-1",
      date: "2026-04-02",
      type: "invoice",
      ref: "PO-2026-0412",
      memo: "Goods receipt · walk-in",
      amountCents: 3956000,
    },
    {
      id: "lg-2",
      supplierId: "v-1",
      date: "2026-04-04",
      type: "return_credit",
      ref: "PR-2026-0401",
      memo: "Return credited · QC",
      amountCents: -1850000,
    },
    {
      id: "lg-3",
      supplierId: "v-1",
      date: "2026-04-06",
      type: "payment",
      ref: "PV-88431",
      memo: "Bank transfer",
      amountCents: -1500000,
    },
    {
      id: "lg-4",
      supplierId: "v-2",
      date: "2026-04-03",
      type: "invoice",
      ref: "PO-2026-0415",
      memo: "Capital Beverage · cases (৳40,000)",
      amountCents: 4000000,
    },
    {
      id: "lg-5",
      supplierId: "v-2",
      date: "2026-04-05",
      type: "return_credit",
      ref: "PR-2026-0410",
      memo: "Return credit · damaged crates (৳4,000)",
      amountCents: -400000,
    },
    {
      id: "lg-emp-1",
      supplierId: "e-1",
      date: "2026-04-10",
      type: "payment",
      ref: "EM-MAR26A1",
      memo: "Salary · Bank Transfer · March payroll",
      amountCents: -5200000,
      employeeLineKind: "salary",
    },
    {
      id: "lg-emp-2",
      supplierId: "e-1",
      date: "2026-04-05",
      type: "payment",
      ref: "EM-APRHR1",
      memo: "House rent · Bank Transfer · April",
      amountCents: -800000,
      employeeLineKind: "house_rent",
    },
    {
      id: "lg-emp-3",
      supplierId: "e-2",
      date: "2026-04-08",
      type: "payment",
      ref: "EM-SCBONUS",
      memo: "Service charge · Cash · Q1 pool",
      amountCents: -125000,
      employeeLineKind: "service_charge",
    },
    {
      id: "lg-emp-4",
      supplierId: "e-3",
      date: "2026-04-01",
      type: "adjustment",
      ref: "ADJ-EMPQ1",
      memo: "Deal / one-off · Opening true-up from prior system",
      amountCents: 150000,
      employeeLineKind: "deal",
    },
  ],
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

export function employeeLedgerLineKindLabel(
  k: EmployeeLedgerLineKind | undefined,
): string {
  if (!k) return "—";
  return EMPLOYEE_LEDGER_LINE_OPTIONS.find((o) => o.value === k)?.label ?? k;
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
  return (
    <div className="mt-4 rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2.5">
      <p className={purchaseLabel}>Attachment</p>
      {isImage ? (
        <img
          src={attachment.dataUrl}
          alt=""
          className="mt-2 max-h-40 w-full rounded-[6px] border border-solid [border-color:var(--pos-divider)] object-contain"
        />
      ) : null}
      <a
        href={attachment.dataUrl}
        download={attachment.fileName}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium underline-offset-2 hover:underline"
        style={{ color: "var(--pos-sb-base)" }}
      >
        <Paperclip className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
        {attachment.fileName}
      </a>
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
      const reader = new FileReader();
      reader.onload = () => {
        onChange({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          dataUrl: reader.result as string,
        });
      };
      reader.onerror = () => setError("Could not read file");
      reader.readAsDataURL(file);
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
      {attachment?.mimeType.startsWith("image/") ? (
        <img
          src={attachment.dataUrl}
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
  const vendorSuppliers = useMemo(
    () => ws.suppliers.filter((s) => (s.bookPurpose ?? "vendor") === "vendor"),
    [ws.suppliers],
  );
  const [supplierId, setSupplierId] = useState("");
  const [linkedPurchaseId, setLinkedPurchaseId] = useState("");
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

  useEffect(() => {
    const vid = vendorSuppliers[0]?.id ?? "";
    if (!vid) return;
    if (!supplierId || !vendorSuppliers.some((s) => s.id === supplierId)) {
      setSupplierId(vid);
      setLinkedPurchaseId(purchases.find((p) => p.supplierId === vid)?.id ?? "");
    }
  }, [vendorSuppliers, purchases, supplierId]);

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

  if (vendorSuppliers.length === 0) {
    return (
      <p className="text-[12px] text-[var(--pos-text-2)]">
        Returns apply to vendor purchases only. Add at least one ledger book with type Vendor, then
        record a purchase for that book.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-[11px] text-[var(--pos-text-2)]">
        <span className="font-medium text-[var(--pos-text-1)]">Total</span> = qty × unit credit. Set{" "}
        <span className="font-medium text-[var(--pos-text-1)]">Unit</span> (case, box, kg…) to match the purchase.
        Pick a vendor ledger book that has a purchase.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={purchaseLabel}>Vendor ledger book</span>
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
            {vendorSuppliers.map((s) => (
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
              <option value="">No purchase for this ledger book</option>
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
          No purchases for {supplierName(supplierId)}. Add a bill from Bills & payments first,
          then record the return.
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
          title="Returns"
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

  const openLedger = useCallback((supplierId: string) => {
    setWorkspace((w) => ({
      ...w,
      ledgerSupplierFilter: supplierId,
    }));
    window.dispatchEvent(
      new CustomEvent("pos-select-leaf", { detail: { leafId: "lm-ledger" } }),
    );
  }, []);

  const startNewPurchaseFor = useCallback((supplierId: string) => {
    setWorkspace((w) => ({
      ...w,
      ledgerSupplierFilter: supplierId,
      ledgerInvoiceDrawerPrefillSupplierId: supplierId,
    }));
    window.dispatchEvent(
      new CustomEvent("pos-select-leaf", { detail: { leafId: "lm-ledger" } }),
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
          title="Ledger books"
          subtitle="Tag each book as vendor, owners, or employees. Balances come from Bills & payments."
        />
        <PrimaryButton type="button" onClick={startCreate}>
          Add ledger book
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
            aria-label="Filter ledger books"
          />
        </label>
        <label className="block min-w-[140px] max-w-[200px]">
          <span className={purchaseLabel}>Book type</span>
          <select
            value={purposeFilter}
            onChange={(e) =>
              setPurposeFilter(e.target.value as "all" | LedgerBookPurpose)
            }
            className={purchaseField}
            aria-label="Filter by book type"
          >
            <option value="all">All types</option>
            {LEDGER_BOOK_PURPOSE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto text-[11px] text-[var(--pos-text-2)]">
          Showing{" "}
          <span className="font-semibold text-[var(--pos-text-1)]">{rows.length}</span> ledger books
        </div>
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
                        <GhostButton onClick={() => openLedger(s.id)}>
                          <span className="inline-flex items-center gap-1">
                            <Receipt className="size-3.5" strokeWidth={2} />
                            Bills
                          </span>
                        </GhostButton>
                        {s.bookPurpose === "vendor" ? (
                          <GhostButton onClick={() => startNewPurchaseFor(s.id)}>
                            <span className="inline-flex items-center gap-1">
                              <ShoppingCart className="size-3.5" strokeWidth={2} />
                              Add bill
                            </span>
                          </GhostButton>
                        ) : null}
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
            <label className="block sm:col-span-2">
              <span className={purchaseLabel}>Book type</span>
              <select
                value={draft.bookPurpose ?? "vendor"}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    bookPurpose: e.target.value as LedgerBookPurpose,
                  }))
                }
                className={purchaseField}
                aria-label="Ledger book type"
              >
                {LEDGER_BOOK_PURPOSE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] leading-snug text-[var(--pos-text-2)]">
                {(draft.bookPurpose ?? "vendor") === "vendor"
                  ? "Vendor · supplier bills and trade payables."
                  : (draft.bookPurpose ?? "vendor") === "owners"
                    ? "Owners · partner draws, capital, and equity-style movements."
                    : `Employees · advances, wages, and staff balances (name the book “${EMPLOYEE_LEDGER_BOOK_NAME_PREFIX.trimEnd()} …”).`}
              </p>
            </label>
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

/** Table / chips: employee books show salary, house rent, etc.; vendors show bill / payment / … */
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

export const LEDGER_DRAWER_KINDS: { value: LedgerEntry["type"]; label: string }[] = [
  { value: "invoice", label: "Bill" },
  { value: "payment", label: "Payment" },
  { value: "return_credit", label: "Return" },
  { value: "adjustment", label: "Adjust" },
];

type LedgerEntryDraft = {
  supplierId: string;
  date: string;
  kind: LedgerEntry["type"];
  amount: string;
  method: (typeof LEDGER_PAYMENT_METHODS)[number];
  notes: string;
  attachment: LedgerAttachment | null;
  /** Set on employee ledger books — salary, house rent, deals, etc. */
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
  if (isEmployeesBookSupplierId(d.supplierId) && d.employeeLineKind) {
    const n = Number.parseFloat(d.amount);
    if (!Number.isFinite(n)) return null;
    const cents = Math.round(n * 100);
    if (cents <= 0) return null;
    return -cents;
  }
  const n = Number.parseFloat(d.amount);
  if (!Number.isFinite(n)) return null;
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
    if (!params.employeeLineKind) return "Select a payment or deal type.";
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

  const amountLabel = isEmployeeBook
    ? "Amount paid (৳)"
    : ledgerDraft.kind === "invoice"
      ? "Amount (৳)"
      : ledgerDraft.kind === "payment"
        ? "Amount (৳)"
        : ledgerDraft.kind === "return_credit"
          ? "Credit (৳)"
          : "Correction (৳)";

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
              <span className={purchaseLabel}>Payment / deal type</span>
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
                  step={0.01}
                  value={ledgerDraft.amount}
                  onChange={(e) => patchLedgerDraft({ amount: e.target.value })}
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
                placeholder="Period, ref #, deal notes…"
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
                  const kind = e.target.value as LedgerEntry["type"];
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
                    step={0.01}
                    value={ledgerDraft.amount}
                    onChange={(e) => patchLedgerDraft({ amount: e.target.value })}
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
                  min={ledgerDraft.kind === "adjustment" ? undefined : 0}
                  step={0.01}
                  value={ledgerDraft.amount}
                  onChange={(e) => patchLedgerDraft({ amount: e.target.value })}
                  placeholder={ledgerDraft.kind === "adjustment" ? "+/− taka" : "0"}
                  className={`${purchaseField} font-mono placeholder:text-[var(--pos-text-2)]`}
                />
                {ledgerDraft.kind === "adjustment" ? (
                  <p className="mt-1 text-[10px] leading-snug text-[var(--pos-text-2)]">
                    + increases due · − reduces
                  </p>
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
                  ledgerDraft.kind === "payment"
                    ? "Ref #, invoice #…"
                    : ledgerDraft.kind === "invoice"
                      ? "Short description"
                      : ledgerDraft.kind === "return_credit"
                        ? "Reason"
                        : "Why"
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
    setLedgerDraft(defaultLedgerEntryDraft(sid));
    setLedgerDrawerOpen(true);
    setWorkspace((w) => ({ ...w, ledgerInvoiceDrawerPrefillSupplierId: null }));
  }, [ws.ledgerInvoiceDrawerPrefillSupplierId]);

  const supplierName = useCallback(
    (id: string) => ws.suppliers.find((s) => s.id === id)?.name ?? id,
    [ws.suppliers],
  );

  const filterSupplier = filter ? ws.suppliers.find((s) => s.id === filter) : null;
  const viewingEmployeeBook = filterSupplier?.bookPurpose === "employees";

  const entries = useMemo(() => {
    let e = ws.ledger.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    if (filter) e = e.filter((x) => x.supplierId === filter);
    if (ledgerTypeFilter !== "all") {
      e = e.filter((x) => x.type === ledgerTypeFilter);
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
          title={viewingEmployeeBook ? "Staff ledger" : "Bills & payments"}
          subtitle={
            viewingEmployeeBook
              ? "Record salary, service charge, house rent, deals, and other staff payments — not vendor bills."
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
              setLedgerTypeFilter(e.target.value as "all" | LedgerEntry["type"])
            }
            className={purchaseField}
            aria-label="Filter by entry type"
          >
            <option value="all">All</option>
            <option value="invoice">Bill</option>
            <option value="payment">Payment</option>
            <option value="return_credit">Return</option>
            <option value="adjustment">Correction</option>
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

export function LedgerModuleView({ leafId }: { leafId: string }) {
  switch (leafId) {
    case "lm-suppliers":
      return <SupplierListView />;
    case "lm-return":
      return <SupplierReturnView />;
    case "lm-ledger":
      return <SupplierLedgerView />;
    default:
      return <SupplierLedgerView />;
  }
}
