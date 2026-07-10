/** Programmatic sidebar navigation (listened to in PosTerminalPage). */
export const POS_SELECT_LEAF_EVENT = "pos-select-leaf";

/** Open Daily Entry on a specific calendar day (YYYY-MM-DD). */
export const POS_OPEN_DAILY_ENTRY_EVENT = "pos-open-daily-entry";

/** Open Employee Salaries history for one staff member. */
export const POS_OPEN_EMPLOYEE_SALARY_HISTORY_EVENT = "pos-open-employee-salary-history";

export function dispatchPosSelectLeaf(leafId: string): void {
  window.dispatchEvent(
    new CustomEvent(POS_SELECT_LEAF_EVENT, { detail: { leafId } }),
  );
}

export function dispatchOpenDailyEntry(
  dateKey: string,
  options?: { staffPayoutEmployeeId?: string },
): void {
  window.dispatchEvent(
    new CustomEvent(POS_OPEN_DAILY_ENTRY_EVENT, {
      detail: {
        leafId: "exp-daily",
        dateKey,
        staffPayoutEmployeeId: options?.staffPayoutEmployeeId,
      },
    }),
  );
}

export function dispatchOpenEmployeeSalaryHistory(employeeId: string): void {
  window.dispatchEvent(
    new CustomEvent(POS_OPEN_EMPLOYEE_SALARY_HISTORY_EVENT, {
      detail: { leafId: "hr-payroll", employeeId },
    }),
  );
}
