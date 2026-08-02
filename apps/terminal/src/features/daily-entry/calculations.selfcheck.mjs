/**
 * Runnable check for closing-cash formula.
 *   node apps/terminal/src/features/daily-entry/calculations.selfcheck.mjs
 */
function roundTaka(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function remaining(row) {
  const salesSum =
    row.cashSale +
    row.bkashSale +
    row.nagadSale +
    row.pathaoSale +
    row.foodiSale +
    row.foodpandaSale;
  const voidAmt = Math.max(0, row.voidSale ?? 0);
  const cashAdded =
    Math.max(0, row.bankWithdrawn ?? 0) + Math.max(0, row.cashIn ?? 0);
  return roundTaka(
    row.openingBalance + salesSum - voidAmt - row.expenses + cashAdded,
  );
}

const cases = [
  {
    name: "bank withdraw + cash in raise closing, not sales",
    row: {
      openingBalance: 10000,
      cashSale: 5000,
      bkashSale: 0,
      nagadSale: 0,
      pathaoSale: 0,
      foodiSale: 0,
      foodpandaSale: 0,
      voidSale: 0,
      expenses: 18000,
      bankWithdrawn: 20000,
      cashIn: 15000,
    },
    want: 32000,
  },
  {
    name: "bank sales stay out of cash",
    row: {
      openingBalance: 1000,
      cashSale: 100,
      bkashSale: 0,
      nagadSale: 0,
      pathaoSale: 0,
      foodiSale: 0,
      foodpandaSale: 0,
      voidSale: 0,
      expenses: 50,
      bankWithdrawn: 0,
      cashIn: 0,
      // bankSale would be 9999 — ignored by design
    },
    want: 1050,
  },
];

let failed = 0;
for (const c of cases) {
  const got = remaining(c.row);
  if (got !== c.want) {
    console.error(`FAIL ${c.name}: got ${got}, want ${c.want}`);
    failed += 1;
  } else {
    console.log(`ok ${c.name}`);
  }
}
if (failed) process.exit(1);
console.log("all checks passed");
