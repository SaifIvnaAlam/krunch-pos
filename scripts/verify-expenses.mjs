#!/usr/bin/env node
/**
 * P2 verification — proves the Expense payables projection is faithful and, most
 * importantly, that it preserves every historical daily balance.
 *
 * Gates:
 *   1. item_purchase expense totals  == Σ PurchaseOrder.amountMinor
 *   2. Σ Payment                     == Σ (vendor+staff+regular) expense lines
 *   3. salary Payment total/count    == Σ staff lines
 *   4. DAILY PARITY (money gate): for every daily entry, Σ Payment dated that day
 *      == DailyEntry.expenses  (so remaining-balance is unchanged)
 *   5. no orphan payment targets
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const M = (n) => Math.round(Number(n) * 100);
let failures = 0;

function check(label, a, b) {
  const ok = a === b;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}: projection=${a} source=${b}`);
}

async function main() {
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  for (const branch of branches) {
    const b = branch.id;
    console.log(`\n=== ${branch.name} ===`);

    // 1. item-purchase totals
    const expAgg = await prisma.expense.aggregate({
      where: { branchId: b, kind: 'item_purchase' },
      _sum: { totalMinor: true },
      _count: true,
    });
    const poAgg = await prisma.purchaseOrder.aggregate({
      where: { branchId: b },
      _sum: { amountMinor: true },
      _count: true,
    });
    check('itemPurchase.count', expAgg._count, poAgg._count);
    check('itemPurchase.total', expAgg._sum.totalMinor ?? 0, poAgg._sum.amountMinor ?? 0);

    // 2. total payments == vendor+staff+regular lines
    const payAgg = await prisma.payment.aggregate({
      where: { branchId: b },
      _sum: { amountMinor: true },
      _count: true,
    });
    const lines = await prisma.dailyEntryExpenseLine.findMany({
      where: { branchId: b },
      include: { dailyEntry: { select: { date: true } } },
    });
    const cashLines = lines.filter((l) => ['vendor', 'staff', 'regular'].includes(l.kind));
    const cashLinesSum = cashLines.reduce((s, l) => s + l.amountMinor, 0);
    check('payments.count', payAgg._count, cashLines.length);
    check('payments.total', payAgg._sum.amountMinor ?? 0, cashLinesSum);

    // 3. salary payments
    const salPayAgg = await prisma.payment.aggregate({
      where: { branchId: b, salaryLineId: { not: null } },
      _sum: { amountMinor: true },
      _count: true,
    });
    const staffLines = lines.filter((l) => l.kind === 'staff');
    check(
      'salaryPayments.total',
      salPayAgg._sum.amountMinor ?? 0,
      staffLines.reduce((s, l) => s + l.amountMinor, 0),
    );

    // 4. DAILY PARITY — the money gate
    const entries = await prisma.dailyEntry.findMany({ where: { branchId: b } });
    const payments = await prisma.payment.findMany({ where: { branchId: b } });
    const payByDate = new Map();
    for (const p of payments) payByDate.set(p.date, (payByDate.get(p.date) ?? 0) + p.amountMinor);
    let dayMismatch = 0;
    for (const e of entries) {
      const paid = payByDate.get(e.date) ?? 0;
      if (paid !== M(e.expenses)) {
        dayMismatch++;
        if (dayMismatch <= 8)
          console.log(`     day ${e.date}: Σpayments=${paid / 100} vs entry.expenses=${Number(e.expenses)}`);
      }
    }
    check('dailyParity.mismatchedDays', dayMismatch, 0);

    // 5. no orphan targets
    const expIds = new Set((await prisma.expense.findMany({ where: { branchId: b }, select: { id: true } })).map((x) => x.id));
    const slIds = new Set((await prisma.salaryLine.findMany({ where: { branchId: b }, select: { id: true } })).map((x) => x.id));
    let orphans = 0;
    for (const p of payments) {
      if (p.expenseId && !expIds.has(p.expenseId)) orphans++;
      if (p.salaryLineId && !slIds.has(p.salaryLineId)) orphans++;
    }
    check('payments.orphanTargets', orphans, 0);

    // informational: method distribution + paid/due headline
    const byMethod = {};
    for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountMinor;
    const totalExpenses = (await prisma.expense.aggregate({ where: { branchId: b }, _sum: { totalMinor: true } }))._sum.totalMinor ?? 0;
    const salaryPayable = (await prisma.salaryLine.findMany({ where: { branchId: b } })).reduce(
      (s, l) => s + l.basicMinor + l.serviceChargeMinor + l.overtimeMinor + l.eidBonusMinor + l.finesMinor,
      0,
    );
    console.log('     method split (whole units):', Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, v / 100])));
    console.log(`     Expense total (non-salary): ${totalExpenses / 100} · Salary payable: ${salaryPayable / 100} · Paid: ${(payAgg._sum.amountMinor ?? 0) / 100}`);
  }

  console.log(failures === 0 ? '\nALL EXPENSE PARITY CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
