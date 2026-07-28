#!/usr/bin/env node
/**
 * Expense payables projection checks (relational DB only).
 *
 * Gates:
 *   1. source=purchase expenses == PurchaseOrders (count + total)
 *   2. unified salary Payments   == salary register (SalaryPayment) per line
 *   3. per-supplier purchase due == max(0, Σ LedgerEntry)  (v1 account due)
 *   4. no orphan payment targets
 *
 * Note: Payment totals are NOT expected to equal DailyEntry.expenses anymore —
 * bill settlement uses cashbook ledger payments (FIFO), while the daily register
 * stays on DailyEntry.expenses. Cross-DB check: scripts/verify-v1-v2-parity.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
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

    // 1. all purchase-sourced expenses == POs (kind may be item_purchase or other)
    const expAgg = await prisma.expense.aggregate({
      where: { branchId: b, source: 'purchase' },
      _sum: { totalMinor: true },
      _count: true,
    });
    const poAgg = await prisma.purchaseOrder.aggregate({
      where: { branchId: b },
      _sum: { amountMinor: true },
      _count: true,
    });
    check('purchaseBills.count', expAgg._count, poAgg._count);
    check('purchaseBills.total', expAgg._sum.totalMinor ?? 0, poAgg._sum.amountMinor ?? 0);

    const payments = await prisma.payment.findMany({ where: { branchId: b } });

    // 2. unified salary payments mirror the salary register per line
    const unifiedSal = await prisma.payment.groupBy({
      by: ['salaryLineId'],
      where: { branchId: b, salaryLineId: { not: null }, source: { not: 'manual' } },
      _sum: { amountMinor: true },
    });
    const legacySal = await prisma.salaryPayment.groupBy({
      by: ['salaryLineId'],
      where: { branchId: b },
      _sum: { amountMinor: true },
    });
    const legacyByLine = new Map(legacySal.map((r) => [r.salaryLineId, r._sum.amountMinor ?? 0]));
    let salLineMismatches = 0;
    for (const r of unifiedSal) {
      if ((legacyByLine.get(r.salaryLineId) ?? 0) !== (r._sum.amountMinor ?? 0)) salLineMismatches++;
    }
    check('salaryPayments.perLineMismatches', salLineMismatches, 0);
    check(
      'salaryPayments.total',
      unifiedSal.reduce((s, r) => s + (r._sum.amountMinor ?? 0), 0),
      legacySal.reduce((s, r) => s + (r._sum.amountMinor ?? 0), 0),
    );

    // 3. per-supplier due == max(0, ledger balance)  (v1 account due)
    const suppliers = await prisma.supplier.findMany({ where: { branchId: b } });
    const ledger = await prisma.ledgerEntry.findMany({ where: { branchId: b } });
    const bills = await prisma.expense.findMany({
      where: { branchId: b, source: 'purchase' },
      include: { payments: true },
    });
    let dueMismatches = 0;
    for (const s of suppliers) {
      const bal = ledger
        .filter((le) => le.supplierId === s.id)
        .reduce((sum, le) => sum + le.amountMinor, 0);
      const v1Due = Math.max(0, bal);
      const v2Due = bills
        .filter((e) => e.supplierId === s.id)
        .reduce((sum, e) => {
          const paid = e.payments.reduce((p, x) => p + x.amountMinor, 0);
          return sum + Math.max(0, e.totalMinor - paid);
        }, 0);
      if (Math.abs(v1Due - v2Due) > 1) {
        dueMismatches++;
        if (dueMismatches <= 8) {
          console.log(`     ${s.name}: v1Due=${v1Due / 100} v2Due=${v2Due / 100}`);
        }
      }
    }
    check('supplierDue.mismatches', dueMismatches, 0);

    // 4. no orphan targets
    const expIds = new Set(
      (await prisma.expense.findMany({ where: { branchId: b }, select: { id: true } })).map(
        (x) => x.id,
      ),
    );
    const slIds = new Set(
      (await prisma.salaryLine.findMany({ where: { branchId: b }, select: { id: true } })).map(
        (x) => x.id,
      ),
    );
    let orphans = 0;
    for (const p of payments) {
      if (p.expenseId && !expIds.has(p.expenseId)) orphans++;
      if (p.salaryLineId && !slIds.has(p.salaryLineId)) orphans++;
    }
    check('payments.orphanTargets', orphans, 0);

    const payAgg = await prisma.payment.aggregate({
      where: { branchId: b },
      _sum: { amountMinor: true },
    });
    const totalExpenses =
      (
        await prisma.expense.aggregate({
          where: { branchId: b },
          _sum: { totalMinor: true },
        })
      )._sum.totalMinor ?? 0;
    console.log(
      `     Expense total: ${totalExpenses / 100} · Paid (all Payment): ${(payAgg._sum.amountMinor ?? 0) / 100}`,
    );
  }

  console.log(failures === 0 ? '\nALL EXPENSE PARITY CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
