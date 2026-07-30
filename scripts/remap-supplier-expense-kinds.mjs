#!/usr/bin/env node
/**
 * Remap Supplier.bookPurpose + Expense.kind from the cashbook→payables map.
 * LOCAL / shadow DB only — point DATABASE_URL at the target.
 *
 *   DATABASE_URL=... node scripts/remap-supplier-expense-kinds.mjs
 */
import { PrismaClient } from '@prisma/client';
import { expenseKindForSupplierName } from './supplier-expense-kind-map.mjs';

const prisma = new PrismaClient();

async function main() {
  const suppliers = await prisma.supplier.findMany({
    select: { id: true, name: true, bookPurpose: true },
  });

  let suppliersUpdated = 0;
  let expensesUpdated = 0;

  for (const s of suppliers) {
    const kind = expenseKindForSupplierName(s.name);
    if (s.bookPurpose !== kind) {
      await prisma.supplier.update({
        where: { id: s.id },
        data: { bookPurpose: kind },
      });
      suppliersUpdated++;
    }

    const result = await prisma.expense.updateMany({
      where: { supplierId: s.id, NOT: { kind } },
      data: { kind },
    });
    expensesUpdated += result.count;
  }

  const byKind = await prisma.expense.groupBy({
    by: ['kind'],
    _count: { _all: true },
    _sum: { totalMinor: true },
  });

  console.log(
    JSON.stringify(
      {
        suppliersUpdated,
        expensesUpdated,
        totals: byKind.map((r) => ({
          kind: r.kind,
          count: r._count._all,
          totalBdt: (r._sum.totalMinor ?? 0) / 100,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
