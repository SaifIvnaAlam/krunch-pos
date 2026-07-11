import {
  isMonthKey,
  sumPaymentsForRow,
  totalPayableForRow,
  type SalarySheetBundle,
  type SalarySheetRow,
} from "../../lib/salarySheetStorage";

export type EmployeeMonthBalance = {
  monthKey: string;
  payable: number;
  paid: number;
  /** Prior-month advance applied against this month's salary. */
  advanceApplied: number;
  /** Remaining to pay this month after advance credit and payouts. */
  stillOwed: number;
  /** Advance carried forward to the next month. */
  advanceCarriedOut: number;
};

export type EmployeeMonthBalanceOptions = {
  excludeLineId?: string;
  excludePaymentId?: string;
  /** Only roll through this month (inclusive), chronologically. */
  throughMonthKey?: string;
};

function findEmployeeRow(doc: SalarySheetBundle["months"][string] | undefined, employeeId: string) {
  if (!doc) return null;
  return doc.rows.find((r) => r.employeeId === employeeId) ?? null;
}

function paidForRow(
  row: SalarySheetRow,
  options?: EmployeeMonthBalanceOptions,
): number {
  let paid = 0;
  const excludeLineId = options?.excludeLineId?.trim();
  const excludePaymentId = options?.excludePaymentId?.trim();
  for (const payment of row.payments) {
    if (excludePaymentId && payment.id === excludePaymentId) continue;
    if (excludeLineId && payment.dailyEntryLineId === excludeLineId) continue;
    paid += payment.amount;
  }
  return paid;
}

/** Chronological roll-forward of advance credit and Due for one employee. */
export function computeEmployeeMonthBalances(
  bundle: SalarySheetBundle,
  employeeId: string,
  options?: EmployeeMonthBalanceOptions,
): Map<string, EmployeeMonthBalance> {
  const empId = employeeId.trim();
  const out = new Map<string, EmployeeMonthBalance>();
  if (!empId) return out;

  const monthKeys = Object.keys(bundle.months)
    .filter(isMonthKey)
    .sort((a, b) => a.localeCompare(b));

  const through = options?.throughMonthKey;
  let unappliedAdvance = 0;

  for (const monthKey of monthKeys) {
    if (through && monthKey > through) break;

    const row = findEmployeeRow(bundle.months[monthKey], empId);
    const payable = row ? totalPayableForRow(row) : 0;
    const paid = row ? paidForRow(row, options) : 0;
    const carryIn = unappliedAdvance;

    const stillOwed = Math.max(0, payable - carryIn - paid);
    unappliedAdvance = Math.max(0, paid + carryIn - payable);
    const advanceApplied = Math.min(
      carryIn,
      payable - Math.max(0, payable - carryIn - paid),
    );

    out.set(monthKey, {
      monthKey,
      payable,
      paid,
      advanceApplied,
      stillOwed,
      advanceCarriedOut: unappliedAdvance,
    });
  }

  return out;
}

export function getEmployeeMonthBalance(
  bundle: SalarySheetBundle,
  monthKey: string,
  employeeId: string,
  options?: EmployeeMonthBalanceOptions,
): EmployeeMonthBalance | null {
  const balances = computeEmployeeMonthBalances(bundle, employeeId, {
    ...options,
    throughMonthKey: monthKey,
  });
  return balances.get(monthKey) ?? null;
}

/** Due for one month after prior advances are applied. */
export function stillOwedForEmployeeInMonth(
  bundle: SalarySheetBundle,
  monthKey: string,
  employeeId: string,
  options?: Omit<EmployeeMonthBalanceOptions, "throughMonthKey">,
): number {
  return getEmployeeMonthBalance(bundle, monthKey, employeeId, options)?.stillOwed ?? 0;
}

/**
 * Sum of still-owed across salary months up to and including `throughMonthKey`
 * (oldest arrears + current month). Used when a payout may clear prior months first.
 */
export function totalStillOwedForEmployeeThroughMonth(
  bundle: SalarySheetBundle,
  employeeId: string,
  throughMonthKey: string,
  options?: Omit<EmployeeMonthBalanceOptions, "throughMonthKey">,
): number {
  const balances = computeEmployeeMonthBalances(bundle, employeeId, {
    ...options,
    throughMonthKey,
  });
  let total = 0;
  for (const balance of balances.values()) {
    total += balance.stillOwed;
  }
  return total;
}

/** Oldest month (≤ throughMonthKey) that still has Due for this employee. */
export function oldestOwingMonthForEmployee(
  bundle: SalarySheetBundle,
  employeeId: string,
  throughMonthKey: string,
  options?: Omit<EmployeeMonthBalanceOptions, "throughMonthKey">,
): string | null {
  const balances = computeEmployeeMonthBalances(bundle, employeeId, {
    ...options,
    throughMonthKey,
  });
  const monthKeys = [...balances.keys()].sort((a, b) => a.localeCompare(b));
  for (const monthKey of monthKeys) {
    if ((balances.get(monthKey)?.stillOwed ?? 0) > 0) return monthKey;
  }
  return null;
}

/** Advance credit carried out of a month into the next month's salary. */
export function advanceCarriedOutForEmployeeInMonth(
  bundle: SalarySheetBundle,
  monthKey: string,
  employeeId: string,
): number {
  return getEmployeeMonthBalance(bundle, monthKey, employeeId)?.advanceCarriedOut ?? 0;
}

/** Sum of month still-owed values after advance roll-forward (whole BDT). */
export function totalStillOwedForEmployee(
  bundle: SalarySheetBundle,
  employeeId: string,
): number {
  let total = 0;
  for (const balance of computeEmployeeMonthBalances(bundle, employeeId).values()) {
    total += balance.stillOwed;
  }
  return total;
}

/** Remaining advance credit after all recorded months (whole BDT). */
export function remainingAdvanceCreditForEmployee(
  bundle: SalarySheetBundle,
  employeeId: string,
): number {
  const balances = computeEmployeeMonthBalances(bundle, employeeId);
  const values = [...balances.values()];
  return values.length > 0 ? values[values.length - 1]!.advanceCarriedOut : 0;
}

/** Paid amount for one row, optionally excluding one line/payment (for validation). */
export function sumPaymentsForRowExcluding(
  row: SalarySheetRow,
  options?: Pick<EmployeeMonthBalanceOptions, "excludeLineId" | "excludePaymentId">,
): number {
  let paid = 0;
  for (const payment of row.payments) {
    if (options?.excludePaymentId && payment.id === options.excludePaymentId) continue;
    if (options?.excludeLineId && payment.dailyEntryLineId === options.excludeLineId) continue;
    paid += payment.amount;
  }
  return paid;
}

/** @deprecated Use rolling balance helpers — kept for simple in-month gross checks. */
export function grossAdvanceInMonth(row: SalarySheetRow): number {
  return Math.max(0, sumPaymentsForRow(row) - totalPayableForRow(row));
}
