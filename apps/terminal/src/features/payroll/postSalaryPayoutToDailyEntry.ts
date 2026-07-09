import {
  carriedOpeningBalanceForDate,
  computeRemainingBalanceForRow,
  expenseTotalFromExpenseLines,
} from "@/features/daily-entry/calculations";
import { loadDailyEntryMap, saveDailyEntry } from "@/features/daily-entry/dailyEntryRepository";
import type { DailyEntryRow, ExpenseLineSaved } from "@/features/daily-entry/types";
import { flushLedgerWorkspacePersist, loadLedgerWorkspace } from "@/features/ledger";
import {
  commitLedgerFromDailyExpenseLine,
  employeeLedgerBookName,
  resolveLedgerSupplierIdByBookName,
  upsertEmployeeLedgerBook,
  type EmployeeLedgerLineKind,
} from "../../components/pos/LedgerModuleView";
import {
  isSalaryPaymentPosted,
  type SalaryPayment,
} from "../../lib/salarySheetStorage";

export type PostSalaryPayoutParams = {
  employeeName: string;
  employeePhone?: string;
  payment: SalaryPayment;
  employeeLineKind: EmployeeLedgerLineKind;
  enteredBy?: string;
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
  bookName: string;
  payment: SalaryPayment;
  employeeName: string;
  employeeLineKind: EmployeeLedgerLineKind;
  lineId: string;
  ledgerEntryId: string;
  purchaseOrderId?: string;
}): ExpenseLineSaved {
  const note =
    params.payment.note?.trim() || `Salary payout · ${params.employeeName.trim() || "Staff"}`;
  return {
    kind: "vendor",
    vendor: params.bookName,
    amount: params.payment.amount,
    lineId: params.lineId,
    ledgerKind: "payment",
    ledgerEmployeeLineKind: params.employeeLineKind,
    ledgerNote: note,
    salaryPaymentId: params.payment.id,
    ledgerLink: {
      ledgerEntryId: params.ledgerEntryId,
      ...(params.purchaseOrderId ? { purchaseOrderId: params.purchaseOrderId } : {}),
    },
  };
}

/** Posts one salary-register payout to Daily Entry (expenses + staff cashbook). */
export async function postSalaryPayoutToDailyEntry(
  params: PostSalaryPayoutParams,
): Promise<PostSalaryPayoutResult> {
  const { employeeName, payment, employeeLineKind } = params;
  const name = employeeName.trim();
  if (!name) {
    return { ok: false, message: "Employee name is required to post a payout." };
  }
  if (payment.amount <= 0) {
    return { ok: false, message: "Payout amount must be greater than zero." };
  }
  if (isSalaryPaymentPosted(payment)) {
    return { ok: false, message: "This payout is already posted to daily books." };
  }

  await loadLedgerWorkspace();
  upsertEmployeeLedgerBook({ name, phone: params.employeePhone });
  const bookName = employeeLedgerBookName(name);
  const supplierId = resolveLedgerSupplierIdByBookName(bookName);
  if (!supplierId) {
    return {
      ok: false,
      message: `Could not find cashbook “${bookName}”. Create it in Employee Management.`,
    };
  }

  const map = await loadDailyEntryMap();
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
  const ledgerNote =
    payment.note?.trim() || `Salary payout · ${name}`;

  const ledgerRes = commitLedgerFromDailyExpenseLine({
    supplierId,
    entryDateIso: dateKey,
    amountStr: String(payment.amount),
    kind: "payment",
    notes: ledgerNote,
    employeeLineKind,
  });
  if (!ledgerRes.ok) {
    return {
      ok: false,
      message: "Could not post to the staff cashbook — check the amount and cashbook.",
    };
  }

  const expenseLine = buildStaffExpenseLine({
    bookName,
    payment,
    employeeName: name,
    employeeLineKind,
    lineId,
    ledgerEntryId: ledgerRes.ledgerEntryId,
    purchaseOrderId: ledgerRes.purchaseOrderId,
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

  try {
    await flushLedgerWorkspacePersist();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save ledger workspace.";
    return { ok: false, message };
  }

  const saveRes = await saveDailyEntry(nextRow);
  if (!saveRes.ok) {
    return { ok: false, message: saveRes.message };
  }

  const updatedPayment: SalaryPayment = {
    ...payment,
    dailyEntryLineId: lineId,
    dailyEntryDate: dateKey,
    postedEmployeeLineKind: employeeLineKind,
  };

  return { ok: true, payment: updatedPayment, dailyEntryDate: dateKey };
}
