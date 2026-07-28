#!/usr/bin/env node
/**
 * Compare production v1 (JSON cashbooks) vs shadow v2 (relational payables).
 *
 * Env:
 *   V1_DATABASE_URL  — postgres URL for prod (BranchLedgerWorkspace)
 *   V2_DATABASE_URL  — postgres URL for krunch_v2
 *   PARITY_OUT       — optional JSON report path (default .v1-v2-parity.json)
 *
 * Uses `psql` (no extra npm deps). Exit 1 if hard gates fail.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const v1Url = process.env.V1_DATABASE_URL;
const v2Url = process.env.V2_DATABASE_URL;
if (!v1Url || !v2Url) {
  console.error('Set V1_DATABASE_URL and V2_DATABASE_URL');
  process.exit(2);
}

const tol = Number(process.env.PARITY_TOLERANCE_MINOR || 1);
let failures = 0;

function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
}

function psqlUrl(url, sql) {
  const out = execFileSync(
    'psql',
    [url, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '\t', '-c', sql],
    { encoding: 'utf8' },
  );
  return out
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((ln) => ln.split('\t'));
}

function main() {
  const v1Rows = psqlUrl(
    v1Url,
    `
WITH ws AS (
  SELECT suppliers::jsonb s, ledger::jsonb l, moves::jsonb m
  FROM "BranchLedgerWorkspace" LIMIT 1
),
sup AS (SELECT e->>'id' id, e->>'name' name FROM ws, jsonb_array_elements(s) e),
led AS (
  SELECT e->>'supplierId' sid, e->>'type' typ, (e->>'amountCents')::bigint amt
  FROM ws, jsonb_array_elements(l) e
),
mov AS (
  SELECT e->>'supplierId' sid, (e->>'amountCents')::bigint amt, e->>'date' d
  FROM ws, jsonb_array_elements(m) e WHERE e->>'kind'='purchase'
),
lagg AS (
  SELECT sid,
    COALESCE(SUM(amt) FILTER (WHERE typ='invoice'),0)::bigint inv,
    COALESCE(SUM(amt) FILTER (WHERE typ='payment'),0)::bigint pay
  FROM led GROUP BY sid
),
magg AS (
  SELECT sid, COALESCE(SUM(amt),0)::bigint po, COUNT(*)::int po_n FROM mov GROUP BY sid
),
dups AS (
  SELECT sid, COUNT(*)::int dup_groups FROM (
    SELECT sid, d, amt FROM mov GROUP BY sid, d, amt HAVING COUNT(*) > 1
  ) x GROUP BY sid
)
SELECT s.id, s.name,
  COALESCE(a.inv,0), COALESCE(a.pay,0), COALESCE(a.inv,0)+COALESCE(a.pay,0),
  COALESCE(m.po_n,0), COALESCE(m.po,0), COALESCE(d.dup_groups,0)
FROM sup s
LEFT JOIN lagg a ON a.sid=s.id
LEFT JOIN magg m ON m.sid=s.id
LEFT JOIN dups d ON d.sid=s.id
ORDER BY s.name
`,
  ).map((p) => ({
    id: p[0],
    name: p[1],
    inv: Number(p[2]),
    pay: Number(p[3]),
    bal: Number(p[4]),
    po_n: Number(p[5]),
    po: Number(p[6]),
    dup_groups: Number(p[7]),
  }));

  const v2Led = Object.fromEntries(
    psqlUrl(
      v2Url,
      `
SELECT s.id, s.name, s."bookPurpose",
  COALESCE(SUM(le."amountMinor") FILTER (WHERE le.type='invoice'),0),
  COALESCE(SUM(le."amountMinor") FILTER (WHERE le.type='payment'),0),
  COALESCE(SUM(le."amountMinor"),0),
  (SELECT COUNT(*) FROM "PurchaseOrder" po WHERE po."supplierId"=s.id),
  (SELECT COALESCE(SUM(po."amountMinor"),0) FROM "PurchaseOrder" po WHERE po."supplierId"=s.id)
FROM "Supplier" s
LEFT JOIN "LedgerEntry" le ON le."supplierId"=s.id
GROUP BY s.id, s.name, s."bookPurpose"
ORDER BY s.name
`,
    ).map((p) => [
      p[0],
      {
        name: p[1],
        bookPurpose: p[2],
        inv: Number(p[3]),
        pay: Number(p[4]),
        bal: Number(p[5]),
        po_n: Number(p[6]),
        po: Number(p[7]),
      },
    ]),
  );

  const v2Exp = Object.fromEntries(
    psqlUrl(
      v2Url,
      `
SELECT s.id,
  COUNT(e.id),
  COALESCE(SUM(e."totalMinor"),0),
  COALESCE(SUM(pay.paid),0)
FROM "Supplier" s
LEFT JOIN "Expense" e ON e."supplierId"=s.id AND e.source='purchase'
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(p."amountMinor"),0) paid FROM "Payment" p WHERE p."expenseId"=e.id
) pay ON true
GROUP BY s.id
`,
    ).map((p) => [
      p[0],
      { exp_n: Number(p[1]), total: Number(p[2]), paid: Number(p[3]) },
    ]),
  );

  console.log('\n=== Supplier parity (BDT) ===');
  let ledFails = 0;
  let dueFails = 0;
  const suppliers = [];
  for (const r of v1Rows) {
    const l = v2Led[r.id];
    const e = v2Exp[r.id] || { total: 0, paid: 0, exp_n: 0 };
    const v1Due = Math.max(0, r.bal);
    const v2Due = Math.max(0, e.total - e.paid);
    const ledOk = !!l && Math.abs(r.bal - l.bal) <= tol && r.inv === l.inv;
    const dueOk = Math.abs(v1Due - v2Due) <= tol;
    if (!ledOk) ledFails++;
    if (!dueOk) dueFails++;
    const notes = [];
    if (!l) notes.push('missing_v2');
    if (!ledOk) notes.push('ledger_drift');
    if (!dueOk) notes.push(`due v1=${(v1Due / 100).toFixed(2)} v2=${(v2Due / 100).toFixed(2)}`);
    if (r.dup_groups > 0) notes.push(`dup_groups=${r.dup_groups}`);
    console.log(
      `${r.name.slice(0, 28).padEnd(28)} | bal ${(r.bal / 100).toFixed(2).padStart(10)} → ${(
        (l?.bal ?? 0) / 100
      )
        .toFixed(2)
        .padStart(10)} | due ${(v1Due / 100).toFixed(2).padStart(10)} → ${(v2Due / 100)
        .toFixed(2)
        .padStart(10)} | ${notes.join('; ') || 'OK'}`,
    );
    suppliers.push({
      name: r.name,
      v1Bal: r.bal,
      v2Bal: l?.bal ?? null,
      v1Due,
      v2Due,
      v2Paid: e.paid,
      v2Total: e.total,
      dupGroups: r.dup_groups,
      bookPurpose: l?.bookPurpose ?? '',
      ok: ledOk && dueOk,
    });
  }

  check('ledger balances match', ledFails === 0, `fails=${ledFails}`);
  check('expense due matches v1 account due', dueFails === 0, `fails=${dueFails}`);

  const v1Inv = v1Rows.reduce((s, r) => s + r.inv, 0);
  const v1Pay = v1Rows.reduce((s, r) => s + r.pay, 0);
  const v2Inv = Object.values(v2Led).reduce((s, r) => s + r.inv, 0);
  const v2Pay = Object.values(v2Led).reduce((s, r) => s + r.pay, 0);
  const v2BillTot = Object.values(v2Exp).reduce((s, r) => s + r.total, 0);
  const v2BillPaid = Object.values(v2Exp).reduce((s, r) => s + r.paid, 0);

  check('invoice totals', Math.abs(v1Inv - v2Inv) <= tol, `v1=${v1Inv} v2=${v2Inv}`);
  check('ledger payment totals', Math.abs(v1Pay - v2Pay) <= tol, `v1=${v1Pay} v2=${v2Pay}`);
  check('purchase bills == invoices', Math.abs(v2BillTot - v1Inv) <= tol, `bills=${v2BillTot} inv=${v1Inv}`);

  const st = psqlUrl(
    v2Url,
    `
SELECT
  COUNT(*) FILTER (WHERE paid<=0),
  COUNT(*) FILTER (WHERE paid>0 AND paid<total),
  COUNT(*) FILTER (WHERE paid>=total AND total>0)
FROM (
  SELECT e."totalMinor" total,
    (SELECT COALESCE(SUM(p."amountMinor"),0) FROM "Payment" p WHERE p."expenseId"=e.id) paid
  FROM "Expense" e WHERE e.source='purchase'
) x
`,
  )[0];

  console.log(
    `\nV2 purchase-bill status: unpaid=${st[0]} partial=${st[1]} paid=${st[2]}`,
  );
  console.log(
    `V2 bills: total=${(v2BillTot / 100).toFixed(2)} paid=${(v2BillPaid / 100).toFixed(2)} due=${(
      Math.max(0, v2BillTot - v2BillPaid) / 100
    ).toFixed(2)}`,
  );
  console.log(
    `V1 cashbook: inv=${(v1Inv / 100).toFixed(2)} pay=${(v1Pay / 100).toFixed(2)} bal=${(
      (v1Inv + v1Pay) / 100
    ).toFixed(2)}`,
  );

  const dups = suppliers.filter((r) => r.dupGroups > 0);
  if (dups.length) {
    console.log('\n=== Data-quality: duplicate same-day same-amount PO groups ===');
    for (const r of dups) console.log(`  ${r.name}: ${r.dupGroups} group(s)`);
  }

  const summary = {
    ok: failures === 0,
    failures,
    generatedAt: new Date().toISOString(),
    nuances: [
      'V1 due = max(0, Σ ledger invoices + Σ ledger payments) per supplier (account-level).',
      'V2 due = Σ max(0, expense.total − payments) on source=purchase bills.',
      'Paid/due must come from LedgerEntry payments (FIFO), not daily vendor lines.',
      '2026-07-19 has ×15 duplicate POs for several suppliers; daily only recorded 1 cash-out each.',
      'bookPurpose item_purchase|other_expense classifies UI lists; does not change money.',
    ],
    totals: {
      v1InvoicesMinor: v1Inv,
      v1PaymentsMinor: v1Pay,
      v1BalanceMinor: v1Inv + v1Pay,
      v2BillTotalMinor: v2BillTot,
      v2BillPaidMinor: v2BillPaid,
      v2BillDueMinor: Math.max(0, v2BillTot - v2BillPaid),
      unpaid: Number(st[0]),
      partial: Number(st[1]),
      paid: Number(st[2]),
    },
    suppliers,
  };
  const outPath = process.env.PARITY_OUT || '.v1-v2-parity.json';
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outPath}`);

  if (failures) process.exit(1);
  console.log('\nALL PARITY GATES PASSED');
}

main();
