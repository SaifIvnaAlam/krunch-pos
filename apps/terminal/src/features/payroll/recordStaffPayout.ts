import { loadDailyEntryMap } from "@/features/daily-entry/dailyEntryRepository";
import { createSalaryPayment } from "../../lib/salarySheetStorage";
import { postSalaryPayoutToDailyEntry } from "./postSalaryPayoutToDailyEntry";
import { staffLineKindFromAdvanceFlag } from "./validateStaffPayout";
import {
  flushSalaryWorkspacePersist,
  getSalaryBundle,
  loadSalaryWorkspace,
  setSalaryBundle,
} from "./salaryWorkspaceStore";
import { reconcileSalaryMonthFromDailyMap } from "./syncStaffExpensesToSalaryRegister";
import { validateStaffPayoutAmount } from "./validateStaffPayout";

export type RecordStaffPayoutParams = {
  employeeId: string;
  employeeName: string;
  /** Whole currency units (BDT). */
  amount: number;
  /** YYYY-MM-DD */
  dateKey: string;
  note?: string;
  enteredBy?: string;
  /** When true, pays ahead of earned salary for the month. */
  isAdvance?: boolean;
};

export type RecordStaffPayoutResult =
  | { ok: true; dailyEntryDate: string; amount: number }
  | { ok: false; message: string };

/** Record a staff payout from the employee profile — posts to Daily Entry and syncs salary. */
export async function recordStaffPayout(
  params: RecordStaffPayoutParams,
): Promise<RecordStaffPayoutResult> {
  const employeeId = params.employeeId.trim();
  const employeeName = params.employeeName.trim();
  const dateKey = params.dateKey.trim();
  const amount = Math.max(0, Math.round(params.amount));

  if (!employeeId) {
    return { ok: false, message: "Employee is required." };
  }
  if (!employeeName) {
    return { ok: false, message: "Employee name is required." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return { ok: false, message: "Enter a valid payout date." };
  }
  if (amount <= 0) {
    return { ok: false, message: "Enter an amount greater than zero." };
  }

  const staffLineKind = staffLineKindFromAdvanceFlag(Boolean(params.isAdvance));
  const monthKey = dateKey.slice(0, 7);

  await loadSalaryWorkspace();
  let bundle = getSalaryBundle();
  const capErr = validateStaffPayoutAmount({
    bundle,
    monthKey,
    employeeId,
    amount,
    staffLineKind,
  });
  if (capErr) {
    return { ok: false, message: capErr };
  }

  const note = params.note?.trim();
  const payment = createSalaryPayment(amount, dateKey, note || undefined);

  const dailyMap = await loadDailyEntryMap();

  const postRes = await postSalaryPayoutToDailyEntry({
    employeeId,
    employeeName,
    payment,
    staffLineKind,
    enteredBy: params.enteredBy,
    dailyMap,
  });

  if (!postRes.ok) {
    return { ok: false, message: postRes.message };
  }

  const syncedMap = await loadDailyEntryMap();
  bundle = getSalaryBundle();
  bundle = reconcileSalaryMonthFromDailyMap(bundle, monthKey, syncedMap);
  setSalaryBundle(() => bundle);

  try {
    await flushSalaryWorkspacePersist();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save salary register.";
    return { ok: false, message };
  }

  return { ok: true, dailyEntryDate: postRes.dailyEntryDate, amount };
}
