#!/usr/bin/env node
/**
 * P2 backfill — project the existing relational data into the Expense payables
 * model (Expense / ExpenseItem / Payment). Idempotent: clears the target tables
 * per branch and re-derives them. LOCAL SANDBOX ONLY until verified.
 *
 * Mapping (derived from the real data — see docs/expense-payables-plan.md):
 *   - PurchaseOrder            -> Expense(item_purchase) [+ ExpenseItem]  (the bill)
 *   - expense line `regular`   -> Expense(other_expense) + Payment        (paid now)
 *   - expense line `vendor`    -> Payment against the matching purchase Expense
 *   - expense line `staff`     -> Payment against the SalaryLine
 *   - expense line `purchase`  -> IGNORED (it is the bill; the PO is canonical)
 *
 * Cash parity holds by construction: Payments are exactly the vendor+staff+regular
 * lines (which equal DailyEntry.expenses), each dated on its daily-entry date.
 * Payment method + transactionId come from the linked ledger payment entry.
 */
import { PrismaClient } from '@prisma/client';

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
    payments: { vendor: 0, staff: 0, regular: 0 },
    vendorMatched: 0,
    vendorFallbackSupplier: 0,
    vendorFallbackStandalone: 0,
    staffUnresolved: 0,
  };

  // ---- clear (idempotent) --------------------------------------------------
  await prisma.payment.deleteMany({ where: { branchId } });
  await prisma.expenseItem.deleteMany({ where: { branchId } });
  await prisma.expenseReturn.deleteMany({ where: { branchId } });
  await prisma.expenseAttachment.deleteMany({ where: { branchId } });
  await prisma.expense.deleteMany({ where: { branchId } });

  // ---- 1. item-purchase Expenses from PurchaseOrders -----------------------
  const pos = await prisma.purchaseOrder.findMany({
    where: { branchId },
    include: { items: { orderBy: { sortIndex: 'asc' } } },
    orderBy: { sortIndex: 'asc' },
  });
  const poToExpense = new Map(); // poId -> expenseId
  const poById = new Map(); // poId -> po
  for (const po of pos) {
    poById.set(po.id, po);
    const exp = await prisma.expense.create({
      data: {
        id: `exp_po_${po.id}`,
        branchId,
        kind: 'item_purchase',
        date: po.date,
        description: purchaseDescription(po),
        supplierId: po.supplierId,
        totalMinor: po.amountMinor,
        note: po.note ?? '',
        source: 'purchase',
        sortIndex: po.sortIndex,
      },
    });
    poToExpense.set(po.id, exp.id);
    report.itemPurchaseExpenses++;
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

  // Supplier -> its item_purchase expense ids (for fallback matching).
  const supplierExpenses = new Map(); // supplierId -> [expenseId]
  for (const po of pos) {
    if (!po.supplierId) continue;
    const arr = supplierExpenses.get(po.supplierId) ?? [];
    arr.push(poToExpense.get(po.id));
    supplierExpenses.set(po.supplierId, arr);
  }

  // ---- 2. load expense lines (+ entry date) and linked ledger suppliers ----
  const lines = await prisma.dailyEntryExpenseLine.findMany({
    where: { branchId },
    include: { dailyEntry: { select: { date: true } } },
    orderBy: [{ dailyEntryId: 'asc' }, { sortIndex: 'asc' }],
  });
  const ledgerIds = [...new Set(lines.map((l) => l.ledgerEntryId).filter(Boolean))];
  const ledgers = await prisma.ledgerEntry.findMany({ where: { id: { in: ledgerIds } } });
  const ledgerById = new Map(ledgers.map((e) => [e.id, e]));

  const sps = await prisma.salaryPayment.findMany({ where: { branchId } });
  const salaryLineByPaymentId = new Map(sps.map((s) => [s.id, s.salaryLineId]));

  // Fallback resolution for staff payments: the daily line's `salaryPaymentId`
  // is a soft link that matches only ~40% of the time, so also index salary
  // lines by employee + month.
  const salaryLines = await prisma.salaryLine.findMany({
    where: { branchId },
    include: { salaryMonth: { select: { monthKey: true } } },
  });
  const salaryLinesByEmployee = new Map(); // employeeId -> [{id, month}]
  for (const sl of salaryLines) {
    if (!sl.employeeId) continue;
    const arr = salaryLinesByEmployee.get(sl.employeeId) ?? [];
    arr.push({ id: sl.id, month: (sl.salaryMonth?.monthKey ?? '').slice(0, 7) });
    salaryLinesByEmployee.set(sl.employeeId, arr);
  }

  // group lines by daily entry for vendor<->purchase pairing
  const byEntry = new Map();
  for (const l of lines) {
    const arr = byEntry.get(l.dailyEntryId) ?? [];
    arr.push(l);
    byEntry.set(l.dailyEntryId, arr);
  }

  const supplierOf = (line) => {
    const le = line.ledgerEntryId ? ledgerById.get(line.ledgerEntryId) : null;
    return le ? le.supplierId : null;
  };

  // ---- 3. create Payments (+ standalone other_expense Expenses) ------------
  for (const [, entryLines] of byEntry) {
    // purchase candidates for this entry: {poId, supplierId, amount, used}
    const purchaseCandidates = entryLines
      .filter((l) => l.kind === 'purchase' && l.purchaseOrderId)
      .map((l) => ({
        poId: l.purchaseOrderId,
        supplierId: supplierOf(l) ?? poById.get(l.purchaseOrderId)?.supplierId ?? null,
        amount: l.amountMinor,
        used: false,
      }));

    for (const line of entryLines) {
      const date = line.dailyEntry.date;
      if (line.kind === 'purchase') continue; // the bill; PO is canonical

      if (line.kind === 'regular') {
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
        continue;
      }

      if (line.kind === 'staff') {
        let salaryLineId = line.salaryPaymentId
          ? salaryLineByPaymentId.get(line.salaryPaymentId)
          : null;
        if (!salaryLineId && line.employeeId) {
          const cands = salaryLinesByEmployee.get(line.employeeId) ?? [];
          const em = date.slice(0, 7);
          const hit = cands.find((c) => c.month === em) ?? cands[cands.length - 1];
          if (hit) salaryLineId = hit.id;
        }
        if (!salaryLineId) {
          // Last resort: keep cash parity by landing it as an other_expense.
          const exp = await prisma.expense.create({
            data: {
              id: `exp_del_${line.id}`,
              branchId,
              kind: 'other_expense',
              date,
              description: line.employeeName || 'Staff payment',
              totalMinor: line.amountMinor,
              note: line.note ?? '',
              source: 'daily',
              sortIndex: line.sortIndex,
            },
          });
          report.otherExpenses++;
          report.staffUnresolved++;
          await prisma.payment.create({
            data: {
              id: `pay_del_${line.id}`,
              branchId,
              expenseId: exp.id,
              date,
              amountMinor: line.amountMinor,
              method: 'cash',
              note: line.note ?? '',
              source: 'daily',
              sortIndex: line.sortIndex,
            },
          });
          report.payments.staff++;
          continue;
        }
        await prisma.payment.create({
          data: {
            id: `pay_del_${line.id}`,
            branchId,
            salaryLineId,
            date,
            amountMinor: line.amountMinor,
            method: 'cash',
            note: line.note ?? '',
            source: 'daily',
            sortIndex: line.sortIndex,
          },
        });
        report.payments.staff++;
        continue;
      }

      if (line.kind === 'vendor') {
        const supplierId = supplierOf(line);
        const ledger = line.ledgerEntryId ? ledgerById.get(line.ledgerEntryId) : null;
        // primary match: same supplier + same amount within this entry
        let cand = purchaseCandidates.find(
          (c) => !c.used && c.supplierId === supplierId && c.amount === line.amountMinor,
        );
        if (cand) {
          cand.used = true;
          report.vendorMatched++;
        }
        let expenseId = cand ? poToExpense.get(cand.poId) : null;
        // fallback 1: any item_purchase expense for the same supplier
        if (!expenseId && supplierId && supplierExpenses.get(supplierId)?.length) {
          expenseId = supplierExpenses.get(supplierId)[0];
          report.vendorFallbackSupplier++;
        }
        // fallback 2: standalone other_expense so the payment still lands
        if (!expenseId) {
          const exp = await prisma.expense.create({
            data: {
              id: `exp_del_${line.id}`,
              branchId,
              kind: 'other_expense',
              date,
              description: line.vendor || 'Supplier payment',
              totalMinor: line.amountMinor,
              note: line.note ?? '',
              source: 'daily',
              sortIndex: line.sortIndex,
            },
          });
          expenseId = exp.id;
          report.otherExpenses++;
          report.vendorFallbackStandalone++;
        }
        await prisma.payment.create({
          data: {
            id: `pay_del_${line.id}`,
            branchId,
            expenseId,
            date,
            amountMinor: line.amountMinor,
            method: methodFromText(ledger?.memo || line.ledgerNote),
            transactionId: ledger?.ref ?? '',
            note: line.ledgerNote ?? '',
            source: 'daily',
            sortIndex: line.sortIndex,
          },
        });
        report.payments.vendor++;
        continue;
      }
    }
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
