/* eslint-disable no-console */
/**
 * Relational-only smoke suite against empty (or wiped) local DB.
 * Exercises every live platform write path + verifies Postgres tables.
 *
 *   API on :3010 required. Usage: node scripts/smoke-relational.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');

const BASE = process.env.E2E_BASE ?? 'http://localhost:3010/api/v1';
const BRANCH_ID = 'a0000000-0000-4000-8000-000000000001';
const STAFF_ID = 'staff-azmain-fahim';
const DATE = '2099-06-15';
const MONTH = '2099-06';

const secret = readFileSync(new URL('../apps/api/.env', import.meta.url), 'utf8')
  .match(/^JWT_ACCESS_SECRET=(.+)$/m)[1]
  .trim();

const token = jwt.sign(
  {
    staffId: STAFF_ID,
    branchId: BRANCH_ID,
    terminalId: 'smoke-relational',
    roles: ['OWNER'],
    permissions: ['*'],
  },
  secret,
  { expiresIn: 1800 },
);

const results = [];
function record(area, op, ok, detail = '') {
  results.push({ area, op, ok, detail: String(detail).slice(0, 180) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${area}] ${op}${detail ? ` — ${detail}` : ''}`);
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

function dbCount(table) {
  const out = execSync(
    `PGPASSWORD=krunch psql -h 127.0.0.1 -p 5434 -U krunch -d krunch -tAc 'SELECT count(*) FROM "${table}"'`,
    { encoding: 'utf8' },
  ).trim();
  return Number(out);
}

function dbExists(relname) {
  const out = execSync(
    `PGPASSWORD=krunch psql -h 127.0.0.1 -p 5434 -U krunch -d krunch -tAc "SELECT to_regclass('public.\\"${relname}\\"') IS NOT NULL"`,
    { encoding: 'utf8' },
  ).trim();
  return out === 't';
}

async function main() {
  console.log(`\n=== Relational smoke against ${BASE} ===\n`);

  // 0. Infrastructure
  record('infra', 'JSON blob tables gone', !dbExists('BranchLedgerWorkspace') && !dbExists('BranchSalaryWorkspace') && !dbExists('BranchEmployeeDirectory'));
  record('infra', 'DailyEntry.expenseLines column gone', (() => {
    const c = execSync(
      `PGPASSWORD=krunch psql -h 127.0.0.1 -p 5434 -U krunch -d krunch -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='DailyEntry' AND column_name='expenseLines'"`,
      { encoding: 'utf8' },
    ).trim();
    return c === '0';
  })());

  // 1. Auth
  const me = await api('GET', '/staff/me');
  record('auth', 'READ /staff/me', me.status === 200 && me.json?.id === STAFF_ID, me.status);

  // 2. Empty reads
  const emptyLedger = await api('GET', '/ledger/workspace');
  record('ledger', 'READ empty workspace', emptyLedger.status === 200 && (emptyLedger.json?.suppliers?.length ?? -1) === 0, emptyLedger.status);

  const emptyEmp = await api('GET', '/employees/directory');
  record('employees', 'READ empty directory', emptyEmp.status === 200 && (emptyEmp.json?.employees?.length ?? -1) === 0);

  const emptyDe = await api('GET', '/daily-entries');
  record('daily', 'READ empty list', emptyDe.status === 200 && Array.isArray(emptyDe.json) && emptyDe.json.length === 0);

  const emptyExp = await api('GET', '/expenses');
  record('expenses', 'READ empty list', emptyExp.status === 200 && Array.isArray(emptyExp.json) && emptyExp.json.length === 0);

  // 3. Employees CRUD (directory replace)
  const empId = 'smoke-emp-1';
  const empPut = await api('PUT', '/employees/directory', {
    employees: [
      {
        id: empId,
        name: 'Smoke Worker',
        role: 'Cook',
        phone: '01700000000',
        email: '',
        defaultBasicSalary: 15000,
        serviceChargePct: 10,
        active: true,
        notes: '',
      },
    ],
  });
  record('employees', 'CREATE via PUT directory', empPut.status === 200 && empPut.json?.employees?.length === 1, empPut.status);
  record('employees', 'DB Employee row', dbCount('Employee') === 1, dbCount('Employee'));

  const empUpd = await api('PUT', '/employees/directory', {
    employees: [
      {
        id: empId,
        name: 'Smoke Worker Updated',
        role: 'Chef',
        phone: '01700000000',
        email: '',
        defaultBasicSalary: 16000,
        serviceChargePct: 10,
        active: true,
        notes: 'note',
      },
    ],
  });
  record('employees', 'UPDATE name/salary', empUpd.json?.employees?.[0]?.name === 'Smoke Worker Updated' && approx(empUpd.json.employees[0].defaultBasicSalary, 16000));

  // 4. Ledger: supplier + invoice + purchase
  const supplierId = 'smoke-sup-1';
  const invoiceId = 'smoke-inv-1';
  const poId = 'smoke-po-1';
  const ledgerPut = await api('PUT', '/ledger/workspace', {
    suppliers: [
      {
        id: supplierId,
        name: 'Smoke Supplier',
        bookPurpose: 'meat',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
        notes: '',
      },
    ],
    ledger: [
      {
        id: invoiceId,
        supplierId,
        date: DATE,
        type: 'invoice',
        ref: 'INV-SMOKE',
        memo: 'smoke bill',
        amountCents: 50000,
        items: [{ id: 'it1', name: 'Beef', qty: 2, unit: 'kg', rateCents: 25000, totalCents: 50000 }],
      },
    ],
    moves: [
      {
        kind: 'purchase',
        id: poId,
        ref: 'PO-SMOKE',
        supplierId,
        date: DATE,
        status: 'received',
        amountCents: 50000,
        note: '',
        items: [{ id: 'pit1', name: 'Beef', qty: 2, unit: 'kg', rateCents: 25000, totalCents: 50000 }],
      },
    ],
  });
  record('ledger', 'CREATE supplier+invoice+PO', ledgerPut.status === 200 && ledgerPut.json?.suppliers?.length === 1, ledgerPut.status);
  record('ledger', 'DB Supplier', dbCount('Supplier') === 1, dbCount('Supplier'));
  record('ledger', 'DB LedgerEntry', dbCount('LedgerEntry') === 1, dbCount('LedgerEntry'));
  record('ledger', 'DB PurchaseOrder', dbCount('PurchaseOrder') === 1, dbCount('PurchaseOrder'));
  record('ledger', 'DB LedgerEntryItem', dbCount('LedgerEntryItem') === 1, dbCount('LedgerEntryItem'));

  const ledgerRead = await api('GET', '/ledger/workspace');
  record('ledger', 'READ back supplier name', ledgerRead.json?.suppliers?.[0]?.name === 'Smoke Supplier');
  record('ledger', 'READ back invoice amount', ledgerRead.json?.ledger?.[0]?.amountCents === 50000);

  // Update supplier name (DTO allows only suppliers/moves/ledger — no updatedAt)
  const ledgerUpd = await api('PUT', '/ledger/workspace', {
    suppliers: [{ ...ledgerRead.json.suppliers[0], name: 'Smoke Supplier Renamed' }],
    ledger: ledgerRead.json.ledger,
    moves: ledgerRead.json.moves,
  });
  record('ledger', 'UPDATE supplier rename', ledgerUpd.json?.suppliers?.[0]?.name === 'Smoke Supplier Renamed', ledgerUpd.status);

  // 5. Payroll workspace
  const lineId = 'smoke-sal-line-1';
  const payLegacyId = 'smoke-sal-pay-1';
  const payrollPut = await api('PUT', '/payroll/workspace', {
    selectedMonthKey: MONTH,
    months: {
      [MONTH]: {
        periodLabel: MONTH,
        rows: [
          {
            id: lineId,
            employeeId: empId,
            name: 'Smoke Worker Updated',
            basic: 16000,
            pct: 10,
            serviceCharge: 1600,
            overtime: 0,
            eidBonus: 0,
            fines: 0,
            payments: [{ id: payLegacyId, amount: 5000, date: DATE, note: 'advance' }],
          },
        ],
        updatedAt: new Date().toISOString(),
      },
    },
  });
  record('payroll', 'CREATE month+line+payment', payrollPut.status === 200 && Object.keys(payrollPut.json?.months ?? {}).includes(MONTH), payrollPut.status);
  record('payroll', 'DB SalaryMonth', dbCount('SalaryMonth') >= 1, dbCount('SalaryMonth'));
  record('payroll', 'DB SalaryLine', dbCount('SalaryLine') >= 1, dbCount('SalaryLine'));
  record('payroll', 'DB SalaryPayment', dbCount('SalaryPayment') >= 1, dbCount('SalaryPayment'));

  const payrollRead = await api('GET', '/payroll/workspace');
  const row = payrollRead.json?.months?.[MONTH]?.rows?.[0];
  record('payroll', 'READ line basic', approx(row?.basic, 16000), row?.basic);
  record('payroll', 'READ legacy payment', approx(row?.payments?.[0]?.amount, 5000));

  // Update overtime
  const payrollUpd = await api('PUT', '/payroll/workspace', {
    selectedMonthKey: MONTH,
    months: {
      [MONTH]: {
        ...payrollRead.json.months[MONTH],
        rows: [{ ...row, overtime: 200 }],
      },
    },
  });
  record('payroll', 'UPDATE overtime', approx(payrollUpd.json?.months?.[MONTH]?.rows?.[0]?.overtime, 200));

  // 6. Daily entry + expense lines
  const dePut = await api('PUT', `/daily-entries/${DATE}`, {
    date: DATE,
    openingBalance: 1000,
    cashSale: 800,
    bankSale: 200,
    bkashSale: 0,
    nagadSale: 0,
    pathaoSale: 0,
    foodiSale: 0,
    foodpandaSale: 0,
    expenses: 350,
    bankWithdrawn: 0,
    cashIn: 0,
    remainingBalance: 1650,
    enteredBy: 'Smoke Tester',
    expenseLines: [
      {
        kind: 'regular',
        amount: 150,
        label: 'Gas',
        note: 'smoke',
        lineId: 'smoke-de-line-1',
      },
      {
        kind: 'vendor',
        amount: 200,
        label: 'Paid supplier',
        vendor: 'Smoke Supplier Renamed',
        ledgerEntryId: invoiceId,
        lineId: 'smoke-de-line-2',
      },
    ],
  });
  record('daily', 'CREATE entry+lines', (dePut.status === 200 || dePut.status === 201) && (dePut.json?.expenseLines?.length ?? 0) === 2, `${dePut.status} lines=${dePut.json?.expenseLines?.length}`);
  record('daily', 'DB DailyEntry', dbCount('DailyEntry') === 1, dbCount('DailyEntry'));
  record('daily', 'DB DailyEntryExpenseLine', dbCount('DailyEntryExpenseLine') === 2, dbCount('DailyEntryExpenseLine'));

  const deGet = await api('GET', `/daily-entries/${DATE}`);
  record('daily', 'READ entry sales', approx(deGet.json?.cashSale, 800) && approx(deGet.json?.bankSale, 200));
  record('daily', 'READ expense lines from relational', (deGet.json?.expenseLines?.length ?? 0) === 2);

  const deWriteBody = {
    date: DATE,
    openingBalance: deGet.json.openingBalance,
    cashSale: 900,
    bankSale: deGet.json.bankSale,
    bkashSale: deGet.json.bkashSale,
    nagadSale: deGet.json.nagadSale ?? 0,
    pathaoSale: deGet.json.pathaoSale,
    foodiSale: deGet.json.foodiSale,
    foodpandaSale: deGet.json.foodpandaSale,
    expenses: 350,
    bankWithdrawn: deGet.json.bankWithdrawn ?? 0,
    cashIn: deGet.json.cashIn ?? 0,
    remainingBalance: 1750,
    enteredBy: 'Smoke Tester',
    expenseLines: deGet.json.expenseLines,
  };
  const deUpd = await api('PUT', `/daily-entries/${DATE}`, deWriteBody);
  record('daily', 'UPDATE cashSale', approx(deUpd.json?.cashSale, 900), deUpd.status);

  const lock = await api('POST', `/daily-entries/${DATE}/lock`);
  record('daily', 'LOCK', lock.status === 200 || lock.status === 201, lock.status);
  const lockedWrite = await api('PUT', `/daily-entries/${DATE}`, { ...deWriteBody, cashSale: 1 });
  record('daily', 'WRITE blocked while locked', lockedWrite.status === 409, lockedWrite.status);
  const unlock = await api('POST', `/daily-entries/${DATE}/unlock`);
  record('daily', 'UNLOCK', unlock.status === 200 || unlock.status === 201, unlock.status);

  // 7. Expense categories
  const cat = await api('POST', '/expense-categories', { name: 'Smoke Cat' });
  const catId = cat.json?.id;
  record('categories', 'CREATE', !!catId, cat.status);
  const catList = await api('GET', '/expense-categories');
  record('categories', 'READ list', (catList.json ?? []).some((c) => c.id === catId));
  const catUpd = await api('PUT', `/expense-categories/${catId}`, { name: 'Smoke Cat 2' });
  record('categories', 'UPDATE', catUpd.json?.name === 'Smoke Cat 2');
  record('categories', 'DB ExpenseCategory', dbCount('ExpenseCategory') === 1);

  // 8. Other expense + payments
  const exp = await api('POST', '/expenses', {
    kind: 'other_expense',
    date: DATE,
    description: 'Smoke other',
    expenseCategoryId: catId,
    total: 1000,
    items: [{ name: 'thing', qty: 1, unit: 'pcs', rate: 1000, total: 1000 }],
  });
  const expId = exp.json?.id;
  record('expenses', 'CREATE other_expense', !!expId && exp.json?.status === 'unpaid', exp.status);
  record('expenses', 'DB Expense', dbCount('Expense') >= 1);

  const pay1 = await api('POST', '/payments', {
    expenseId: expId,
    date: DATE,
    amount: 400,
    method: 'cash',
  });
  record('payments', 'CREATE partial', !!pay1.json?.id && pay1.status < 300, pay1.status);
  const expAfter = await api('GET', `/expenses/${expId}`);
  record('payments', 'READ derives partially_paid', expAfter.json?.status === 'partially_paid' && approx(expAfter.json?.paid, 400), expAfter.json?.status);

  const expPut = await api('PUT', `/expenses/${expId}`, {
    description: 'Smoke other updated',
    total: 1000,
    items: [{ name: 'thing', qty: 1, unit: 'pcs', rate: 1000, total: 1000 }],
  });
  record('expenses', 'UPDATE description', expPut.json?.description === 'Smoke other updated', expPut.status);

  // 9. Item purchase expense (needs supplier)
  const ip = await api('POST', '/expenses', {
    kind: 'item_purchase',
    date: DATE,
    description: 'Smoke purchase bill',
    supplierId,
    total: 500,
    items: [{ name: 'Beef', qty: 1, unit: 'kg', rate: 500, total: 500 }],
  });
  record('item_purchases', 'CREATE expense linked supplier', !!ip.json?.id && ip.json?.supplierId === supplierId, ip.status);

  // 10. Quick expense
  const quick = await api('POST', '/expenses/quick', {
    date: DATE,
    description: 'Smoke quick',
    total: 250,
    method: 'cash',
    expenseCategoryId: catId,
  });
  record('quick_expense', 'CREATE paid in one step', quick.json?.status === 'paid' && approx(quick.json?.due, 0), quick.status);

  // 11. Reports
  const summary = await api('GET', `/expense-reports/summary?from=2099-01-01&to=2099-12-31`);
  record('reports', 'READ summary totals', summary.status === 200 && typeof summary.json?.totals?.total === 'number', summary.status);
  record('reports', 'READ byCategory non-empty', (summary.json?.byCategory?.length ?? 0) > 0);

  // 12. Staff / users
  const staffList = await api('GET', '/staff');
  const staffRows = staffList.json?.staff ?? staffList.json;
  record(
    'users_access',
    'READ staff list',
    staffList.status === 200 && Array.isArray(staffRows) && staffRows.length >= 1,
    `status=${staffList.status} n=${staffRows?.length}`,
  );

  // 13. Deletes (order-sensitive)
  const delBlocked = await api('DELETE', `/expenses/${expId}`);
  record('expenses', 'DELETE blocked with payments', delBlocked.status === 409, delBlocked.status);

  // Manual payments deletable; auto (source=daily) payments clear when sources delete.
  for (const p of expAfter.json?.payments ?? []) {
    const d = await api('DELETE', `/payments/${p.id}`);
    record('payments', 'DELETE manual partial', d.status === 200 || d.status === 204, d.status);
  }
  if (quick.json?.id) {
    const qp = await api('GET', `/payments?expenseId=${quick.json.id}`);
    for (const p of qp.json ?? []) {
      const d = await api('DELETE', `/payments/${p.id}`);
      record('payments', 'DELETE quick payment', d.status === 200 || d.status === 204, d.status);
    }
  }

  const delExp = await api('DELETE', `/expenses/${expId}`);
  record('expenses', 'DELETE after payments cleared', delExp.status === 200 || delExp.status === 204, delExp.status);
  if (ip.json?.id) {
    const dip = await api('DELETE', `/expenses/${ip.json.id}`);
    record('item_purchases', 'DELETE expense', dip.status === 200 || dip.status === 204 || dip.status === 409, dip.status);
  }
  if (quick.json?.id) {
    const dq = await api('DELETE', `/expenses/${quick.json.id}`);
    record('quick_expense', 'DELETE expense', dq.status === 200 || dq.status === 204, dq.status);
  }

  const catDel = await api('DELETE', `/expense-categories/${catId}`);
  record('categories', 'DELETE', catDel.status === 200 || catDel.status === 204, catDel.status);

  const deDel = await api('DELETE', `/daily-entries/${DATE}`);
  record('daily', 'DELETE entry', deDel.status === 200 || deDel.status === 204, deDel.status);
  record('daily', 'DB DailyEntry after delete', dbCount('DailyEntry') === 0, dbCount('DailyEntry'));

  const clearLed = await api('PUT', '/ledger/workspace', { suppliers: [], ledger: [], moves: [] });
  record('ledger', 'DELETE all via empty PUT', clearLed.status === 200 && dbCount('Supplier') === 0, `suppliers=${dbCount('Supplier')}`);
  record('payments', 'Auto payments cleared with sources', dbCount('Payment') === 0, `db Payment=${dbCount('Payment')}`);

  const clearPay = await api('PUT', '/payroll/workspace', {
    selectedMonthKey: MONTH,
    months: {
      [MONTH]: {
        periodLabel: MONTH,
        rows: [{ id: 'keep-empty', name: '', basic: 0, pct: null, serviceCharge: 0, overtime: 0, eidBonus: 0, fines: 0, payments: [] }],
        updatedAt: new Date().toISOString(),
      },
    },
  });
  record('payroll', 'UPDATE clear named lines', clearPay.status === 200, clearPay.status);

  const clearEmp = await api('PUT', '/employees/directory', { employees: [] });
  record('employees', 'DELETE all via empty PUT', clearEmp.status === 200 && dbCount('Employee') === 0, `employees=${dbCount('Employee')}`);

  record('infra', 'Final Expense=0', dbCount('Expense') === 0, dbCount('Expense'));
  record('infra', 'Final Payment=0', dbCount('Payment') === 0, dbCount('Payment'));
  record('infra', 'Final Supplier=0', dbCount('Supplier') === 0, dbCount('Supplier'));
  record('infra', 'Staff retained', dbCount('Staff') === 1, dbCount('Staff'));

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n=== ${fail === 0 ? 'ALL PASSED' : 'FAILURES'}  pass=${pass} fail=${fail} ===\n`);
  if (fail) {
    for (const r of results.filter((x) => !x.ok)) console.log(`  - [${r.area}] ${r.op}: ${r.detail}`);
  }

  // Write machine-readable results for canvas
  const outPath = new URL('../.smoke-relational-results.json', import.meta.url);
  require('fs').writeFileSync(outPath, JSON.stringify({ pass, fail, results, at: new Date().toISOString() }, null, 2));

  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
