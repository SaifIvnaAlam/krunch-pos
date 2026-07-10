import {
  isMonthKey,
  isSalarySheetLocked,
  labelFromMonthKey,
  sumPaymentsForRow,
  totalPayableForRow,
  type SalaryPayment,
  type SalarySheetBundle,
  type SalarySheetDoc,
  type SalarySheetRow,
} from "../../lib/salarySheetStorage";
import {
  computeEmployeeMonthBalances,
  remainingAdvanceCreditForEmployee,
  totalStillOwedForEmployee,
} from "./employeeSalaryBalance";

export type EmployeeMonthSalarySummary = {
  monthKey: string;
  monthLabel: string;
  payable: number;
  paid: number;
  /** Prior-month advance applied to this month's salary. */
  advanceApplied: number;
  stillOwed: number;
  /** Advance carried into the next month. */
  advanceCarriedOut: number;
  isLocked: boolean;
  paymentCount: number;
};

export type EmployeeSalaryPayoutLine = SalaryPayment & {
  monthKey: string;
  monthLabel: string;
  runningPaidInMonth: number;
  globalRunningPaid: number;
};

export type EmployeeSalaryHistory = {
  employeeId: string;
  employeeName: string;
  months: EmployeeMonthSalarySummary[];
  payouts: EmployeeSalaryPayoutLine[];
  totals: {
    payable: number;
    paid: number;
    stillOwed: number;
    advanceCredit: number;
  };
};

function findRowInDoc(
  doc: SalarySheetDoc,
  employeeId: string,
  employeeName: string,
): SalarySheetRow | null {
  if (employeeId) {
    const byId = doc.rows.find((r) => r.employeeId === employeeId);
    if (byId) return byId;
  }
  const norm = employeeName.trim().toLowerCase();
  if (!norm) return null;
  return doc.rows.find((r) => r.name.trim().toLowerCase() === norm) ?? null;
}

export function buildEmployeeSalaryHistory(
  bundle: SalarySheetBundle,
  employeeId: string,
  employeeName: string,
): EmployeeSalaryHistory {
  const resolvedId = employeeId.trim();
  const monthBalances = computeEmployeeMonthBalances(bundle, resolvedId);

  const monthKeys = Object.keys(bundle.months)
    .filter(isMonthKey)
    .sort((a, b) => b.localeCompare(a));

  const months: EmployeeMonthSalarySummary[] = [];
  const rawPayouts: Array<SalaryPayment & { monthKey: string }> = [];

  let totalPayable = 0;
  let totalPaid = 0;

  for (const monthKey of monthKeys) {
    const doc = bundle.months[monthKey];
    if (!doc) continue;
    const row = findRowInDoc(doc, employeeId, employeeName);
    if (!row) continue;

    const payable = totalPayableForRow(row);
    const paid = sumPaymentsForRow(row);
    const rolled = monthBalances.get(monthKey);

    months.push({
      monthKey,
      monthLabel: labelFromMonthKey(monthKey),
      payable,
      paid,
      advanceApplied: rolled?.advanceApplied ?? 0,
      stillOwed: rolled?.stillOwed ?? Math.max(0, payable - paid),
      advanceCarriedOut: rolled?.advanceCarriedOut ?? Math.max(0, paid - payable),
      isLocked: isSalarySheetLocked(doc),
      paymentCount: row.payments.length,
    });

    totalPayable += payable;
    totalPaid += paid;

    for (const payment of row.payments) {
      rawPayouts.push({ ...payment, monthKey });
    }
  }

  const sorted = [...rawPayouts].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.monthKey.localeCompare(b.monthKey) ||
      a.id.localeCompare(b.id),
  );

  const monthRunning = new Map<string, number>();
  const payoutsAsc: EmployeeSalaryPayoutLine[] = [];
  let globalRunning = 0;

  for (const payment of sorted) {
    const prevMonth = monthRunning.get(payment.monthKey) ?? 0;
    const runningPaidInMonth = prevMonth + payment.amount;
    monthRunning.set(payment.monthKey, runningPaidInMonth);
    globalRunning += payment.amount;
    payoutsAsc.push({
      ...payment,
      monthLabel: labelFromMonthKey(payment.monthKey),
      runningPaidInMonth,
      globalRunningPaid: globalRunning,
    });
  }

  return {
    employeeId,
    employeeName,
    months,
    payouts: [...payoutsAsc].reverse(),
    totals: {
      payable: totalPayable,
      paid: totalPaid,
      stillOwed: totalStillOwedForEmployee(bundle, resolvedId),
      advanceCredit: remainingAdvanceCreditForEmployee(bundle, resolvedId),
    },
  };
}
