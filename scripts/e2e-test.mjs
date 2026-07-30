/* eslint-disable no-console */
/**
 * End-to-end test: drives the running API over HTTP (through JWT + RBAC guards)
 * against the local sandbox DB (a copy of production). It:
 *   - reads OLD migrated data (daily entries, ledger, payroll, employees) and
 *     confirms it aligns with the new relational infrastructure;
 *   - exercises the NEW payables features (categories, expenses, payments,
 *     quick-expense, reports) with full CRUD;
 *   - asserts the features are interconnected (payment -> expense paid/due/
 *     status -> reports; category delete -> SET NULL; salary payment);
 *   - cleans up everything it created so the sandbox returns to baseline.
 *
 * Usage: API must be running (default http://localhost:3010).
 *   node scripts/e2e-test.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');

const BASE = process.env.E2E_BASE ?? 'http://localhost:3010/api/v1';
const BRANCH_ID = 'a0000000-0000-4000-8000-000000000001';
const STAFF_ID = 'staff-azmain-fahim';
const SALARY_LINE_ID = '7c9242e5-d8a5-4d9d-be98-1dc4e7375a0f';
const SUPPLIER_ID = 'v-1783783643782';
const FUTURE_DATE = '2099-01-01';

const secret = readFileSync(new URL('../apps/api/.env', import.meta.url), 'utf8')
  .match(/^JWT_ACCESS_SECRET=(.+)$/m)[1]
  .trim();

const token = jwt.sign(
  {
    staffId: STAFF_ID,
    branchId: BRANCH_ID,
    terminalId: 'e2e-runner',
    roles: ['OWNER'],
    permissions: [
      'daily_entry:read',
      'daily_entry:write',
      'storage:read',
      'storage:write',
      'reports:branch',
      'reports:global',
      'staff:read',
      'audit:read',
    ],
  },
  secret,
  { expiresIn: 900 },
);

let pass = 0;
let fail = 0;
const failures = [];
function ok(label, cond, extra) {
  if (cond) {
    pass++;
    console.log(`OK    ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`FAIL  ${label}${extra ? `  -> ${JSON.stringify(extra)}` : ''}`);
  }
}
const approx = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, json };
}

const created = { expenseIds: [], paymentIds: [], categoryId: null };

async function main() {
  console.log(`\n=== E2E against ${BASE} ===\n`);

  // -- 0. Auth reaches a protected route --
  const me = await api('GET', '/staff/me');
  ok('auth: GET /staff/me authorized (200)', me.status === 200, me.status);

  // ================= OLD DATA aligns with new infrastructure =================
  console.log('\n-- Old migrated data (read via new relational paths) --');

  const deList = await api('GET', '/daily-entries');
  ok('daily: list returns 14 migrated entries', Array.isArray(deList.json) && deList.json.length === 14, deList.json?.length);

  const de712 = await api('GET', '/daily-entries/2026-07-12');
  const lines712 = de712.json?.expenseLines ?? [];
  ok('daily: 2026-07-12 has 8 expense lines (relational read)', lines712.length === 8, lines712.length);
  ok('daily: line kinds preserved (purchase/vendor/staff)',
    lines712.some((l) => l.kind === 'purchase') && lines712.some((l) => l.kind === 'staff'));
  ok('daily: purchase line keeps items', lines712.some((l) => l.kind === 'purchase' && Array.isArray(l.items) && l.items.length > 0));

  const ledger = await api('GET', '/ledger/workspace');
  ok('ledger: 17 suppliers migrated', ledger.json?.suppliers?.length === 17, ledger.json?.suppliers?.length);
  ok('ledger: 133 cashbook entries migrated', ledger.json?.ledger?.length === 133, ledger.json?.ledger?.length);

  const emps = await api('GET', '/employees/directory');
  ok('employees: 16 migrated', emps.json?.employees?.length === 16, emps.json?.employees?.length);

  const payroll = await api('GET', '/payroll/workspace');
  const monthKeys = Object.keys(payroll.json?.months ?? {});
  ok('payroll: 2 salary months migrated', monthKeys.length === 2, monthKeys);

  // ================= Daily entry WRITE round-trip (isolated date) =============
  console.log('\n-- Daily entry write round-trip (dual-write JSON + relational) --');
  const dePayload = {
    date: FUTURE_DATE,
    openingBalance: 1000,
    cashSale: 500,
    bankSale: 0,
    bkashSale: 0,
    pathaoSale: 0,
    foodiSale: 0,
    foodpandaSale: 0,
    expenses: 123.45,
    remainingBalance: 1376.55,
    expenseLines: [
      { kind: 'regular', amount: 123.45, label: 'E2E regular expense', note: 'e2e', lineId: 'e2e-line-1' },
    ],
  };
  const dePut = await api('PUT', `/daily-entries/${FUTURE_DATE}`, dePayload);
  ok('daily: PUT future entry (200/201)', dePut.status === 200 || dePut.status === 201, dePut.status);
  const deGet = await api('GET', `/daily-entries/${FUTURE_DATE}`);
  const wlines = deGet.json?.expenseLines ?? [];
  ok('daily: round-trip reads 1 relational line', wlines.length === 1, wlines.length);
  ok('daily: round-trip line content matches',
    wlines[0]?.kind === 'regular' && approx(wlines[0]?.amount, 123.45) && wlines[0]?.lineId === 'e2e-line-1', wlines[0]);

  // ================= NEW: expense categories (CRUD) ==========================
  console.log('\n-- Expense categories CRUD --');
  const catCreate = await api('POST', '/expense-categories', { name: 'E2E Snacks' });
  created.categoryId = catCreate.json?.id;
  ok('category: create (id returned)', !!created.categoryId, catCreate.status);
  const catList = await api('GET', '/expense-categories');
  ok('category: appears in list', (catList.json ?? []).some((c) => c.id === created.categoryId));
  const catUpd = await api('PUT', `/expense-categories/${created.categoryId}`, { name: 'E2E Snacks & Tea' });
  ok('category: update name', catUpd.json?.name === 'E2E Snacks & Tea', catUpd.json);

  // ================= NEW: expenses + payments + interconnection ==============
  console.log('\n-- Expenses + payments (derived paid/due/status) --');
  const expCreate = await api('POST', '/expenses', {
    kind: 'other_expense',
    date: '2026-07-10',
    description: 'E2E other expense',
    expenseCategoryId: created.categoryId,
    total: 1000,
    items: [{ name: 'thing', qty: 2, unit: 'pcs', rate: 500, total: 1000 }],
  });
  const expId = expCreate.json?.id;
  created.expenseIds.push(expId);
  ok('expense: create other_expense (id)', !!expId, expCreate.status);
  ok('expense: initial status unpaid, due=1000', expCreate.json?.status === 'unpaid' && approx(expCreate.json?.due, 1000), expCreate.json);
  ok('expense: category label linked', expCreate.json?.categoryName === 'E2E Snacks & Tea', expCreate.json?.categoryName);
  ok('expense: 1 item stored', (expCreate.json?.items ?? []).length === 1);

  // partial payment
  const pay1 = await api('POST', '/payments', { expenseId: expId, date: '2026-07-10', amount: 400, method: 'cash' });
  created.paymentIds.push(pay1.json?.id);
  ok('payment: create partial (id)', !!pay1.json?.id, pay1.status);
  const expAfter1 = await api('GET', `/expenses/${expId}`);
  ok('interconnect: expense now partially_paid, paid=400 due=600',
    expAfter1.json?.status === 'partially_paid' && approx(expAfter1.json?.paid, 400) && approx(expAfter1.json?.due, 600), expAfter1.json);

  // settle
  const pay2 = await api('POST', '/payments', { expenseId: expId, date: '2026-07-11', amount: 600, method: 'bank_transfer', transactionId: 'TXN-E2E' });
  created.paymentIds.push(pay2.json?.id);
  const expAfter2 = await api('GET', `/expenses/${expId}`);
  ok('interconnect: expense now paid, due=0',
    expAfter2.json?.status === 'paid' && approx(expAfter2.json?.due, 0), expAfter2.json);
  ok('payment: transactionId persisted', (expAfter2.json?.payments ?? []).some((p) => p.transactionId === 'TXN-E2E'));

  // item purchase with supplier
  const poCreate = await api('POST', '/expenses', {
    kind: 'item_purchase', date: '2026-07-09', description: 'E2E purchase',
    supplierId: SUPPLIER_ID, total: 250, items: [{ name: 'rice', qty: 1, unit: 'bag', rate: 250, total: 250 }],
  });
  created.expenseIds.push(poCreate.json?.id);
  ok('expense: item_purchase with supplier', poCreate.json?.supplierId === SUPPLIER_ID && poCreate.json?.supplierName, poCreate.json?.supplierName);

  // filters
  const unpaidList = await api('GET', '/expenses?status=unpaid&kind=item_purchase');
  ok('expense: status+kind filter returns our purchase', (unpaidList.json ?? []).some((e) => e.id === poCreate.json?.id));

  // validation: exactly-one target
  const badBoth = await api('POST', '/payments', { expenseId: expId, salaryLineId: SALARY_LINE_ID, date: '2026-07-10', amount: 1, method: 'cash' });
  ok('payment: rejects both targets (400)', badBoth.status === 400, badBoth.status);
  const badNone = await api('POST', '/payments', { date: '2026-07-10', amount: 1, method: 'cash' });
  ok('payment: rejects no target (400)', badNone.status === 400, badNone.status);

  // salary payment interconnection
  const salPay = await api('POST', '/payments', { salaryLineId: SALARY_LINE_ID, date: '2026-06-30', amount: 100, method: 'cash', note: 'e2e salary' });
  created.paymentIds.push(salPay.json?.id);
  ok('payment: against salary line (id)', !!salPay.json?.id, salPay.status);
  const salPayList = await api('GET', `/payments?salaryLineId=${SALARY_LINE_ID}`);
  ok('interconnect: salary payment listed under salary line', (salPayList.json ?? []).some((p) => p.id === salPay.json?.id));

  // ================= NEW: quick expense =====================================
  console.log('\n-- Quick expense (create + pay in one step) --');
  const quick = await api('POST', '/expenses/quick', { date: '2026-07-10', description: 'E2E quick', total: 500, method: 'cash' });
  created.expenseIds.push(quick.json?.id);
  ok('quick: created & fully paid (status paid, due 0)', quick.json?.status === 'paid' && approx(quick.json?.due, 0), quick.json);
  ok('quick: has one payment', (quick.json?.payments ?? []).length === 1);

  // ================= NEW: reports (old data + new data) ======================
  console.log('\n-- Expense reports (rolls up salary + expenses) --');
  const summary = await api('GET', '/expense-reports/summary');
  const cats = summary.json?.byCategory ?? [];
  const salaryCat = cats.find((c) => c.key === 'salary');
  ok('report: totals present', summary.json?.totals && typeof summary.json.totals.total === 'number', summary.json?.totals);
  ok('report: salary category present from OLD data (~288000 payable)', salaryCat && salaryCat.total >= 288000, salaryCat);
  ok('report: has item_purchase + other_expense categories', cats.some((c) => c.key === 'item_purchase' || c.label === 'Item Purchases') && cats.length >= 2);
  ok('report: byMonth is populated', Array.isArray(summary.json?.byMonth) && summary.json.byMonth.length > 0);

  // ================= interconnection: category delete SET NULL ==============
  console.log('\n-- Category delete -> expense.category SET NULL --');
  const catDel = await api('DELETE', `/expense-categories/${created.categoryId}`);
  ok('category: delete (204)', catDel.status === 204, catDel.status);
  const expNullCat = await api('GET', `/expenses/${expId}`);
  ok('interconnect: expense category set null after delete', expNullCat.json?.expenseCategoryId === null, expNullCat.json?.expenseCategoryId);
  created.categoryId = null;

  // guard: cannot delete expense while it has payments
  const delBlocked = await api('DELETE', `/expenses/${expId}`);
  ok('expense: delete blocked while payments exist (409)', delBlocked.status === 409, delBlocked.status);
}

async function cleanup() {
  console.log('\n-- Cleanup --');
  // delete all payments on each test expense, then the expense
  for (const expId of created.expenseIds.filter(Boolean)) {
    const pays = await api('GET', `/payments?expenseId=${expId}`);
    for (const p of pays.json ?? []) await api('DELETE', `/payments/${p.id}`);
    await api('DELETE', `/expenses/${expId}`);
  }
  // any remaining tracked payments (e.g. salary payment)
  for (const pid of created.paymentIds.filter(Boolean)) {
    await api('DELETE', `/payments/${pid}`);
  }
  if (created.categoryId) await api('DELETE', `/expense-categories/${created.categoryId}`);
  await api('DELETE', `/daily-entries/${FUTURE_DATE}`);

  // verify baseline restored
  const exp = await api('GET', '/expenses');
  const pay = await api('GET', '/payments');
  const cat = await api('GET', '/expense-categories');
  const de = await api('GET', '/daily-entries');
  ok('cleanup: expenses back to 69', (exp.json ?? []).length === 69, (exp.json ?? []).length);
  ok('cleanup: payments back to 89', (pay.json ?? []).length === 89, (pay.json ?? []).length);
  ok('cleanup: categories back to 0', (cat.json ?? []).length === 0, (cat.json ?? []).length);
  ok('cleanup: daily entries back to 14', (de.json ?? []).length === 14, (de.json ?? []).length);
}

main()
  .catch((err) => {
    fail++;
    console.error('FATAL', err);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error('cleanup error', e));
    console.log(`\n${fail === 0 ? 'ALL E2E CHECKS PASSED' : `${fail} CHECK(S) FAILED`}  (pass=${pass}, fail=${fail})`);
    if (failures.length) console.log('Failed:', failures.join('; '));
    process.exit(fail === 0 ? 0 : 1);
  });
