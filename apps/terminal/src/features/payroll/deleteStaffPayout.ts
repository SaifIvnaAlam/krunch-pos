import {
  computeRemainingBalanceForRow,
  expenseTotalFromExpenseLines,
} from "@/features/daily-entry/calculations";
import { loadDailyEntryMap, saveDailyEntry } from "@/features/daily-entry/dailyEntryRepository";
import {
  isSalaryPaymentPosted,
  type SalaryPayment,
} from "../../lib/salarySheetStorage";
import {
  flushSalaryWorkspacePersist,
  getSalaryBundle,
  loadSalaryWorkspace,
  setSalaryBundle,
} from "./salaryWorkspaceStore";
import { reconcileSalaryMonthFromDailyMap } from "./syncStaffExpensesToSalaryRegister";

export type DeleteStaffPayoutParams = {
  paymentId: string;
  monthKey: string;
  employeeId: string;
};

export type DeleteStaffPayoutResult =
  | { ok: true; amount: number; dailyEntryDate?: string }
  | { ok: false; message: string };

function findPayment(
  monthKey: string,
  employeeId: string,
  paymentId: string,
): SalaryPayment | null {
  const doc = getSalaryBundle().months[monthKey];
  if (!doc) return null;
  const row = doc.rows.find((r) => r.employeeId === employeeId);
  if (!row) return null;
  return row.payments.find((p) => p.id === paymentId) ?? null;
}

function removePaymentFromRegister(
  monthKey: string,
  employeeId: string,
  paymentId: string,
): void {
  const bundle = getSalaryBundle();
  const doc = bundle.months[monthKey];
  if (!doc) return;

  const rows = doc.rows.map((row) => {
    if (row.employeeId !== employeeId) return row;
    return {
      ...row,
      payments: row.payments.filter((p) => p.id !== paymentId),
    };
  });

  setSalaryBundle(() => ({
    ...bundle,
    months: {
      ...bundle.months,
      [monthKey]: { ...doc, rows, updatedAt: new Date().toISOString() },
    },
  }));
}

/** Remove a staff payout — deletes the Daily Entry line when posted, then syncs salary. */
export async function deleteStaffPayout(
  params: DeleteStaffPayoutParams,
): Promise<DeleteStaffPayoutResult> {
  const paymentId = params.paymentId.trim();
  const employeeId = params.employeeId.trim();
  const monthKey = params.monthKey.trim();

  if (!paymentId) {
    return { ok: false, message: "Payout is required." };
  }
  if (!employeeId) {
    return { ok: false, message: "Employee is required." };
  }
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return { ok: false, message: "Invalid salary month." };
  }

  await loadSalaryWorkspace();
  const payment = findPayment(monthKey, employeeId, paymentId);
  if (!payment) {
    return { ok: false, message: "Payout not found — refresh and try again." };
  }

  const amount = payment.amount;

  if (isSalaryPaymentPosted(payment) && payment.dailyEntryDate && payment.dailyEntryLineId) {
    const dateKey = payment.dailyEntryDate;
    const dailyMap = await loadDailyEntryMap();
    const dailyRow = dailyMap[dateKey];

    if (dailyRow?.isLocked) {
      return {
        ok: false,
        message: `Daily entry for ${dateKey} is locked — unlock it before removing this payout.`,
      };
    }

    if (dailyRow) {
      const priorLines = dailyRow.expenseLines ?? [];
      const nextLines = priorLines.filter(
        (line) =>
          line.lineId !== payment.dailyEntryLineId && line.salaryPaymentId !== paymentId,
      );

      if (nextLines.length !== priorLines.length) {
        const nextRow = {
          ...dailyRow,
          expenseLines: nextLines,
          updatedAt: new Date().toISOString(),
        };
        nextRow.expenses = expenseTotalFromExpenseLines(nextRow.expenseLines);
        nextRow.remainingBalance = computeRemainingBalanceForRow(nextRow);

        const saveRes = await saveDailyEntry(nextRow);
        if (!saveRes.ok) {
          return { ok: false, message: saveRes.message };
        }
      }
    }

    const syncedMap = await loadDailyEntryMap();
    let bundle = getSalaryBundle();
    bundle = reconcileSalaryMonthFromDailyMap(bundle, monthKey, syncedMap);
    setSalaryBundle(() => bundle);
  } else {
    removePaymentFromRegister(monthKey, employeeId, paymentId);
  }

  try {
    await flushSalaryWorkspacePersist();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save salary register.";
    return { ok: false, message };
  }

  return {
    ok: true,
    amount,
    dailyEntryDate: payment.dailyEntryDate,
  };
}
