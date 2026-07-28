#!/usr/bin/env node
/**
 * P2 backfill — project relational data into Expense / Payment payables.
 * Idempotent: clears target tables per branch and re-derives them.
 *
 * Mapping:
 *   - PurchaseOrder            -> Expense (kind from supplier map)
 *   - expense line `regular`   -> Expense(other_expense) + Payment (daily)
 *   - expense line `staff`     -> ignored (SalaryPayment register is truth)
 *   - SalaryPayment            -> Payment against SalaryLine (right month)
 *   - expense line `purchase`  -> ignored (PO is the bill)
 *   - expense line `vendor`    -> ignored for Payment (cashbook ledger is truth)
 *   - LedgerEntry payment      -> Payment on bills via FIFO (matches v1 due)
 *
 * Why not daily vendor lines for paid/due? V1 settles at cashbook account level.
 * Daily often has 1 vendor line while the cashbook has N duplicate bills/payments
 * (e.g. 2026-07-19 ×15). FIFO from LedgerEntry payments restores v1 dues.
 */
import { PrismaClient } from '@prisma/client';
import { expenseKindForSupplierName } from './supplier-expense-kind-map.mjs';
import { allocateLedgerPaymentsFifo } from './allocate-ledger-payments.mjs';

const prisma = new PrismaClient();

function methodFromText(text) {
  const m = (text || '').toLowerCase();
  // NOTE: historical cashbook payments carry a blanket memo of "Card" that was a
  // UI default, not a real record of how the supplier was paid (verified 2026-07-19:
  // all 65 vendor payments read exactly "Card"). We therefore treat "card" as an
  // unknown method ('other') rather than trusting it. Real methods still parse.
  if (m.includes('cash')) return 'cash';
  if (m.includes('bank')) return 'bank_transfer';
  if (m.includes('mobile') || m.includes('bkash') || m.includes('nagad') || m.includes('mfs'))
    return 'mobile_money';
  if (m.includes('cheque') || m.includes('check')) return 'cheque';
  return 'other';
}

function purchaseDescription(po) {
  const names = po.items.map((it) => it.name).filter(Boolean);
  if (names.length === 1) return names[0];
  if (names.length > 1) return `${names[0]} +${names.length - 1} more`;
  return po.ref || po.note || 'Item purchase';
}

async function backfillBranch(branchId) {
  const report = {
    branchId,
    itemPurchaseExpenses: 0,
    otherExpenses: 0,
    payments: { ledger: 0, staff: 0, regular: 0 },
  };

  // ---- clear (idempotent) --------------------------------------------------
  await prisma.payment.deleteMany({ where: { branchId } });
  await prisma.expenseItem.deleteMany({ where: { branchId } });
  await prisma.expenseReturn.deleteMany({ where: { branchId } });
  await prisma.expenseAttachment.deleteMany({ where: { branchId } });
  await prisma.expense.deleteMany({ where: { branchId } });

  // ---- 1. Expenses from PurchaseOrders (kind from supplier name map) -------
  const suppliers = await prisma.supplier.findMany({
    where: { branchId },
    select: { id: true, name: true },
  });
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));
  const pos = await prisma.purchaseOrder.findMany({
    where: { branchId },
    include: { items: { orderBy: { sortIndex: 'asc' } } },
    orderBy: { sortIndex: 'asc' },
  });
  for (const po of pos) {
    const kind = expenseKindForSupplierName(
      po.supplierId ? supplierNameById.get(po.supplierId) : null,
    );
    const exp = await prisma.expense.create({
      data: {
        id: `exp_po_${po.id}`,
        branchId,
        kind,
        date: po.date,
        description: purchaseDescription(po),
        supplierId: po.supplierId,
        totalMinor: po.amountMinor,
        note: po.note ?? '',
        source: 'purchase',
        sortIndex: po.sortIndex,
      },
    });
    if (kind === 'item_purchase') report.itemPurchaseExpenses++;
    else report.otherExpenses++;
    if (po.items.length) {
      await prisma.expenseItem.createMany({
        data: po.items.map((it, j) => ({
          branchId,
          expenseId: exp.id,
          name: it.name,
          qty: it.qty,
          unit: it.unit,
          rateMinor: it.rateMinor,
          totalMinor: it.totalMinor,
          sortIndex: j,
        })),
      });
    }
  }

  // ---- 2. daily expense lines (regular) --------------------------------------
  const lines = await prisma.dailyEntryExpenseLine.findMany({
    where: { branchId },
    include: { dailyEntry: { select: { date: true } } },
    orderBy: [{ dailyEntryId: 'asc' }, { sortIndex: 'asc' }],
  });

  const byEntry = new Map();
  for (const l of lines) {
    const arr = byEntry.get(l.dailyEntryId) ?? [];
    arr.push(l);
    byEntry.set(l.dailyEntryId, arr);
  }

  // ---- 3. daily regular payments (vendor uses ledger FIFO, staff step 3b) --
  for (const [, entryLines] of byEntry) {
    for (const line of entryLines) {
      const date = line.dailyEntry.date;
      if (line.kind !== 'regular') continue;

      const exp = await prisma.expense.create({
        data: {
          id: `exp_del_${line.id}`,
          branchId,
          kind: 'other_expense',
          date,
          description: line.label || line.vendor || 'Expense',
          totalMinor: line.amountMinor,
          note: line.note ?? '',
          source: 'daily',
          sortIndex: line.sortIndex,
        },
      });
      report.otherExpenses++;
      await prisma.payment.create({
        data: {
          id: `pay_del_${line.id}`,
          branchId,
          expenseId: exp.id,
          date,
          amountMinor: line.amountMinor,
          method: methodFromText(line.ledgerNote || line.note),
          note: line.note ?? '',
          source: 'daily',
          sortIndex: line.sortIndex,
        },
      });
      report.payments.regular++;
    }
  }

  // ---- 3b. salary payouts from the salary register ---------------------------
  // SalaryPayment carries the salary month each payout settles (v1 truth);
  // daily-line dates mis-attribute months (July cash paying June salary).
  const sps = await prisma.salaryPayment.findMany({ where: { branchId } });
  for (const sp of sps) {
    await prisma.payment.create({
      data: {
        id: `pay_sp_${sp.id}`,
        branchId,
        salaryLineId: sp.salaryLineId,
        date: sp.date,
        amountMinor: sp.amountMinor,
        method: 'cash',
        note: sp.note ?? '',
        source: 'daily',
        sortIndex: sp.sortIndex,
      },
    });
    report.payments.staff++;
  }

  // ---- 4. settle purchase bills from cashbook ledger payments (FIFO) --------
  const billExpenses = await prisma.expense.findMany({
    where: { branchId, source: 'purchase' },
    select: { id: true, supplierId: true, date: true, totalMinor: true },
  });
  const ledgerPays = await prisma.ledgerEntry.findMany({
    where: { branchId, type: 'payment' },
    select: {
      id: true,
      supplierId: true,
      date: true,
      amountMinor: true,
      memo: true,
      ref: true,
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
  const allocs = allocateLedgerPaymentsFifo(billExpenses, ledgerPays);
  let sort = 0;
  for (const a of allocs) {
    await prisma.payment.create({
      data: {
        id: `pay_lg_${a.ledgerEntryId}_${a.expenseId}`,
        branchId,
        expenseId: a.expenseId,
        date: a.date,
        amountMinor: a.amountMinor,
        method: methodFromText(a.memo),
        transactionId: a.transactionId,
        note: a.memo || '',
        source: 'ledger',
        sortIndex: sort++,
      },
    });
    report.payments.ledger++;
  }

  return report;
}

async function main() {
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const reports = [];
  for (const b of branches) {
    const r = await backfillBranch(b.id);
    r.branchName = b.name;
    reports.push(r);
  }
  console.log(JSON.stringify(reports, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
