/**
 * FIFO-allocate cashbook ledger payments onto supplier bills.
 * Keep in sync with allocateLedgerPaymentsFifo in
 * apps/api/src/modules/expenses/expense.util.ts
 */
export function allocateLedgerPaymentsFifo(expenses, ledgerPayments) {
  const open = new Map();
  for (const e of [...expenses].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date),
  )) {
    if (!e.supplierId || e.totalMinor <= 0) continue;
    const arr = open.get(e.supplierId) ?? [];
    arr.push({ id: e.id, date: e.date, remaining: e.totalMinor });
    open.set(e.supplierId, arr);
  }

  const out = [];
  const pays = [...ledgerPayments].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date),
  );
  for (const pay of pays) {
    let left = Math.abs(pay.amountMinor);
    if (left <= 0) continue;
    const bills = open.get(pay.supplierId) ?? [];
    for (const bill of bills) {
      if (left <= 0) break;
      if (bill.remaining <= 0) continue;
      const take = Math.min(left, bill.remaining);
      bill.remaining -= take;
      left -= take;
      out.push({
        expenseId: bill.id,
        ledgerEntryId: pay.id,
        date: pay.date,
        amountMinor: take,
        transactionId: pay.ref ?? '',
        memo: pay.memo ?? '',
      });
    }
  }
  return out;
}
