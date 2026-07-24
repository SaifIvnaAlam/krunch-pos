#!/usr/bin/env node
/**
 * READ-ONLY preview of the cashbook → item-purchase conversion.
 *
 * Renders the current cashbook purchase data as the PDF "Item Purchase Table"
 * (Date | Supplier | Item | Qty | Rate | Amount | Paid | Due | Status) and proves
 * the mapping is complete + 1:1 with the source PurchaseOrders. Writes nothing.
 *
 * Ground truth for Paid is the live derived Expense(item_purchase) + its Payments
 * (what the app already shows in the item-purchase list today).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const money = (minor) => (minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });

function statusOf(totalMinor, paidMinor) {
  if (paidMinor <= 0) return 'Unpaid';
  if (paidMinor >= totalMinor) return 'Paid';
  return 'Partially Paid';
}

async function main() {
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  for (const branch of branches) {
    const b = branch.id;

    const pos = await prisma.purchaseOrder.findMany({ where: { branchId: b } });
    const purchases = await prisma.expense.findMany({
      where: { branchId: b, kind: 'item_purchase' },
      include: {
        supplier: { select: { name: true } },
        items: { orderBy: { sortIndex: 'asc' } },
        payments: true,
      },
      orderBy: [{ date: 'asc' }, { sortIndex: 'asc' }],
    });

    console.log(`\n=== ${branch.name} ===`);
    console.log(`Source cashbook PurchaseOrders: ${pos.length}`);
    console.log(`Item-purchase expenses (derived): ${purchases.length}  ${pos.length === purchases.length ? '(1:1 OK)' : '(!! mismatch)'}`);

    let tTotal = 0, tPaid = 0, tDue = 0;
    const rows = [];
    for (const p of purchases) {
      const paid = p.payments.reduce((s, pay) => s + pay.amountMinor, 0);
      const due = Math.max(0, p.totalMinor - paid);
      tTotal += p.totalMinor; tPaid += paid; tDue += due;
      const itemNames = p.items.map((i) => i.name).filter(Boolean);
      const itemLabel = itemNames.length ? itemNames.join(', ') : p.description;
      const qty = p.items.reduce((s, i) => s + Number(i.qty), 0);
      rows.push({
        date: p.date,
        supplier: p.supplier?.name ?? '(none)',
        item: itemLabel,
        qty: qty || '',
        amount: money(p.totalMinor),
        paid: money(paid),
        due: money(due),
        status: statusOf(p.totalMinor, paid),
      });
    }

    console.log('\nItem Purchase Table (PDF shape) — first 12 rows:');
    console.log('Date        Supplier                Item                          Qty      Amount        Paid          Due           Status');
    for (const r of rows.slice(0, 12)) {
      console.log(
        `${r.date.padEnd(11)} ${String(r.supplier).slice(0, 22).padEnd(23)} ${String(r.item).slice(0, 28).padEnd(29)} ${String(r.qty).padStart(5)}  ${r.amount.padStart(12)}  ${r.paid.padStart(12)}  ${r.due.padStart(12)}  ${r.status}`,
      );
    }
    if (rows.length > 12) console.log(`... and ${rows.length - 12} more rows`);

    const byStatus = rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
    console.log('\nDashboard totals (item purchase):');
    console.log(`  Total Amount: ${money(tTotal)}   Total Paid: ${money(tPaid)}   Total Due: ${money(tDue)}`);
    console.log(`  Status split: ${JSON.stringify(byStatus)}`);

    // Parity: derived expense totals must equal source PO amounts.
    const poTotal = pos.reduce((s, p) => s + p.amountMinor, 0);
    console.log(`\nParity: Σ PO amount=${money(poTotal)}  vs  Σ item-purchase total=${money(tTotal)}  ${poTotal === tTotal ? 'OK' : '!! MISMATCH'}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
