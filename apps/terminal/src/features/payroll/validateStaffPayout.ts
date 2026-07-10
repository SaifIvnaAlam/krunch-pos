import type { SalarySheetBundle } from "../../lib/salarySheetStorage";
import { STAFF_ADVANCE_LINE_KIND, STAFF_LINE_KIND, type StaffLineKind } from "./staffLineKinds";
import { stillOwedForEmployeeInMonth } from "./employeeSalaryBalance";

export type StaffPayoutValidationParams = {
  bundle: SalarySheetBundle;
  /** YYYY-MM */
  monthKey: string;
  employeeId: string;
  amount: number;
  staffLineKind: StaffLineKind;
  /** When editing an existing daily-entry staff line. */
  excludeLineId?: string;
  /** When editing via salary payment id. */
  excludePaymentId?: string;
};

function formatWhole(n: number): string {
  return n.toLocaleString("en-BD");
}

/** Returns an error message when a regular payout exceeds Due; advance is always allowed. */
export function validateStaffPayoutAmount(params: StaffPayoutValidationParams): string | null {
  const amount = Math.max(0, Math.round(params.amount));
  if (amount <= 0) return null;

  if (params.staffLineKind === STAFF_ADVANCE_LINE_KIND) return null;

  const stillOwed = stillOwedForEmployeeInMonth(
    params.bundle,
    params.monthKey,
    params.employeeId,
    {
      excludeLineId: params.excludeLineId,
      excludePaymentId: params.excludePaymentId,
    },
  );

  if (amount <= stillOwed) return null;

  if (stillOwed <= 0) {
    return "Nothing owed this month — check “Advance salary” to pay ahead.";
  }

  return `Amount exceeds Due (৳${formatWhole(stillOwed)}). Check “Advance salary” to pay more.`;
}

export function staffLineKindFromAdvanceFlag(isAdvance: boolean): StaffLineKind {
  return isAdvance ? STAFF_ADVANCE_LINE_KIND : STAFF_LINE_KIND;
}

export { stillOwedForEmployeeInMonth } from "./employeeSalaryBalance";
