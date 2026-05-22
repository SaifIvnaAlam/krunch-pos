/**
 * One-off demo data for Reports → Analytics (daily sales vs expenses chart).
 * Run: npx ts-node prisma/seed-daily-entries-demo.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const BRANCH_ID = 'a0000000-0000-4000-8000-000000000001';
const STAFF_ID = 'default-owner';
const BANK_NET_RATE = 1 - 0.0175;

/** Net sales targets (BDT) — shaped like the reference chart. */
const APRIL_2026_NET_SALES = [
  72000, 88000, 95000, 102000, 118000, 125000, 98000, 105000, 112000, 128000, 132000,
  138000, 142000, 145000, 120000, 108000, 115000, 98000, 102000, 95000, 88000, 92000,
  86000, 90000, 94000, 88000, 85000, 82000, 80000,
];

const APRIL_2026_EXPENSES = [
  38000, 42000, 88000, 45000, 52000, 48000, 55000, 62000, 58000, 65000, 72000, 68000,
  75000, 82000, 188000, 95000, 72000, 68000, 62000, 58000, 54000, 50000, 48000, 46000,
  44000, 42000, 40000, 39000, 38000,
];

/** May 2026 (current month) — partial month through the 22nd. */
const MAY_2026_NET_SALES = [
  78000, 92000, 105000, 98000, 112000, 125000, 118000, 132000, 128000, 135000, 142000,
  138000, 145000, 152000, 148000, 125000, 118000, 108000, 102000, 96000, 90000, 88000,
];

const MAY_2026_EXPENSES = [
  42000, 48000, 55000, 92000, 51000, 58000, 62000, 68000, 72000, 78000, 85000, 82000,
  88000, 95000, 175000, 82000, 75000, 68000, 62000, 58000, 54000, 52000,
];

function splitChannels(netSales: number) {
  const cashSale = netSales * 0.45;
  const bankNet = netSales * 0.3;
  const bkashSale = netSales * 0.15;
  const pathaoSale = netSales * 0.1;
  const bankSale = bankNet / BANK_NET_RATE;
  return {
    cashSale,
    bankSale,
    bkashSale,
    nagadSale: 0,
    pathaoSale,
    foodiSale: 0,
    foodpandaSale: 0,
  };
}

function netSalesFromParts(parts: ReturnType<typeof splitChannels>, voidSale = 0) {
  return (
    parts.cashSale +
    parts.bankSale * BANK_NET_RATE +
    parts.bkashSale +
    parts.nagadSale +
    parts.pathaoSale +
    parts.foodiSale +
    parts.foodpandaSale -
    voidSale
  );
}

async function seedMonth(
  year: number,
  month: number,
  netSalesByDay: number[],
  expensesByDay: number[],
  openingStart: number,
) {
  let opening = openingStart;

  for (let i = 0; i < netSalesByDay.length; i++) {
    const day = i + 1;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const targetNet = netSalesByDay[i]!;
    const expenses = expensesByDay[i]!;
    const channels = splitChannels(targetNet);
    const net = netSalesFromParts(channels);
    const remaining = opening + net - expenses;

    await prisma.dailyEntry.upsert({
      where: { branchId_date: { branchId: BRANCH_ID, date } },
      create: {
        branchId: BRANCH_ID,
        date,
        openingBalance: new Prisma.Decimal(opening.toFixed(2)),
        cashSale: new Prisma.Decimal(channels.cashSale.toFixed(2)),
        bankSale: new Prisma.Decimal(channels.bankSale.toFixed(2)),
        bkashSale: new Prisma.Decimal(channels.bkashSale.toFixed(2)),
        nagadSale: new Prisma.Decimal(0),
        pathaoSale: new Prisma.Decimal(channels.pathaoSale.toFixed(2)),
        foodiSale: new Prisma.Decimal(0),
        foodpandaSale: new Prisma.Decimal(0),
        expenses: new Prisma.Decimal(expenses.toFixed(2)),
        bankWithdrawn: new Prisma.Decimal(0),
        expenseLines: [],
        remainingBalance: new Prisma.Decimal(remaining.toFixed(2)),
        enteredByStaffId: STAFF_ID,
        enteredByName: 'Demo Seed',
      },
      update: {
        openingBalance: new Prisma.Decimal(opening.toFixed(2)),
        cashSale: new Prisma.Decimal(channels.cashSale.toFixed(2)),
        bankSale: new Prisma.Decimal(channels.bankSale.toFixed(2)),
        bkashSale: new Prisma.Decimal(channels.bkashSale.toFixed(2)),
        nagadSale: new Prisma.Decimal(0),
        pathaoSale: new Prisma.Decimal(channels.pathaoSale.toFixed(2)),
        foodiSale: new Prisma.Decimal(0),
        foodpandaSale: new Prisma.Decimal(0),
        expenses: new Prisma.Decimal(expenses.toFixed(2)),
        bankWithdrawn: new Prisma.Decimal(0),
        expenseLines: [],
        remainingBalance: new Prisma.Decimal(remaining.toFixed(2)),
        enteredByStaffId: STAFF_ID,
        enteredByName: 'Demo Seed',
      },
    });

    opening = remaining;
  }

  return opening;
}

async function main() {
  const branch = await prisma.branch.findUnique({ where: { id: BRANCH_ID } });
  if (!branch) {
    throw new Error(
      `Branch ${BRANCH_ID} not found. Run npm run db:seed from the repo root first.`,
    );
  }

  const aprilClosing = await seedMonth(2026, 4, APRIL_2026_NET_SALES, APRIL_2026_EXPENSES, 270_000);
  await seedMonth(2026, 5, MAY_2026_NET_SALES, MAY_2026_EXPENSES, aprilClosing);

  const count = await prisma.dailyEntry.count({ where: { branchId: BRANCH_ID } });
  console.log(`Seeded daily entries for branch "${branch.name}". Total rows: ${count}`);
  console.log('Open Reports → Analytics (defaults to May 2026). Use arrows for April 2026.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
