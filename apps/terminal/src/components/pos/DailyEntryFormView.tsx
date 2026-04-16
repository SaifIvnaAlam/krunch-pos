import { CalendarDays, Eye, ImagePlus, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";

type ExpenseLineSaved = {
  kind?: "vendor" | "regular";
  /** Vendor name when kind is vendor */
  vendor?: string;
  /** Free-text description when kind is regular (optional) */
  label?: string;
  amount: number;
  /** Receipt photos as data URLs (image/*), stored on this device with the entry */
  receiptDataUrls?: string[];
};

type DailyEntryRow = {
  date: string;
  openingBalance: number;
  cashSale: number;
  bankSale: number;
  bkashSale: number;
  pathaoSale: number;
  foodiSale: number;
  foodpandaSale: number;
  /** Sum of expense line amounts; kept for history / older saves */
  expenses: number;
  expenseLines?: ExpenseLineSaved[];
  remainingBalance: number;
  updatedAt: string;
};

type DailyEntryMap = Record<string, DailyEntryRow>;

type ExpenseLineDraft = {
  id: string;
  kind: "vendor" | "regular";
  vendor: string;
  /** Regular expense description (no vendor) */
  label: string;
  amount: string;
  receiptDataUrls: string[];
};

const STORAGE_KEY = "upos.dailyEntryRows.v1";

const MAX_RECEIPTS_PER_LINE = 4;
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
  return { id: newLineId(), kind: "vendor", vendor: "", label: "", amount: "", receiptDataUrls: [] };
}

function newRegularExpenseLine(): ExpenseLineDraft {
  return { id: newLineId(), kind: "regular", vendor: "", label: "", amount: "", receiptDataUrls: [] };
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

function normalizeReceiptUrls(urls: string[] | undefined): string {
  return JSON.stringify([...(urls ?? [])].sort());
}

function normalizeExpenseLinesForCompare(lines: ExpenseLineSaved[] | undefined): string {
  const rows = [...(lines ?? [])].map((line) => {
    const kind = savedLineKind(line);
    return {
      kind,
      vendor: kind === "vendor" ? (line.vendor ?? "").trim() : "",
      label: kind === "regular" ? (line.label ?? "").trim() : "",
      amount: line.amount,
      receipts: normalizeReceiptUrls(line.receiptDataUrls),
    };
  });
  rows.sort((a, b) =>
    `${a.kind}\0${a.vendor}\0${a.label}\0${a.amount}`.localeCompare(
      `${b.kind}\0${b.vendor}\0${b.label}\0${b.amount}`,
    ),
  );
  return JSON.stringify(rows);
}

/** True when disk row and proposed save carry the same business data (ignores updatedAt). */
function savedEntryBodyEquals(prior: DailyEntryRow, next: DailyEntryRow): boolean {
  if (prior.date !== next.date) return false;
  return (
    prior.openingBalance === next.openingBalance &&
    prior.cashSale === next.cashSale &&
    prior.bankSale === next.bankSale &&
    prior.bkashSale === next.bkashSale &&
    prior.pathaoSale === next.pathaoSale &&
    prior.foodiSale === next.foodiSale &&
    prior.foodpandaSale === next.foodpandaSale &&
    prior.remainingBalance === next.remainingBalance &&
    normalizeExpenseLinesForCompare(prior.expenseLines) ===
      normalizeExpenseLinesForCompare(next.expenseLines)
  );
}

function savedLineKind(line: ExpenseLineSaved): "vendor" | "regular" {
  return line.kind === "regular" ? "regular" : "vendor";
}

function draftsFromRow(r: DailyEntryRow): ExpenseLineDraft[] {
  if (r.expenseLines && r.expenseLines.length > 0) {
    return r.expenseLines.map((line) => {
      const kind = savedLineKind(line);
      return {
        id: newLineId(),
        kind,
        vendor: kind === "vendor" ? (line.vendor ?? "") : "",
        label: kind === "regular" ? (line.label ?? "") : "",
        amount: line.amount === 0 ? "" : String(line.amount),
        receiptDataUrls: [...(line.receiptDataUrls ?? [])],
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
        amount: String(r.expenses),
        receiptDataUrls: [],
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
  const expenseSum = expenseLineDrafts.reduce((s, line) => s + parseAmount(line.amount), 0);
  return parseAmount(openingBalance) + salesSum - expenseSum;
}

function readRows(): DailyEntryMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DailyEntryMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Vendors seen on any saved daily entry (for dropdown). */
function collectVendorsFromStorage(): string[] {
  const map = readRows();
  const set = new Set<string>();
  for (const row of Object.values(map)) {
    for (const line of row.expenseLines ?? []) {
      if (savedLineKind(line) !== "vendor") continue;
      const v = (line.vendor ?? "").trim();
      if (v) set.add(v);
    }
  }
  return Array.from(set);
}

function buildVendorOptions(draftLines: ExpenseLineDraft[]): string[] {
  const set = new Set<string>([
    ...collectVendorsFromStorage(),
    "Utilities",
    "Rent",
    "Supplier",
    "Transport",
  ]);
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

function listSavedEntriesDescending(): DailyEntryRow[] {
  const map = readRows();
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

function writeRows(rows: DailyEntryMap): { ok: true } | { ok: false; message: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof DOMException && e.name === "QuotaExceededError"
        ? "Storage full — clear browser data or export entries."
        : "Could not save — check browser storage permissions.";
    return { ok: false, message };
  }
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
  const [expenseLines, setExpenseLines] = useState<ExpenseLineDraft[]>(() => []);
  const [notice, setNotice] = useState("");
  const [openingEdit, setOpeningEdit] = useState(false);
  const [historyDetailRow, setHistoryDetailRow] = useState<DailyEntryRow | null>(null);
  const openingInputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);

  const historyRows = useMemo(() => listSavedEntriesDescending(), [
    savedListVersion,
    activeView,
  ]);

  const savedRowForDate = useMemo(
    () => readRows()[dateKey],
    [dateKey, savedListVersion],
  );

  const vendorOptions = useMemo(
    () => buildVendorOptions(expenseLines),
    [expenseLines, savedListVersion],
  );

  const expenseSum = useMemo(
    () => expenseLines.reduce((s, line) => s + parseAmount(line.amount), 0),
    [expenseLines],
  );

  const enteredSalesTotal = useMemo(
    () =>
      parseAmount(cashSale) +
      parseAmount(bankSale) +
      parseAmount(bkashSale) +
      parseAmount(pathaoSale) +
      parseAmount(foodiSale) +
      parseAmount(foodpandaSale),
    [cashSale, bankSale, bkashSale, pathaoSale, foodiSale, foodpandaSale],
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
      expenseLines,
    ],
  );

  useEffect(() => {
    setDateFieldText(formatDateKeyAsDisplay(dateKey));
  }, [dateKey]);

  useEffect(() => {
    setOpeningEdit(false);
    const rows = readRows();
    const existing = rows[dateKey];
    if (existing) {
      setOpeningBalance(String(existing.openingBalance));
      setCashSale(String(existing.cashSale));
      setBankSale(String(existing.bankSale));
      setBkashSale(String(existing.bkashSale));
      setPathaoSale(String(existing.pathaoSale));
      setFoodiSale(String(existing.foodiSale));
      setFoodpandaSale(String(existing.foodpandaSale));
      setExpenseLines(draftsFromRow(existing));
      setNotice("");
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
    setExpenseLines([]);
    setNotice("");
  }, [dateKey]);

  useEffect(() => {
    if (openingEdit) openingInputRef.current?.focus();
  }, [openingEdit]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!historyDetailRow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistoryDetailRow(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyDetailRow]);

  // TEMP: Alt+X = random fields for quick Save testing — remove this block when done.
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
      setExpenseLines([
        { ...newVendorExpenseLine(), vendor: "Test vendor", amount: rnd() },
        { ...newRegularExpenseLine(), label: "Test misc", amount: rnd() },
      ]);
      setNotice("Alt+X test fill");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeView]);

  function patchLine(
    id: string,
    patch: Partial<Pick<ExpenseLineDraft, "vendor" | "amount" | "label" | "receiptDataUrls">>,
  ) {
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
    setExpenseLines((lines) => lines.filter((l) => l.id !== id));
  }

  function renderExpenseReceiptStrip(line: ExpenseLineDraft) {
    const urls = line.receiptDataUrls;
    const canAddMore = urls.length < MAX_RECEIPTS_PER_LINE;
    const inputId = `daily-expense-receipt-${line.id}`;
    return (
      <div className="flex flex-wrap items-center gap-1 border-t border-solid [border-color:var(--pos-divider)] pt-1">
        {urls.map((url, idx) => (
          <div key={`${line.id}-r-${idx}`} className="relative inline-flex">
            <img
              src={url}
              alt=""
              className="size-11 rounded-[6px] border border-solid [border-color:var(--pos-divider)] object-cover"
            />
            <button
              type="button"
              className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] text-[10px] leading-none text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]"
              aria-label="Remove receipt image"
              onClick={() =>
                patchLine(line.id, {
                  receiptDataUrls: urls.filter((_, j) => j !== idx),
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        {canAddMore ? (
          <>
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
                  else setNotice(result.message);
                })();
              }}
            />
            <label
              htmlFor={inputId}
              className="inline-flex cursor-pointer items-center gap-1 rounded-[6px] border border-dashed border-[var(--pos-border-medium)] px-2 py-1 text-[10px] font-medium text-[var(--pos-text-2)] hover:border-[var(--pos-sb-base)] hover:text-[var(--pos-text-1)]"
            >
              <ImagePlus className="size-3.5 shrink-0" strokeWidth={2.25} />
              Receipt
            </label>
          </>
        ) : (
          <span className="text-[9px] text-[var(--pos-text-2)]">
            Max {MAX_RECEIPTS_PER_LINE} images
          </span>
        )}
      </div>
    );
  }

  function handleSave() {
    const vendorAmountNoName = expenseLines.some(
      (line) =>
        line.kind === "vendor" &&
        parseAmount(line.amount) > 0 &&
        !line.vendor.trim(),
    );
    if (vendorAmountNoName) {
      setNotice("Vendor expense: each amount needs a vendor (or remove the row).");
      return;
    }
    const vendorNameNoAmount = expenseLines.some(
      (line) =>
        line.kind === "vendor" && line.vendor.trim() && parseAmount(line.amount) <= 0,
    );
    if (vendorNameNoAmount) {
      setNotice("Vendor expense: enter an amount for each vendor, or remove the row.");
      return;
    }
    const regularLabelNoAmount = expenseLines.some(
      (line) =>
        line.kind === "regular" && line.label.trim() && parseAmount(line.amount) <= 0,
    );
    if (regularLabelNoAmount) {
      setNotice("Regular expense: enter an amount when you add a description.");
      return;
    }

    const linesToSave: ExpenseLineSaved[] = [];
    for (const line of expenseLines) {
      const amt = parseAmount(line.amount);
      const receiptUrls = line.receiptDataUrls.filter(Boolean);
      const receiptField =
        receiptUrls.length > 0 ? ({ receiptDataUrls: receiptUrls } as const) : {};
      if (line.kind === "vendor") {
        const v = line.vendor.trim();
        if (v && amt > 0) {
          linesToSave.push({ kind: "vendor", vendor: v, amount: amt, ...receiptField });
        }
      } else {
        if (amt > 0) {
          const label = line.label.trim();
          linesToSave.push({
            kind: "regular",
            ...(label ? { label } : {}),
            amount: amt,
            ...receiptField,
          });
        }
      }
    }

    const expenseTotal = linesToSave.reduce((s, line) => s + line.amount, 0);

    const rows = readRows();
    const prior = rows[dateKey];
    const next: DailyEntryRow = {
      date: dateKey,
      openingBalance: parseAmount(openingBalance),
      cashSale: parseAmount(cashSale),
      bankSale: parseAmount(bankSale),
      bkashSale: parseAmount(bkashSale),
      pathaoSale: parseAmount(pathaoSale),
      foodiSale: parseAmount(foodiSale),
      foodpandaSale: parseAmount(foodpandaSale),
      expenses: expenseTotal,
      expenseLines: linesToSave,
      remainingBalance: remaining,
      updatedAt: new Date().toISOString(),
    };

    if (prior && savedEntryBodyEquals(prior, next)) {
      setNotice(
        "Nothing changed — this day already has that entry. Edit the form to update it, or choose another date.",
      );
      return;
    }

    rows[dateKey] = next;
    const result = writeRows(rows);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setSavedListVersion((v) => v + 1);
    setOpeningEdit(false);
    setNotice(
      prior
        ? `Updated ${formatDateKeyAsDisplay(dateKey)}. One entry per day — use Edit on a row or Add Entry for another date.`
        : `Saved ${formatDateKeyAsDisplay(dateKey)}. One entry per day — Add Entry for another date or review the list below.`,
    );
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

  function deleteHistoryEntryForDate(dateIso: string) {
    const label = formatDateKeyAsDisplay(dateIso);
    if (
      !window.confirm(
        `Delete the saved entry for ${label}? This cannot be undone.`,
      )
    ) {
      return;
    }
    const rows = readRows();
    if (!rows[dateIso]) return;
    delete rows[dateIso];
    const result = writeRows(rows);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setSavedListVersion((v) => v + 1);
    setNotice("Entry deleted from this device.");
    setHistoryDetailRow((open) => (open?.date === dateIso ? null : open));
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[12px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]">
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
            <span className="self-center text-[11px] tabular-nums text-[var(--pos-text-2)]">
              {historyRows.length} saved
            </span>
          )}
        </div>
      </div>

      {notice ? (
        <div
          className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2 text-[11px] leading-snug text-[var(--pos-text-1)]"
          role="status"
          aria-live="polite"
        >
          {notice}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeView === "history" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-auto px-3 py-2">
            <p className="shrink-0 text-[11px] text-[var(--pos-text-2)]">
              Use <span className="font-medium text-[var(--pos-text-1)]">Add Entry</span> in the
              table header to open the form, or View / Edit / Delete on a row.
            </p>
            {historyRows.length === 0 ? (
              <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-dashed border-[var(--pos-border-medium)]">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-dashed border-[var(--pos-border-medium)] bg-[var(--pos-page)] px-3 py-2">
                  <h2 className={`m-0 min-w-0 leading-tight ${sectionTitleClass}`}>
                    Saved entries
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveView("entry")}
                    className="shrink-0 rounded-[7px] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "var(--pos-sb-base)" }}
                  >
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
                    className="shrink-0 rounded-[7px] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "var(--pos-sb-base)" }}
                  >
                    Add Entry
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)]">
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Date</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Opening</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Sales Σ</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Expenses Σ</th>
                      <th className="px-3 py-2 font-semibold text-[var(--pos-text-2)]">Remaining</th>
                      <th className="px-3 py-2 text-right font-semibold text-[var(--pos-text-2)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((r) => (
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
                          {formatMoney(salesTotal(r))}
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
                              onClick={() => deleteHistoryEntryForDate(r.date)}
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
        ) : (
          <form
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-2">
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
                Total from vendor lines below
              </p>
            </div>
            <div className={statCardClass}>
              <p className={labelClass}>Sales</p>
              <p className="text-[15px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
                {formatMoney(enteredSalesTotal)}
              </p>
              <p className="text-[9px] normal-case font-normal leading-snug tracking-normal text-[var(--pos-text-2)]">
                All channels combined
              </p>
            </div>
            <div className={statCardClass}>
              <p className={labelClass}>Remaining</p>
              <p className="text-[15px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]">
                {formatMoney(remaining)}
              </p>
              <p className="text-[9px] normal-case font-normal leading-snug tracking-normal text-[var(--pos-text-2)]">
                Opening + sales − expenses (closing)
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden md:overflow-y-hidden">
            <div className="grid h-full min-h-0 grid-cols-1 gap-2 md:grid-cols-2 md:items-stretch md:gap-2">
              <div className={`${columnShellClass} order-2`}>
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
              </div>

              <div className={`${columnShellClass} min-h-0 order-1`}>
                <p className="border-b border-solid [border-color:var(--pos-divider)] pb-1 text-[11px] font-semibold text-[var(--pos-text-1)]">
                  Expenses
                </p>
                <p className="text-[10px] text-[var(--pos-text-2)]">
                  Vendor lines use the dropdown; regular lines use a text field (no vendor). Attach
                  receipt photos per line (images only, up to {MAX_RECEIPTS_PER_LINE} per line, ~
                  {(MAX_RECEIPT_BYTES / 1_000_000).toFixed(1)} MB each) — stored on this device with
                  the entry. Total updates the Expenses stat card.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={addVendorExpenseLine}
                    className="rounded-[7px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-2 py-1.5 text-center text-[10px] font-semibold leading-tight text-[var(--pos-text-1)] transition-colors hover:border-[var(--pos-sb-base)] hover:bg-[var(--pos-nav-hover)]/30"
                  >
                    Add Vendor Expense
                  </button>
                  <button
                    type="button"
                    onClick={addRegularExpenseLine}
                    className="rounded-[7px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-2 py-1.5 text-center text-[10px] font-semibold leading-tight text-[var(--pos-text-1)] transition-colors hover:border-[var(--pos-sb-base)] hover:bg-[var(--pos-nav-hover)]/30"
                  >
                    Add Regular Expense
                  </button>
                </div>
                {expenseLines.length > 0 ? (
                  <div className="grid grid-cols-[1fr_4.25rem_2rem] gap-x-1 gap-y-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
                    <span className="pl-0.5">Vendor / note</span>
                    <span className="text-center">Amt</span>
                    <span className="sr-only">Del</span>
                  </div>
                ) : (
                  <p className="text-[10px] italic text-[var(--pos-text-2)]">No expense lines yet.</p>
                )}
                <div className="min-h-0 max-h-[min(14rem,34svh)] space-y-1.5 overflow-y-auto pr-0.5">
                  {expenseLines.map((line) => {
                    if (line.kind === "regular") {
                      return (
                        <div
                          key={line.id}
                          className="space-y-1 rounded-[6px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]/30 p-1"
                        >
                          <div className="grid grid-cols-[1fr_4.25rem_2rem] items-start gap-x-1 gap-y-0">
                            <input
                              type="text"
                              value={line.label}
                              onChange={(e) => patchLine(line.id, { label: e.target.value })}
                              placeholder="Description (optional)"
                              className={textInputClass}
                              autoComplete="off"
                              aria-label="Regular expense note"
                            />
                            <input
                              {...amountFieldProps("next")}
                              value={line.amount}
                              onChange={(e) => patchLine(line.id, { amount: e.target.value })}
                              className={inputClass}
                              aria-label="Regular expense amount"
                            />
                            <button
                              type="button"
                              onClick={() => removeExpenseLine(line.id)}
                              className="inline-flex size-8 shrink-0 items-center justify-center justify-self-center rounded-[6px] border border-solid [border-color:var(--pos-divider)] text-[16px] leading-none text-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)]"
                              aria-label="Remove expense line"
                            >
                              ×
                            </button>
                          </div>
                          {renderExpenseReceiptStrip(line)}
                        </div>
                      );
                    }

                    const trimmed = line.vendor.trim();
                    const inList = trimmed !== "" && vendorOptions.includes(trimmed);
                    const selectValue =
                      trimmed === "" ? "" : inList ? trimmed : VENDOR_OTHER_VALUE;
                    const showOtherInput = selectValue === VENDOR_OTHER_VALUE;

                    return (
                      <div
                        key={line.id}
                        className="space-y-1 rounded-[6px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]/30 p-1"
                      >
                        <div className="grid grid-cols-[1fr_4.25rem_2rem] items-start gap-x-1 gap-y-0">
                          <div className="flex min-w-0 flex-col gap-1">
                            <select
                              className={selectClass}
                              value={selectValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "") {
                                  patchLine(line.id, { vendor: "" });
                                } else if (val === VENDOR_OTHER_VALUE) {
                                  if (inList) patchLine(line.id, { vendor: "" });
                                } else {
                                  patchLine(line.id, { vendor: val });
                                }
                              }}
                              aria-label="Expense vendor"
                            >
                              <option value="">Select vendor…</option>
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
                                placeholder="Type vendor name"
                                className={textInputClass}
                                autoComplete="off"
                                aria-label="Custom vendor name"
                              />
                            ) : null}
                          </div>
                          <input
                            {...amountFieldProps("next")}
                            value={line.amount}
                            onChange={(e) => patchLine(line.id, { amount: e.target.value })}
                            className={inputClass}
                            aria-label="Expense amount"
                          />
                          <button
                            type="button"
                            onClick={() => removeExpenseLine(line.id)}
                            className="inline-flex size-8 shrink-0 items-center justify-center justify-self-center rounded-[6px] border border-solid [border-color:var(--pos-divider)] text-[16px] leading-none text-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)]"
                            aria-label="Remove expense line"
                          >
                            ×
                          </button>
                        </div>
                        {renderExpenseReceiptStrip(line)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5 border-t border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2">
          <p className="text-[10px] leading-snug text-[var(--pos-text-2)]">
            {savedRowForDate
              ? "This date already has one saved entry. Save again replaces it with the values above — one record per calendar day."
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
        )}
      </div>

      {historyDetailRow ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-detail-title"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          onClick={() => setHistoryDetailRow(null)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h2
                id="history-detail-title"
                className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
              >
                {formatDateKeyAsDisplay(historyDetailRow.date)}
              </h2>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-[12px] text-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)]"
                onClick={() => setHistoryDetailRow(null)}
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
            <div className="rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-3">
              <p className={sectionTitleClass}>Expenses</p>
              {historyDetailRow.expenseLines && historyDetailRow.expenseLines.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {historyDetailRow.expenseLines.map((line, idx) => {
                    const kind = savedLineKind(line);
                    const title =
                      kind === "vendor"
                        ? (line.vendor ?? "").trim() || "Vendor"
                        : (line.label ?? "").trim() || "Expense";
                    const receipts = line.receiptDataUrls ?? [];
                    return (
                      <li
                        key={`${title}-${idx}`}
                        className="border-b border-solid [border-color:var(--pos-divider)] pb-2 last:border-b-0 last:pb-0"
                      >
                        <div className="flex justify-between gap-3 text-[12px] text-[var(--pos-text-1)]">
                          <span className="min-w-0 break-words">{title}</span>
                          <span className="shrink-0 tabular-nums">{formatMoney(line.amount)}</span>
                        </div>
                        {receipts.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {receipts.map((url, ri) => (
                              <a
                                key={`${idx}-r-${ri}`}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-block rounded-[6px] border border-solid [border-color:var(--pos-divider)]"
                              >
                                <img
                                  src={url}
                                  alt={`Receipt ${ri + 1} for ${title}`}
                                  className="size-14 object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (historyDetailRow.expenses ?? 0) > 0 ? (
                <p className="mt-2 text-[12px] text-[var(--pos-text-2)]">
                  Legacy total (no line breakdown): {formatMoney(historyDetailRow.expenses)}
                </p>
              ) : (
                <p className="mt-2 text-[12px] text-[var(--pos-text-2)]">No expenses recorded.</p>
              )}
              <div className="mt-2 flex justify-between border-t border-solid [border-color:var(--pos-divider)] pt-2 text-[12px]">
                <span className="font-medium text-[var(--pos-text-2)]">Expenses total</span>
                <span className="tabular-nums font-semibold text-[var(--pos-text-1)]">
                  {formatMoney(expenseTotalFromRow(historyDetailRow))}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-3">
              <div className="flex justify-between gap-4 text-[12px]">
                <span className="text-[var(--pos-text-2)]">Opening</span>
                <span className="tabular-nums text-[var(--pos-text-1)]">
                  {formatMoney(historyDetailRow.openingBalance)}
                </span>
              </div>
              <p className={`mt-1 ${sectionTitleClass}`}>Sales</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                {(
                  [
                    ["Cash", historyDetailRow.cashSale],
                    ["Bank", historyDetailRow.bankSale],
                    ["bKash", historyDetailRow.bkashSale],
                    ["Pathao", historyDetailRow.pathaoSale],
                    ["Foodi", historyDetailRow.foodiSale],
                    ["Foodpanda", historyDetailRow.foodpandaSale],
                  ] as const
                ).map(([label, amt]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-[var(--pos-text-2)]">{label}</span>
                    <span className="tabular-nums text-[var(--pos-text-1)]">{formatMoney(amt)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between gap-4 border-t border-solid [border-color:var(--pos-divider)] pt-1.5 text-[12px]">
                <span className="font-medium text-[var(--pos-text-2)]">Sales total</span>
                <span className="tabular-nums font-semibold text-[var(--pos-text-1)]">
                  {formatMoney(salesTotal(historyDetailRow))}
                </span>
              </div>
            </div>
            <div className="flex justify-between rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2 text-[13px]">
              <span className="font-semibold text-[var(--pos-text-2)]">Remaining (closing)</span>
              <span className="font-semibold tabular-nums text-[var(--pos-text-1)]">
                {formatMoney(historyDetailRow.remainingBalance)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="inline-flex h-9 min-w-[7rem] items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30"
                onClick={() => setHistoryDetailRow(null)}
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
                  setHistoryDetailRow(null);
                }}
              >
                Edit in form
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
