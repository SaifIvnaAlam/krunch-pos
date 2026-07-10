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
import { getEmployeeById } from "../../lib/employeeDirectoryStorage";
import {
  createSalaryPayment,
  ensureMonthDoc,
  type SalaryPayment,
  type SalarySheetBundle,
  type SalarySheetRow,
} from "../../lib/salarySheetStorage";
import {
  flushSalaryWorkspacePersist,
  getSalaryBundle,
  loadSalaryWorkspace,
  setSalaryBundle,
} from "./salaryWorkspaceStore";
import { STAFF_ADVANCE_LINE_KIND, STAFF_LINE_KIND } from "./staffLineKinds";

export type SyncStaffExpensesResult =
  | { ok: true; lines: ExpenseLineSaved[] }
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

function indexExistingPayments(docRows: SalarySheetRow[]): {
  byId: Map<string, SalaryPayment>;
  byLineId: Map<string, SalaryPayment>;
} {
  const byId = new Map<string, SalaryPayment>();
  const byLineId = new Map<string, SalaryPayment>();
  for (const row of docRows) {
    for (const payment of row.payments) {
      byId.set(payment.id, payment);
      if (payment.dailyEntryLineId) {
        byLineId.set(payment.dailyEntryLineId, payment);
      }
    }
  }
  return { byId, byLineId };
}

/** Rebuild one month's salary payouts from daily-entry staff lines (source of truth). */
export function reconcileSalaryMonthFromDailyMap(
  bundle: SalarySheetBundle,
  monthKey: string,
  dailyMap: DailyEntryMap,
): SalarySheetBundle {
  const employees = getActiveEmployeesStoreSnapshot();
  const doc = ensureMonthDoc(monthKey, bundle.months[monthKey], employees);
  const { byId, byLineId } = indexExistingPayments(doc.rows);

  const payoutsByEmployee = new Map<string, SalaryPayment[]>();

  for (const row of Object.values(dailyMap)) {
    if (!row.date.startsWith(monthKey)) continue;
    for (const line of row.expenseLines ?? []) {
      const normalized = normalizeStaffLine(line);
      if (!normalized?.employeeId || !normalized.lineId) continue;

      const existing =
        (normalized.salaryPaymentId ? byId.get(normalized.salaryPaymentId) : undefined) ??
        byLineId.get(normalized.lineId);

      const payment = buildPaymentFromStaffLine(normalized, row.date, existing);
      const list = payoutsByEmployee.get(normalized.employeeId) ?? [];
      list.push(payment);
      payoutsByEmployee.set(normalized.employeeId, list);
    }
  }

  for (const [, payments] of payoutsByEmployee) {
    payments.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }

  const rows = doc.rows.map((salaryRow) => ({
    ...salaryRow,
    payments: payoutsByEmployee.get(salaryRow.employeeId) ?? [],
  }));

  return {
    ...bundle,
    months: {
      ...bundle.months,
      [monthKey]: { ...doc, rows, updatedAt: new Date().toISOString() },
    },
  };
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
    expenseLines,
    remainingBalance: 0,
    updatedAt: new Date().toISOString(),
  };
  return { ...map, [dateKey]: stub };
}

function paymentIdByLineIdForMonth(
  bundle: SalarySheetBundle,
  monthKey: string,
): Map<string, string> {
  const out = new Map<string, string>();
  const doc = bundle.months[monthKey];
  if (!doc) return out;
  for (const row of doc.rows) {
    for (const payment of row.payments) {
      if (payment.dailyEntryLineId) {
        out.set(payment.dailyEntryLineId, payment.id);
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

/** Keeps salary-register payouts in sync with daily-entry staff lines for the month. */
export async function syncStaffExpensesToSalaryRegister(params: {
  dateKey: string;
  nextLines: ExpenseLineSaved[];
  priorLines?: ExpenseLineSaved[];
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

  const paymentIdByLineId = paymentIdByLineIdForMonth(bundleForLines, monthKey);
  const mergedLines = attachSalaryPaymentIds(params.nextLines, paymentIdByLineId);
  try {
    await flushSalaryWorkspacePersist();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save salary register.";
    return { ok: false, message };
  }

  return { ok: true, lines: mergedLines };
}
