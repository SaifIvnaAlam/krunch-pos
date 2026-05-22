/** Persisted salary register — one sheet per calendar month (Employee Salaries). */

export type SalaryPayment = {
  id: string;
  /** Whole currency units (e.g. BDT). */
  amount: number;
  /** Calendar date of disbursement (YYYY-MM-DD). */
  date: string;
  note?: string;
};

export type SalarySheetRow = {
  id: string;
  name: string;
  /** Whole currency units (e.g. BDT). */
  basic: number;
  /** Service-charge weight; null or 0 = no auto split for that row. */
  pct: number | null;
  serviceCharge: number;
  overtime: number;
  eidBonus: number;
  /** Individual payouts (partial pays on different days). */
  payments: SalaryPayment[];
};

export type SalarySheetDoc = {
  periodLabel: string;
  rows: SalarySheetRow[];
  updatedAt: string;
};

/** `YYYY-MM` → one salary sheet. */
export type SalarySheetBundle = {
  selectedMonthKey: string;
  months: Record<string, SalarySheetDoc>;
};

const SALARY_SHEET_V1_KEY = "krunch.pos.salarySheet.v1";
export const SALARY_SHEET_STORAGE_KEY = "krunch.pos.salarySheet.v2";

function newRowId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function monthKeyFromDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function labelFromMonthKey(monthKey: string): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return monthKey;
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(y, mo - 1, 1));
}

export function isMonthKey(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s);
}

export function totalPayableForRow(r: SalarySheetRow): number {
  return r.basic + r.serviceCharge + r.overtime + r.eidBonus;
}

export function sumPaymentsForRow(r: SalarySheetRow): number {
  if (!Array.isArray(r.payments)) return 0;
  return r.payments.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0);
}

export function summarizeSalaryDoc(doc: SalarySheetDoc): {
  totalPayable: number;
  totalPaidRecorded: number;
  outstanding: number;
} {
  let totalPayable = 0;
  let totalPaidRecorded = 0;
  for (const r of doc.rows) {
    totalPayable += totalPayableForRow(r);
    totalPaidRecorded += sumPaymentsForRow(r);
  }
  return {
    totalPayable,
    totalPaidRecorded,
    outstanding: totalPayable - totalPaidRecorded,
  };
}

export function createSalaryPayment(amount: number, date: string, note?: string): SalaryPayment {
  const n = Math.max(0, Math.round(amount));
  const t = note?.trim();
  return {
    id: newRowId(),
    amount: n,
    date,
    ...(t ? { note: t } : {}),
  };
}

/** Split `pool` across rows with pct > 0, proportional to pct; whole units; ties broken by row order. */
export function distributeServiceChargePool(
  rows: SalarySheetRow[],
  pool: number,
): Map<string, number> {
  const out = new Map<string, number>();
  if (pool < 0 || !Number.isFinite(pool)) return out;

  const elig = rows.filter((r) => r.pct != null && r.pct > 0);
  const wsum = elig.reduce((s, r) => s + (r.pct as number), 0);
  if (wsum <= 0) return out;

  type Part = { id: string; floor: number; frac: number };
  const parts: Part[] = elig.map((r) => {
    const exact = (pool * (r.pct as number)) / wsum;
    const floor = Math.floor(exact);
    return { id: r.id, floor, frac: exact - floor };
  });

  let assigned = parts.reduce((s, p) => s + p.floor, 0);
  let remainder = Math.round(pool) - assigned;
  const order = [...parts.entries()].sort((a, b) => b[1].frac - a[1].frac || a[0] - b[0]);

  for (let j = 0; j < order.length && remainder > 0; j++) {
    order[j][1].floor += 1;
    remainder -= 1;
  }

  for (const p of parts) out.set(p.id, p.floor);
  return out;
}

function defaultRows(): SalarySheetRow[] {
  return [
    {
      id: newRowId(),
      name: "Jihad",
      basic: 25_000,
      pct: null,
      serviceCharge: 0,
      overtime: 2_420,
      eidBonus: 806,
      payments: [],
    },
    {
      id: newRowId(),
      name: "Ahad",
      basic: 9_000,
      pct: 9,
      serviceCharge: 16_655,
      overtime: 435,
      eidBonus: 0,
      payments: [],
    },
    {
      id: newRowId(),
      name: "Salim",
      basic: 10_000,
      pct: 9,
      serviceCharge: 16_655,
      overtime: 1_290,
      eidBonus: 323,
      payments: [],
    },
    {
      id: newRowId(),
      name: "Al-Amin",
      basic: 20_000,
      pct: null,
      serviceCharge: 0,
      overtime: 0,
      eidBonus: 645,
      payments: [],
    },
    {
      id: newRowId(),
      name: "Abdullah",
      basic: 7_484,
      pct: 7,
      serviceCharge: 12_118,
      overtime: 0,
      eidBonus: 258,
      payments: [],
    },
    {
      id: newRowId(),
      name: "Atick",
      basic: 8_000,
      pct: 5,
      serviceCharge: 9_253,
      overtime: 516,
      eidBonus: 0,
      payments: [],
    },
    {
      id: newRowId(),
      name: "Mojeeb",
      basic: 16_000,
      pct: null,
      serviceCharge: 0,
      overtime: 0,
      eidBonus: 0,
      payments: [],
    },
  ];
}

export function emptySalaryRow(): SalarySheetRow {
  return {
    id: newRowId(),
    name: "",
    basic: 0,
    pct: null,
    serviceCharge: 0,
    overtime: 0,
    eidBonus: 0,
    payments: [],
  };
}

export function defaultDocForNewMonth(monthKey: string): SalarySheetDoc {
  const t = new Date().toISOString();
  return {
    periodLabel: labelFromMonthKey(monthKey),
    rows: [emptySalaryRow()],
    updatedAt: t,
  };
}

/** Demo / template rows for the active month (period label follows the month). */
export function exampleSalaryDocForMonth(monthKey: string): SalarySheetDoc {
  const t = new Date().toISOString();
  return {
    periodLabel: labelFromMonthKey(monthKey),
    rows: defaultRows(),
    updatedAt: t,
  };
}

function defaultSalarySheetBundle(): SalarySheetBundle {
  const key = monthKeyFromDate();
  return {
    selectedMonthKey: key,
    months: {
      [key]: exampleSalaryDocForMonth(key),
    },
  };
}

function coercePayment(raw: unknown): SalaryPayment | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = typeof p.id === "string" && p.id ? p.id : newRowId();
  const amount =
    typeof p.amount === "number" && Number.isFinite(p.amount) ? Math.max(0, Math.round(p.amount)) : 0;
  const dateRaw = p.date;
  const date =
    typeof dateRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
      ? dateRaw
      : new Date().toISOString().slice(0, 10);
  const noteRaw = p.note;
  const note = typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim() : undefined;
  return { id, amount, date, ...(note ? { note } : {}) };
}

function coerceRow(raw: unknown, rowMonthKey?: string): SalarySheetRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : newRowId();
  const name = typeof o.name === "string" ? o.name : "";
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);
  const pctRaw = o.pct;
  const pct =
    pctRaw === null || pctRaw === undefined || pctRaw === ""
      ? null
      : typeof pctRaw === "number" && Number.isFinite(pctRaw) && pctRaw > 0
        ? pctRaw
        : null;

  const paymentsRaw = o.payments;
  let payments: SalaryPayment[] = [];
  if (Array.isArray(paymentsRaw)) {
    payments = paymentsRaw.map(coercePayment).filter((x): x is SalaryPayment => x !== null);
  }

  const paidRaw = o.totalPaid;
  const legacyPaid =
    paidRaw === null || paidRaw === undefined || paidRaw === ""
      ? null
      : typeof paidRaw === "number" && Number.isFinite(paidRaw)
        ? Math.round(paidRaw)
        : null;

  if (payments.length === 0 && legacyPaid != null && legacyPaid > 0) {
    const fallbackDate =
      rowMonthKey && isMonthKey(rowMonthKey) ? `${rowMonthKey}-01` : new Date().toISOString().slice(0, 10);
    payments = [
      {
        id: newRowId(),
        amount: legacyPaid,
        date: fallbackDate,
        note: "Imported from single total",
      },
    ];
  }

  return {
    id,
    name,
    basic: num(o.basic),
    pct,
    serviceCharge: num(o.serviceCharge),
    overtime: num(o.overtime),
    eidBonus: num(o.eidBonus),
    payments,
  };
}

function coerceSalarySheetDoc(
  parsed: Record<string, unknown>,
  rowMonthKey?: string,
): SalarySheetDoc | null {
  const periodLabel =
    typeof parsed.periodLabel === "string" && parsed.periodLabel.trim()
      ? parsed.periodLabel.trim()
      : "";
  const rowsRaw = parsed.rows;
  if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) return null;

  const rows = rowsRaw
    .map((r) => coerceRow(r, rowMonthKey))
    .filter((row): row is SalarySheetRow => row !== null);
  if (rows.length === 0) return null;

  const updatedAt =
    typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString();
  return {
    periodLabel: periodLabel || "Pay period",
    rows,
    updatedAt,
  };
}

function readV1SalaryDoc(): SalarySheetDoc | null {
  try {
    const raw = localStorage.getItem(SALARY_SHEET_V1_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return coerceSalarySheetDoc(parsed, monthKeyFromDate());
  } catch {
    return null;
  }
}

function coerceMonthEntry(monthKey: string, raw: unknown): SalarySheetDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = coerceSalarySheetDoc(raw as Record<string, unknown>, monthKey);
  if (!doc) return null;
  if (!doc.periodLabel.trim()) {
    return { ...doc, periodLabel: labelFromMonthKey(monthKey) };
  }
  return doc;
}

export function readSalarySheetBundle(): SalarySheetBundle {
  try {
    const v2raw = localStorage.getItem(SALARY_SHEET_STORAGE_KEY);
    if (v2raw) {
      const parsed = JSON.parse(v2raw) as Record<string, unknown>;
      const selectedRaw = parsed.selectedMonthKey;
      const selectedMonthKey =
        typeof selectedRaw === "string" && isMonthKey(selectedRaw) ? selectedRaw : monthKeyFromDate();

      const months: Record<string, SalarySheetDoc> = {};
      const monthsRaw = parsed.months;
      if (monthsRaw && typeof monthsRaw === "object" && !Array.isArray(monthsRaw)) {
        for (const [k, v] of Object.entries(monthsRaw as Record<string, unknown>)) {
          if (!isMonthKey(k)) continue;
          const doc = coerceMonthEntry(k, v);
          if (doc) months[k] = doc;
        }
      }

      if (Object.keys(months).length === 0) return defaultSalarySheetBundle();

      if (!months[selectedMonthKey]) {
        months[selectedMonthKey] = defaultDocForNewMonth(selectedMonthKey);
      }

      return { selectedMonthKey, months };
    }

    const migrated = readV1SalaryDoc();
    if (migrated) {
      const key = monthKeyFromDate();
      return { selectedMonthKey: key, months: { [key]: migrated } };
    }
  } catch {
    /* fall through */
  }

  return defaultSalarySheetBundle();
}

export function writeSalarySheetBundle(
  bundle: SalarySheetBundle,
): { ok: true } | { ok: false; message: string } {
  try {
    localStorage.setItem(SALARY_SHEET_STORAGE_KEY, JSON.stringify(bundle));
    try {
      localStorage.removeItem(SALARY_SHEET_V1_KEY);
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof DOMException && e.name === "QuotaExceededError"
        ? "Storage full — export or clear other saved data."
        : "Could not save salary sheet.";
    return { ok: false, message };
  }
}
