import type { SalarySheetBundle } from "../../lib/salarySheetStorage";
import { STAFF_ADVANCE_LINE_KIND, STAFF_LINE_KIND, type StaffLineKind } from "./staffLineKinds";
import { totalStillOwedForEmployeeThroughMonth } from "./employeeSalaryBalance";

export type StaffPayoutValidationParams = {
  bundle: SalarySheetBundle;
  /** YYYY-MM — payout date's month; arrears in earlier months count too. */
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

/**
 * Returns an error when a regular payout exceeds total Due through the payout month
 * (oldest unpaid months first). Advance salary is always allowed.
 */
export function validateStaffPayoutAmount(params: StaffPayoutValidationParams): string | null {
  const amount = Math.max(0, Math.round(params.amount));
  if (amount <= 0) return null;

  if (params.staffLineKind === STAFF_ADVANCE_LINE_KIND) return null;

  const stillOwed = totalStillOwedForEmployeeThroughMonth(
    params.bundle,
    params.employeeId,
    params.monthKey,
    {
      excludeLineId: params.excludeLineId,
      excludePaymentId: params.excludePaymentId,
    },
  );

  if (amount <= stillOwed) return null;

  if (stillOwed <= 0) {
    return "Nothing owed — check “Advance salary” to pay ahead.";
  }

  return `Amount exceeds Due (৳${formatWhole(stillOwed)}). Check “Advance salary” to pay more.`;
}

export function staffLineKindFromAdvanceFlag(isAdvance: boolean): StaffLineKind {
  return isAdvance ? STAFF_ADVANCE_LINE_KIND : STAFF_LINE_KIND;
}

export { stillOwedForEmployeeInMonth } from "./employeeSalaryBalance";
