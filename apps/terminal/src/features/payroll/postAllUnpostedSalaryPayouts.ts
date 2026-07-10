import type { StaffLineKind } from "./staffLineKinds";
import {
  isSalaryPaymentPosted,
  type SalaryPayment,
  type SalarySheetRow,
} from "../../lib/salarySheetStorage";
import {
  postSalaryPayoutToDailyEntry,
  type PostSalaryPayoutResult,
} from "./postSalaryPayoutToDailyEntry";

export type PostAllUnpostedResult = {
  posted: SalaryPayment[];
  failed: { payment: SalaryPayment; message: string }[];
};

/** Posts every unposted payout on a salary register row to Daily Entry. */
export async function postAllUnpostedSalaryPayouts(params: {
  row: SalarySheetRow;
  employeePhone?: string;
  lineKindForPayment: (payment: SalaryPayment) => StaffLineKind;
  enteredBy?: string;
}): Promise<PostAllUnpostedResult> {
  const posted: SalaryPayment[] = [];
  const failed: { payment: SalaryPayment; message: string }[] = [];

  const pending = params.row.payments.filter((p) => !isSalaryPaymentPosted(p) && p.amount > 0);
  let currentRow = params.row;

  for (const payment of pending) {
    const res: PostSalaryPayoutResult = await postSalaryPayoutToDailyEntry({
      employeeId: currentRow.employeeId,
      employeeName: currentRow.name,
      payment,
      staffLineKind: params.lineKindForPayment(payment),
      enteredBy: params.enteredBy,
    });
    if (!res.ok) {
      failed.push({ payment, message: res.message });
      continue;
    }
    posted.push(res.payment);
    currentRow = {
      ...currentRow,
      payments: currentRow.payments.map((p) =>
        p.id === payment.id ? res.payment : p,
      ),
    };
  }

  return { posted, failed };
}
