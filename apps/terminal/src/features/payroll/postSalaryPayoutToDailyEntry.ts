import {
  carriedOpeningBalanceForDate,
  computeRemainingBalanceForRow,
  expenseTotalFromExpenseLines,
} from "@/features/daily-entry/calculations";
import { loadDailyEntryMap, saveDailyEntry } from "@/features/daily-entry/dailyEntryRepository";
import type { DailyEntryMap, DailyEntryRow, ExpenseLineSaved } from "@/features/daily-entry/types";
import {
  isSalaryPaymentPosted,
  type SalaryPayment,
} from "../../lib/salarySheetStorage";
import type { StaffLineKind } from "./staffLineKinds";

export type PostSalaryPayoutParams = {
  employeeId: string;
  employeeName: string;
  payment: SalaryPayment;
  staffLineKind: StaffLineKind;
  enteredBy?: string;
  /** When provided, skips a network fetch of all daily entries. */
  dailyMap?: DailyEntryMap;
};

export type PostSalaryPayoutResult =
  | { ok: true; payment: SalaryPayment; dailyEntryDate: string }
  | { ok: false; message: string };

function newExpenseLineId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyDailyEntryRow(
  dateKey: string,
  openingBalance: number,
  enteredBy: string,
): DailyEntryRow {
  const now = new Date().toISOString();
  return {
    date: dateKey,
    openingBalance,
    cashSale: 0,
    bankSale: 0,
    bkashSale: 0,
    nagadSale: 0,
    pathaoSale: 0,
    foodiSale: 0,
    foodpandaSale: 0,
    expenses: 0,
    bankWithdrawn: 0,
    expenseLines: [],
    remainingBalance: openingBalance,
    updatedAt: now,
    enteredBy,
  };
}

function buildStaffExpenseLine(params: {
  payment: SalaryPayment;
  employeeId: string;
  employeeName: string;
  staffLineKind: StaffLineKind;
  lineId: string;
}): ExpenseLineSaved {
  const name = params.employeeName.trim() || "Staff";
  const isAdvance = params.staffLineKind === "advance";
  const note =
    params.payment.note?.trim() ||
    (isAdvance ? `Salary advance · ${name}` : `Salary payout · ${name}`);
  return {
    kind: "staff",
    employeeId: params.employeeId,
    employeeName: name,
    staffLineKind: params.staffLineKind,
    amount: params.payment.amount,
    lineId: params.lineId,
    note,
    salaryPaymentId: params.payment.id,
  };
}

/** Posts one salary-register payout to Daily Entry expenses (no cashbook). */
export async function postSalaryPayoutToDailyEntry(
  params: PostSalaryPayoutParams,
): Promise<PostSalaryPayoutResult> {
  const { employeeId, employeeName, payment, staffLineKind } = params;
  const name = employeeName.trim();
  const empId = employeeId.trim();
  if (!empId) {
    return { ok: false, message: "Employee is required to post a payout." };
  }
  if (!name) {
    return { ok: false, message: "Employee name is required to post a payout." };
  }
  if (payment.amount <= 0) {
    return { ok: false, message: "Payout amount must be greater than zero." };
  }
  if (isSalaryPaymentPosted(payment)) {
    return { ok: false, message: "This payout is already posted to daily books." };
  }

  const map = params.dailyMap ?? (await loadDailyEntryMap());
  const dateKey = payment.date;
  const prior = map[dateKey];
  if (prior?.isLocked) {
    return {
      ok: false,
      message: `Daily entry for ${dateKey} is locked — unlock it before posting this payout.`,
    };
  }

  const enteredBy = params.enteredBy?.trim() || prior?.enteredBy?.trim() || "Unknown";
  const lineId = newExpenseLineId();

  const expenseLine = buildStaffExpenseLine({
    payment,
    employeeId: empId,
    employeeName: name,
    staffLineKind,
    lineId,
  });

  let nextRow: DailyEntryRow;
  if (prior) {
    const expenseLines = [...(prior.expenseLines ?? []), expenseLine];
    nextRow = {
      ...prior,
      expenseLines,
      updatedAt: new Date().toISOString(),
      enteredBy: prior.enteredBy ?? enteredBy,
    };
  } else {
    const openingBalance = carriedOpeningBalanceForDate(map, dateKey).opening;
    nextRow = emptyDailyEntryRow(dateKey, openingBalance, enteredBy);
    nextRow.expenseLines = [expenseLine];
  }

  nextRow.expenses = expenseTotalFromExpenseLines(nextRow.expenseLines);
  nextRow.remainingBalance = computeRemainingBalanceForRow(nextRow);

  const saveRes = await saveDailyEntry(nextRow);
  if (!saveRes.ok) {
    return { ok: false, message: saveRes.message };
  }

  const updatedPayment: SalaryPayment = {
    ...payment,
    dailyEntryLineId: lineId,
    dailyEntryDate: dateKey,
    postedEmployeeLineKind: staffLineKind === "advance" ? "advance" : "payout",
  };

  return { ok: true, payment: updatedPayment, dailyEntryDate: dateKey };
}
