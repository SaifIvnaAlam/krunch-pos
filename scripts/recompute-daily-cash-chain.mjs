#!/usr/bin/env node
/**
 * Rebuild DailyEntry opening/closing cash with:
 *   closing = opening
 *     + cash/bkash/nagad/pathao/foodi/foodpanda
 *     - void - expenses
 *     + bankWithdrawn + cashIn
 *   next opening = previous closing
 *
 * First day per branch keeps its stored opening.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/recompute-daily-cash-chain.mjs           # dry-run
 *   DATABASE_URL=... node scripts/recompute-daily-cash-chain.mjs --apply   # write
 */
import { Prisma, PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL");
  process.exit(1);
}

const prisma = new PrismaClient();

function n(v) {
  return Number(v);
}

function round2(v) {
  return Math.round(n(v) * 100) / 100;
}

function cashFlow(row) {
  return (
    n(row.cashSale) +
    n(row.bkashSale) +
    n(row.nagadSale) +
    n(row.pathaoSale) +
    n(row.foodiSale) +
    n(row.foodpandaSale) -
    Math.max(0, n(row.voidSale ?? 0)) -
    n(row.expenses) +
    Math.max(0, n(row.bankWithdrawn ?? 0)) +
    Math.max(0, n(row.cashIn ?? 0))
  );
}

async function ensureCashIn() {
  const cols = await prisma.$queryRaw`
    SELECT 1 AS ok
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'DailyEntry'
      AND column_name = 'cashIn'
  `;
  if (cols.length > 0) return;
  if (!APPLY) {
    throw new Error(
      'DailyEntry.cashIn missing — run with --apply (adds column), or apply migration 20260803000000_daily_entry_cash_in first.',
    );
  }
  console.log("Adding DailyEntry.cashIn …");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "DailyEntry"
    ADD COLUMN "cashIn" DECIMAL(14,2) NOT NULL DEFAULT 0
  `);
}

async function main() {
  await ensureCashIn();

  const rows = await prisma.dailyEntry.findMany({
    orderBy: [{ branchId: "asc" }, { date: "asc" }],
  });

  const byBranch = new Map();
  for (const row of rows) {
    const list = byBranch.get(row.branchId) ?? [];
    list.push(row);
    byBranch.set(row.branchId, list);
  }

  const updates = [];
  let openingChanges = 0;
  let closingChanges = 0;

  for (const [branchId, list] of byBranch) {
    let prevClosing = null;
    console.log(`\n=== branch ${branchId} (${list.length} days) ===`);
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      const opening = i === 0 ? round2(row.openingBalance) : round2(prevClosing);
      const closing = round2(opening + cashFlow(row));
      const openingDelta = round2(opening - n(row.openingBalance));
      const closingDelta = round2(closing - n(row.remainingBalance));
      if (openingDelta !== 0) openingChanges += 1;
      if (closingDelta !== 0) closingChanges += 1;
      if (openingDelta !== 0 || closingDelta !== 0) {
        console.log(
          `${row.date}  opening ${n(row.openingBalance)} → ${opening}` +
            ` (${openingDelta >= 0 ? "+" : ""}${openingDelta})` +
            `  closing ${n(row.remainingBalance)} → ${closing}` +
            ` (${closingDelta >= 0 ? "+" : ""}${closingDelta})` +
            `  bankWd=${n(row.bankWithdrawn)}`,
        );
        updates.push({ id: row.id, opening, closing, date: row.date });
      }
      prevClosing = closing;
    }
  }

  console.log(
    `\n${APPLY ? "APPLY" : "DRY-RUN"}: ${updates.length} rows to update` +
      ` (${openingChanges} opening, ${closingChanges} closing changes)`,
  );

  if (!APPLY) {
    console.log("Re-run with --apply to write.");
    return;
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.dailyEntry.update({
        where: { id: u.id },
        data: {
          openingBalance: new Prisma.Decimal(u.opening.toFixed(2)),
          remainingBalance: new Prisma.Decimal(u.closing.toFixed(2)),
        },
      }),
    ),
  );
  console.log(`Updated ${updates.length} DailyEntry rows.`);

  const broken = await prisma.$queryRaw`
    WITH ordered AS (
      SELECT
        "branchId", date,
        "openingBalance"::numeric AS opening,
        "remainingBalance"::numeric AS closing,
        LAG("remainingBalance"::numeric) OVER (
          PARTITION BY "branchId" ORDER BY date
        ) AS prev_closing,
        ROW_NUMBER() OVER (PARTITION BY "branchId" ORDER BY date) AS rn
      FROM "DailyEntry"
    )
    SELECT date, opening, prev_closing, (opening - prev_closing) AS gap
    FROM ordered
    WHERE rn > 1 AND opening IS DISTINCT FROM prev_closing
    ORDER BY "branchId", date
  `;
  if (broken.length === 0) {
    console.log("Verify OK: every opening matches previous closing.");
  } else {
    console.error("Verify FAIL: openings still broken:");
    console.error(broken);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
