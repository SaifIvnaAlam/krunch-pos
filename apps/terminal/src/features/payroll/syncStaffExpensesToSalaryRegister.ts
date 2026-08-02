import { getActiveEmployeesStoreSnapshot } from "@/features/employees/employeeDirectoryStore";
import { loadDailyEntryMap } from "@/features/daily-entry/dailyEntryRepository";
import { savedLineKind } from "@/features/daily-entry/calculations";
import {
  employeeIdFromSavedStaffLine,
  employeeNameFromSavedStaffLine,
  isLegacyStaffVendorLine,
  isStaffFineExpenseLine,
} from "@/features/daily-entry/staffExpenseLine";
import type { DailyEntryMap, DailyEntryRow, ExpenseLineSaved } from "@/features/daily-entry/types";
import {
  createSalaryPayment,
  ensureMonthDoc,
  isMonthKey,
  salaryRowForEmployeeRecord,
  type SalaryPayment,
  type SalarySheetBundle,
  type SalarySheetDoc,
} from "../../lib/salarySheetStorage";
import { getEmployeeById } from "../../lib/employeeDirectoryStorage";
import {
  flushSalaryWorkspacePersist,
  getSalaryBundle,
  loadSalaryWorkspace,
  setSalaryBundle,
} from "./salaryWorkspaceStore";
import { oldestOwingMonthForEmployee } from "./employeeSalaryBalance";
import { STAFF_ADVANCE_LINE_KIND, STAFF_LINE_KIND } from "./staffLineKinds";

export type SyncStaffExpensesResult =
  | { ok: true; lines: ExpenseLineSaved[]; bundle: SalarySheetBundle }
  | { ok: false; message: string };

function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function staffLineKindFromSaved(line: ExpenseLineSaved): typeof STAFF_LINE_KIND | typeof STAFF_ADVANCE_LINE_KIND {
  if (line.staffLineKind === STAFF_ADVANCE_LINE_KIND) return STAFF_ADVANCE_LINE_KIND;
  return STAFF_LINE_KIND;
}

function normalizeStaffLine(line: ExpenseLineSaved): ExpenseLineSaved | null {
  if (isStaffFineExpenseLine(line)) return null;
  if (line.kind === "staff") {
    const employeeId = line.employeeId?.trim();
    if (!employeeId || line.amount <= 0) return null;
    const emp = getEmployeeById(employeeId);
    return {
      ...line,
      kind: "staff",
      employeeId,
      employeeName: emp?.name ?? line.employeeName?.trim() ?? "",
      staffLineKind: staffLineKindFromSaved(line),
      ...(line.salaryPaymentId ? { salaryPaymentId: line.salaryPaymentId } : {}),
    };
  }
  if (!isLegacyStaffVendorLine(line) || line.amount <= 0) return null;
  const employeeId = employeeIdFromSavedStaffLine(line);
  if (!employeeId) return null;
  const emp = getEmployeeById(employeeId);
  return {
    kind: "staff",
    employeeId,
    employeeName: emp?.name ?? employeeNameFromSavedStaffLine(line),
    staffLineKind: STAFF_LINE_KIND,
    amount: line.amount,
    lineId: line.lineId,
    note: (line.note ?? line.ledgerNote ?? "").trim() || undefined,
    receiptDataUrls: line.receiptDataUrls,
    ...(line.salaryPaymentId ? { salaryPaymentId: line.salaryPaymentId } : {}),
  };
}

function buildPaymentFromStaffLine(
  line: ExpenseLineSaved,
  dateKey: string,
  existing?: SalaryPayment,
): SalaryPayment {
  const note = (line.note ?? "").trim();
  const base = existing ?? createSalaryPayment(line.amount, dateKey, note || undefined);
  const lineKind = staffLineKindFromSaved(line);
  return {
    ...base,
    amount: line.amount,
    date: dateKey,
    ...(note ? { note } : {}),
    dailyEntryLineId: line.lineId,
    dailyEntryDate: dateKey,
    postedEmployeeLineKind: lineKind,
  };
}

function indexExistingPaymentsAcrossBundle(bundle: SalarySheetBundle): {
  byId: Map<string, SalaryPayment>;
  byLineId: Map<string, SalaryPayment>;
} {
  const byId = new Map<string, SalaryPayment>();
  const byLineId = new Map<string, SalaryPayment>();
  for (const doc of Object.values(bundle.months)) {
    if (!doc) continue;
    for (const row of doc.rows) {
      for (const payment of row.payments) {
        byId.set(payment.id, payment);
        if (payment.dailyEntryLineId) {
          byLineId.set(payment.dailyEntryLineId, payment);
        }
      }
    }
  }
  return { byId, byLineId };
}

function clearAllRowPayments(doc: SalarySheetDoc): SalarySheetDoc {
  return {
    ...doc,
    rows: doc.rows.map((row) => ({ ...row, payments: [] as SalaryPayment[] })),
  };
}

function appendPaymentToEmployeeMonth(
  bundle: SalarySheetBundle,
  monthKey: string,
  employeeId: string,
  payment: SalaryPayment,
  employees: ReturnType<typeof getActiveEmployeesStoreSnapshot>,
): SalarySheetBundle {
  const doc = ensureMonthDoc(monthKey, bundle.months[monthKey], employees);
  let rows = doc.rows;
  const rowIndex = rows.findIndex((row) => row.employeeId === employeeId);
  if (rowIndex < 0) {
    const emp =
      employees.find((e) => e.id === employeeId) ?? getEmployeeById(employeeId);
    if (!emp) {
      return {
        ...bundle,
        months: { ...bundle.months, [monthKey]: doc },
      };
    }
    rows = [...rows, { ...salaryRowForEmployeeRecord(emp), payments: [payment] }];
  } else {
    rows = rows.map((row, index) => {
      if (index !== rowIndex) return row;
      return { ...row, payments: [...row.payments, payment] };
    });
  }
  return {
    ...bundle,
    months: {
      ...bundle.months,
      [monthKey]: { ...doc, rows, updatedAt: new Date().toISOString() },
    },
  };
}

type PendingStaffPayout = {
  dateKey: string;
  line: ExpenseLineSaved;
};

/**
 * Rebuild salary-register payouts from daily-entry staff lines.
 * Regular payouts apply to the oldest owing month first (through the payout date);
 * advances always post to the payout date's month.
 *
 * `monthKey` is kept for call-site compatibility; reconcile covers all months.
 */
export function reconcileSalaryMonthFromDailyMap(
  bundle: SalarySheetBundle,
  monthKey: string,
  dailyMap: DailyEntryMap,
): SalarySheetBundle {
  void monthKey;
  const employees = getActiveEmployeesStoreSnapshot();
  const { byId, byLineId } = indexExistingPaymentsAcrossBundle(bundle);

  const pending: PendingStaffPayout[] = [];
  for (const row of Object.values(dailyMap)) {
    for (const line of row.expenseLines ?? []) {
      const normalized = normalizeStaffLine(line);
      if (!normalized?.employeeId || !normalized.lineId) continue;
      pending.push({ dateKey: row.date, line: normalized });
    }
  }
  pending.sort(
    (a, b) =>
      a.dateKey.localeCompare(b.dateKey) ||
      (a.line.lineId ?? "").localeCompare(b.line.lineId ?? ""),
  );

  const monthKeys = new Set<string>();
  for (const key of Object.keys(bundle.months)) {
    if (isMonthKey(key)) monthKeys.add(key);
  }
  for (const item of pending) {
    monthKeys.add(monthKeyFromDateKey(item.dateKey));
  }

  let working: SalarySheetBundle = {
    ...bundle,
    months: { ...bundle.months },
  };

  for (const key of [...monthKeys].sort((a, b) => a.localeCompare(b))) {
    const ensured = ensureMonthDoc(key, working.months[key], employees);
    working = {
      ...working,
      months: {
        ...working.months,
        [key]: clearAllRowPayments(ensured),
      },
    };
  }

  for (const item of pending) {
    const employeeId = item.line.employeeId!.trim();
    const paymentMonth = monthKeyFromDateKey(item.dateKey);
    const lineKind = staffLineKindFromSaved(item.line);

    let targetMonth = paymentMonth;
    if (lineKind !== STAFF_ADVANCE_LINE_KIND) {
      const oldestOwing = oldestOwingMonthForEmployee(
        working,
        employeeId,
        paymentMonth,
      );
      if (oldestOwing) targetMonth = oldestOwing;
    }

    // Ensure target month exists even if it was not in the payout-date set.
    if (!working.months[targetMonth]) {
      working = {
        ...working,
        months: {
          ...working.months,
          [targetMonth]: clearAllRowPayments(
            ensureMonthDoc(targetMonth, undefined, employees),
          ),
        },
      };
    }

    const existing =
      (item.line.salaryPaymentId ? byId.get(item.line.salaryPaymentId) : undefined) ??
      (item.line.lineId ? byLineId.get(item.line.lineId) : undefined);

    const payment = buildPaymentFromStaffLine(item.line, item.dateKey, existing);
    working = appendPaymentToEmployeeMonth(
      working,
      targetMonth,
      employeeId,
      payment,
      employees,
    );
  }

  const stampedMonths = { ...working.months };
  const now = new Date().toISOString();
  for (const key of Object.keys(stampedMonths)) {
    const doc = stampedMonths[key];
    if (!doc) continue;
    stampedMonths[key] = { ...doc, updatedAt: now };
  }

  return { ...working, months: stampedMonths };
}

function overlayExpenseLinesOnMap(
  map: DailyEntryMap,
  dateKey: string,
  expenseLines: ExpenseLineSaved[],
): DailyEntryMap {
  const prior = map[dateKey];
  if (prior) {
    return { ...map, [dateKey]: { ...prior, expenseLines } };
  }
  const stub: DailyEntryRow = {
    date: dateKey,
    openingBalance: 0,
    cashSale: 0,
    bankSale: 0,
    bkashSale: 0,
    nagadSale: 0,
    pathaoSale: 0,
    foodiSale: 0,
    foodpandaSale: 0,
    expenses: expenseLines.reduce((sum, line) => sum + line.amount, 0),
    bankWithdrawn: 0,
    cashIn: 0,
    expenseLines,
    remainingBalance: 0,
    updatedAt: new Date().toISOString(),
  };
  return { ...map, [dateKey]: stub };
}

function paymentIdByLineIdAcrossBundle(bundle: SalarySheetBundle): Map<string, string> {
  const out = new Map<string, string>();
  for (const doc of Object.values(bundle.months)) {
    if (!doc) continue;
    for (const row of doc.rows) {
      for (const payment of row.payments) {
        if (payment.dailyEntryLineId) {
          out.set(payment.dailyEntryLineId, payment.id);
        }
      }
    }
  }
  return out;
}

function attachSalaryPaymentIds(
  lines: ExpenseLineSaved[],
  paymentIdByLineId: Map<string, string>,
): ExpenseLineSaved[] {
  return lines.map((line) => {
    if (savedLineKind(line) !== "staff" && !isLegacyStaffVendorLine(line)) return line;
    const normalized = normalizeStaffLine(line);
    if (!normalized?.lineId) return line;
    const salaryPaymentId = paymentIdByLineId.get(normalized.lineId);
    if (!salaryPaymentId) return normalized;
    return { ...normalized, salaryPaymentId };
  });
}

/** Reconcile salary register payouts for one month from daily entries. */
export async function reconcileSalaryMonthFromDailyEntries(
  monthKey: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await loadSalaryWorkspace();
  const dailyMap = await loadDailyEntryMap();
  setSalaryBundle((bundle) => reconcileSalaryMonthFromDailyMap(bundle, monthKey, dailyMap));
  try {
    await flushSalaryWorkspacePersist();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save salary register.";
    return { ok: false, message };
  }
  return { ok: true };
}

/**
 * Keeps salary-register payouts in sync with daily-entry staff lines.
 *
 * `persist` (default `true`) controls whether the reconciled bundle is PUT to the
 * API here. The atomic daily commit (I3) passes `persist: false` and instead
 * sends the returned `bundle` in one cross-module transaction, so it must NOT be
 * saved separately. The reconciled bundle is always returned and mirrored to the
 * in-memory store either way.
 */
export async function syncStaffExpensesToSalaryRegister(params: {
  dateKey: string;
  nextLines: ExpenseLineSaved[];
  priorLines?: ExpenseLineSaved[];
  persist?: boolean;
}): Promise<SyncStaffExpensesResult> {
  void params.priorLines;
  await loadSalaryWorkspace();

  const dailyMap = overlayExpenseLinesOnMap(
    await loadDailyEntryMap(),
    params.dateKey,
    params.nextLines,
  );

  const monthKey = monthKeyFromDateKey(params.dateKey);
  let bundleForLines = getSalaryBundle();
  setSalaryBundle((bundle) => {
    bundleForLines = reconcileSalaryMonthFromDailyMap(bundle, monthKey, dailyMap);
    return bundleForLines;
  });

  const paymentIdByLineId = paymentIdByLineIdAcrossBundle(bundleForLines);
  const mergedLines = attachSalaryPaymentIds(params.nextLines, paymentIdByLineId);

  if (params.persist !== false) {
    try {
      await flushSalaryWorkspacePersist();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save salary register.";
      return { ok: false, message };
    }
  }

  return { ok: true, lines: mergedLines, bundle: bundleForLines };
}
