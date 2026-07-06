/** Persisted salary register — one sheet per calendar month (Employee Salaries). */

import type { Employee } from "./employeeDirectoryStorage";
import {
  findEmployeeByName,
  getActiveEmployeesSnapshot,
  getEmployeeById,
  mergeRosterNames,
} from "./employeeDirectoryStorage";
import { getEmployeeDirectoryLoadState } from "@/features/employees/employeeDirectoryStore";

export type SalaryPaymentEmployeeLineKind =
  | "salary"
  | "service_charge"
  | "bonus"
  | "overtime";

export type SalaryPayment = {
  id: string;
  /** Whole currency units (e.g. BDT). */
  amount: number;
  /** Calendar date of disbursement (YYYY-MM-DD). */
  date: string;
  note?: string;
  /** Daily Entry expense line id after posting to daily books. */
  dailyEntryLineId?: string;
  /** Calendar day of the Daily Entry row (YYYY-MM-DD). */
  dailyEntryDate?: string;
  /** Staff payment type used when posted to Daily Entry. */
  postedEmployeeLineKind?: SalaryPaymentEmployeeLineKind;
};

export type SalarySheetRow = {
  id: string;
  /** Links to {@link Employee.id} in the employee directory. */
  employeeId: string;
  /** Display name (kept in sync with the directory). */
  name: string;
  /** Whole currency units (e.g. BDT). */
  basic: number;
  /** Service-charge weight; null or 0 = no auto split for that row. */
  pct: number | null;
  serviceCharge: number;
  overtime: number;
  eidBonus: number;
  /** Damage / policy fines deducted from this month's pay (whole BDT). */
  fines: number;
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

const LEGACY_SALARY_SHEET_V1_KEY = "krunch.pos.salarySheet.v1";
const LEGACY_SALARY_SHEET_V2_KEY = "krunch.pos.salarySheet.v2";

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
  const gross = r.basic + r.serviceCharge + r.overtime + r.eidBonus;
  const fines = Number.isFinite(r.fines) ? Math.max(0, Math.round(r.fines)) : 0;
  return Math.max(0, gross - fines);
}

export function sumPaymentsForRow(r: SalarySheetRow): number {
  if (!Array.isArray(r.payments)) return 0;
  return r.payments.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0);
}

export function isSalaryPaymentPosted(p: SalaryPayment): boolean {
  return Boolean(p.dailyEntryLineId && p.dailyEntryDate);
}

function docUpdatedAtMs(doc: SalarySheetDoc): number {
  const t = Date.parse(doc.updatedAt);
  return Number.isFinite(t) ? t : 0;
}

/** Prefer the sheet with the latest `updatedAt` when both exist for a month. */
export function mergeSalarySheetBundles(
  remote: SalarySheetBundle,
  local: SalarySheetBundle,
): SalarySheetBundle {
  const months: Record<string, SalarySheetDoc> = { ...remote.months };
  for (const [monthKey, localDoc] of Object.entries(local.months)) {
    if (!localDoc) continue;
    const remoteDoc = months[monthKey];
    if (!remoteDoc) {
      months[monthKey] = localDoc;
      continue;
    }
    months[monthKey] =
      docUpdatedAtMs(localDoc) > docUpdatedAtMs(remoteDoc) ? localDoc : remoteDoc;
  }
  return {
    selectedMonthKey: remote.selectedMonthKey || local.selectedMonthKey,
    months,
  };
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

export function sumPostedPaymentsForDoc(doc: SalarySheetDoc): number {
  let total = 0;
  for (const r of doc.rows) {
    for (const p of r.payments) {
      if (isSalaryPaymentPosted(p)) total += p.amount;
    }
  }
  return total;
}

export function countUnpostedPayments(doc: SalarySheetDoc): number {
  let count = 0;
  for (const r of doc.rows) {
    for (const p of r.payments) {
      if (!isSalaryPaymentPosted(p) && p.amount > 0) count += 1;
    }
  }
  return count;
}

export function summarizeSalaryDocWithPosting(doc: SalarySheetDoc): {
  totalPayable: number;
  totalPaidRecorded: number;
  outstanding: number;
  totalPostedToBooks: number;
  totalUnposted: number;
  unpostedCount: number;
} {
  const base = summarizeSalaryDoc(doc);
  const totalPostedToBooks = sumPostedPaymentsForDoc(doc);
  return {
    ...base,
    totalPostedToBooks,
    totalUnposted: base.totalPaidRecorded - totalPostedToBooks,
    unpostedCount: countUnpostedPayments(doc),
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

export function emptySalaryRow(): SalarySheetRow {
  return {
    id: newRowId(),
    employeeId: "",
    name: "",
    basic: 0,
    pct: null,
    serviceCharge: 0,
    overtime: 0,
    eidBonus: 0,
    fines: 0,
    payments: [],
  };
}

export function salaryRowForEmployeeRecord(emp: Employee): SalarySheetRow {
  return {
    id: newRowId(),
    employeeId: emp.id,
    name: emp.name,
    basic: emp.defaultBasicSalary > 0 ? emp.defaultBasicSalary : 0,
    pct: emp.serviceChargePct,
    serviceCharge: 0,
    overtime: 0,
    eidBonus: 0,
    fines: 0,
    payments: [],
  };
}

/** One row per active employee; preserves amounts and payouts; rematches stale employee ids by name. */
export function syncDocRowsToEmployees(
  doc: SalarySheetDoc,
  employees: Employee[],
): SalarySheetDoc {
  const active = employees.filter((e) => e.active);
  if (active.length === 0) return doc;

  const byEmployeeId = new Map<string, SalarySheetRow>();
  const byNormalizedName = new Map<string, SalarySheetRow>();
  for (const row of doc.rows) {
    if (row.employeeId) byEmployeeId.set(row.employeeId, row);
    const nameKey = row.name.trim().toLowerCase();
    if (nameKey && !byNormalizedName.has(nameKey)) {
      byNormalizedName.set(nameKey, row);
    } else if (row.name.trim()) {
      const hit = findEmployeeByName(row.name);
      if (hit) {
        const linked = { ...row, employeeId: hit.id, name: hit.name };
        byEmployeeId.set(hit.id, linked);
        const hitKey = hit.name.trim().toLowerCase();
        if (hitKey && !byNormalizedName.has(hitKey)) byNormalizedName.set(hitKey, linked);
      }
    }
  }

  const rows = active.map((emp) => {
    let existing = byEmployeeId.get(emp.id);
    if (!existing) {
      const nameKey = emp.name.trim().toLowerCase();
      const named = nameKey ? byNormalizedName.get(nameKey) : undefined;
      if (named) {
        existing = { ...named, employeeId: emp.id, name: emp.name };
      }
    }
    if (existing) {
      return {
        ...existing,
        name: emp.name,
        pct: emp.serviceChargePct,
        basic: emp.defaultBasicSalary > 0 ? emp.defaultBasicSalary : 0,
      };
    }
    return salaryRowForEmployeeRecord(emp);
  });

  return { ...doc, rows };
}

export function defaultDocForNewMonth(
  monthKey: string,
  employees: Employee[] = getActiveEmployeesSnapshot(),
): SalarySheetDoc {
  const t = new Date().toISOString();
  const active = employees.filter((e) => e.active);
  return {
    periodLabel: labelFromMonthKey(monthKey),
    rows: active.length > 0 ? active.map(salaryRowForEmployeeRecord) : [],
    updatedAt: t,
  };
}

export function ensureMonthDoc(
  monthKey: string,
  existing: SalarySheetDoc | undefined,
  employees: Employee[],
): SalarySheetDoc {
  const base = existing ?? defaultDocForNewMonth(monthKey, employees);
  return syncDocRowsToEmployees(
    { ...base, periodLabel: labelFromMonthKey(monthKey) },
    employees,
  );
}

/** Re-align every month in the bundle to the live employee roster (preserves pay data per person). */
export function syncSalaryBundleToEmployees(
  bundle: SalarySheetBundle,
  employees: Employee[],
): SalarySheetBundle {
  const months = { ...bundle.months };
  let changed = false;
  for (const k of Object.keys(months)) {
    if (!isMonthKey(k)) continue;
    const cur = months[k]!;
    const next = ensureMonthDoc(k, cur, employees);
    if (JSON.stringify(next) !== JSON.stringify(cur)) {
      months[k] = next;
      changed = true;
    }
  }
  return changed ? { ...bundle, months } : bundle;
}

export function emptySalarySheetBundle(
  monthKey = monthKeyFromDate(),
  employees: Employee[] = getActiveEmployeesSnapshot(),
): SalarySheetBundle {
  return {
    selectedMonthKey: monthKey,
    months: { [monthKey]: defaultDocForNewMonth(monthKey, employees) },
  };
}

function coerceFinesAmount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  if (Array.isArray(raw)) {
    let sum = 0;
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const amount = (item as Record<string, unknown>).amount;
      if (typeof amount === "number" && Number.isFinite(amount)) {
        sum += Math.max(0, Math.round(amount));
      }
    }
    return sum;
  }
  return 0;
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
  const dailyEntryLineId =
    typeof p.dailyEntryLineId === "string" && p.dailyEntryLineId.trim()
      ? p.dailyEntryLineId.trim()
      : undefined;
  const dailyEntryDate =
    typeof p.dailyEntryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.dailyEntryDate)
      ? p.dailyEntryDate
      : undefined;
  const kindRaw = p.postedEmployeeLineKind;
  const postedEmployeeLineKind =
    kindRaw === "salary" ||
    kindRaw === "service_charge" ||
    kindRaw === "bonus" ||
    kindRaw === "overtime"
      ? kindRaw
      : undefined;
  return {
    id,
    amount,
    date,
    ...(note ? { note } : {}),
    ...(dailyEntryLineId ? { dailyEntryLineId } : {}),
    ...(dailyEntryDate ? { dailyEntryDate } : {}),
    ...(postedEmployeeLineKind ? { postedEmployeeLineKind } : {}),
  };
}

function resolveRowEmployee(
  o: Record<string, unknown>,
): { employeeId: string; name: string } {
  const rawId = typeof o.employeeId === "string" ? o.employeeId.trim() : "";
  const rawName = typeof o.name === "string" ? o.name.trim() : "";
  if (rawId) {
    const emp = getEmployeeById(rawId);
    if (emp) return { employeeId: emp.id, name: emp.name };
    return { employeeId: rawId, name: rawName };
  }
  if (rawName) {
    const hit = findEmployeeByName(rawName);
    if (hit) return { employeeId: hit.id, name: hit.name };
  }
  return { employeeId: "", name: rawName };
}

function coerceRow(raw: unknown, rowMonthKey?: string): SalarySheetRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : newRowId();
  const { employeeId, name } = resolveRowEmployee(o);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);
  const pctRaw = o.pct;
  const pct =
    pctRaw === null || pctRaw === undefined || pctRaw === ""
      ? null
      : typeof pctRaw === "number" && Number.isFinite(pctRaw) && pctRaw > 0
        ? pctRaw
        : null;

  const fines = coerceFinesAmount(o.fines);

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
    employeeId,
    name,
    basic: num(o.basic),
    pct,
    serviceCharge: num(o.serviceCharge),
    overtime: num(o.overtime),
    eidBonus: num(o.eidBonus),
    fines,
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
  if (!Array.isArray(rowsRaw)) return null;

  const rows = rowsRaw
    .map((r) => coerceRow(r, rowMonthKey))
    .filter((row): row is SalarySheetRow => row !== null);
  if (rowsRaw.length > 0 && rows.length === 0) return null;

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
    const raw = localStorage.getItem(LEGACY_SALARY_SHEET_V1_KEY);
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
  return { ...doc, periodLabel: labelFromMonthKey(monthKey) };
}

export function coerceSalarySheetBundle(raw: unknown): SalarySheetBundle | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Record<string, unknown>;
  const selectedRaw = parsed.selectedMonthKey;
  const selectedMonthKey =
    typeof selectedRaw === "string" && isMonthKey(selectedRaw) ? selectedRaw : monthKeyFromDate();

  const months: Record<string, SalarySheetDoc> = {};
  const monthsRaw = parsed.months;
  if (monthsRaw && typeof monthsRaw === "object" && !Array.isArray(monthsRaw)) {
    for (const [k, v] of Object.entries(monthsRaw as Record<string, unknown>)) {
      if (!isMonthKey(k)) continue;
      const doc = coerceMonthEntry(k, v);
      if (doc) months[k] = { ...doc, periodLabel: labelFromMonthKey(k) };
    }
  }

  if (Object.keys(months).length === 0) return null;

  if (Array.isArray(parsed.roster)) {
    mergeRosterNames(
      parsed.roster.filter((x): x is string => typeof x === "string"),
    );
  }

  if (!months[selectedMonthKey]) {
    const employees = getEmployeeDirectoryLoadState().loaded
      ? getActiveEmployeesSnapshot()
      : [];
    months[selectedMonthKey] = defaultDocForNewMonth(selectedMonthKey, employees);
  }

  // Do not call ensureMonthDoc here — getActiveEmployeesSnapshot() may still be the
  // placeholder roster (random ids) before the API employee directory loads, which
  // would drop real rows (e.g. Mujib) and zero out fines. Row sync runs later once
  // both workspaces have loaded (EmployeeModuleView / syncSalaryBundleToEmployees).

  return { selectedMonthKey, months };
}

/** One-time read of browser-local salary data (pre-API). */
export function readLegacyLocalSalaryBundle(): SalarySheetBundle | null {
  try {
    const v2raw = localStorage.getItem(LEGACY_SALARY_SHEET_V2_KEY);
    if (v2raw) {
      const coerced = coerceSalarySheetBundle(JSON.parse(v2raw));
      if (coerced) return coerced;
    }

    const migrated = readV1SalaryDoc();
    if (migrated) {
      const key = monthKeyFromDate();
      return { selectedMonthKey: key, months: { [key]: migrated } };
    }
  } catch {
    /* ignore */
  }

  return null;
}

export function readSalarySheetBundle(): SalarySheetBundle {
  return readLegacyLocalSalaryBundle() ?? emptySalarySheetBundle();
}

export function clearLegacyLocalSalaryStorage(): void {
  try {
    localStorage.removeItem(LEGACY_SALARY_SHEET_V1_KEY);
    localStorage.removeItem(LEGACY_SALARY_SHEET_V2_KEY);
  } catch {
    /* ignore */
  }
}

export function writeSalarySheetBundle(
  bundle: SalarySheetBundle,
): { ok: true } | { ok: false; message: string } {
  try {
    localStorage.setItem(LEGACY_SALARY_SHEET_V2_KEY, JSON.stringify(bundle));
    try {
      localStorage.removeItem(LEGACY_SALARY_SHEET_V1_KEY);
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
