# Krunch POS — Project Context

Read this first. It explains what the app is, how the code is laid out, the
current state of the database re-architecture, and the conventions/gotchas an
agent must respect before making changes.

> Status marker: **Shadow-deploy strategy (relational-only app).** This codebase
> no longer dual-writes legacy JSON workspace blobs. Relational tables are the
> only store. Production v1 (JSON-primary, current domain) stays UNTOUCHED and
> runs in parallel. Next: stand up a separate DB + subdomain for this app, import
> a mapped/mutated copy of prod data for validation, then cut over when confident.
> See "Database re-architecture" below.

---

## 1. What this app is

Krunch POS is a **restaurant back-office web app** for a single branch
(Steak & Marrow). It is not a point-of-sale ordering system anymore — the POS
ordering side was removed. Current features (the terminal sidebar):

- **Daily Entry** — end-of-day sales + expense sheet per calendar day.
- **Cashbooks / Ledger** — suppliers, bills & payments.
- **Items purchased / Purchases** — purchase orders (stock moves).
- **Employee Salaries / Payroll** — monthly salary registers + payments.
- **Employee Management** — staff roster.
- **Reports / Analytics** — read-only rollups over the above.

Auth is branch + PIN / email login; roles/permissions via RBAC.

---

## 2. Repo layout (monorepo, npm workspaces + turbo)

Tracked apps/packages only — everything else is local artifact:

- `apps/api` — **NestJS** backend. Prisma + Postgres. REST under `/api/v1`.
  - Modules (all active, wired in `src/app.module.ts`): `auth`, `rbac`,
    `audit`, `staff`, `daily-entries`, `ledger`, `payroll`, `employees`,
    `storage`, `health`. There is **no** dead module code — do not expect
    orders/menu/inventory/kitchen/payments; they were removed.
- `apps/terminal` — **React + Vite** web client (the actual website).
  - Single route `/pos`; sidebar navigation is driven by leaf IDs in state,
    not URLs (`src/data/posNav.tsx`, `src/posSectionStorage.ts`).
  - Feature stores in `src/features/{ledger,payroll,employees,daily-entry}`.
- `packages/database-schema` — **Prisma** schema + migrations + seed.
  - `prisma/schema.prisma` is the single source of truth for the DB.
- `apps/admin` — **NOT a real app.** 0 files tracked in git; only stale local
  `.next`/`node_modules`. Ignore it (safe to delete locally).
- `deploy/` — production Docker Compose, Caddy config, env examples.
- `scripts/` — deploy + DB helper scripts (see below).

---

## 3. Data storage — the important part

### 3a. Legacy design (prod v1 only — not used by this app)

Prod v1 still stores most business data as **JSON blobs**, one row per branch:

- `BranchLedgerWorkspace` — `{ suppliers[], moves[], ledger[] }`
- `BranchSalaryWorkspace` — `{ bundle: { months{ rows[]{ payments[] } } } }`
- `BranchEmployeeDirectory` — `{ employees[] }`
- `DailyEntry.expenseLines` — JSON array on each daily entry.

The terminal loads the whole blob, edits it in memory, and PUTs the whole thing
back (`GET/PUT /ledger/workspace`, `/payroll/workspace`, `/employees/directory`).
This is last-write-wins and not queryable — the reason for the re-architecture.

### 3b. New relational design (additive, Phase 1 done on local)

11 new tables replace those blobs, added ALONGSIDE the JSON (nothing dropped):

```
Supplier ──< LedgerEntry ──< LedgerEntryItem
         └─< PurchaseOrder ──< PurchaseOrderItem
Employee ──< SalaryLine >── SalaryMonth ──< (SalaryLine) ──< SalaryPayment
DailyEntry ──< DailyEntryExpenseLine ──< DailyEntryExpenseItem
                 └─ FK → LedgerEntry / PurchaseOrder / Employee (nullable)
```

Conventions baked into the schema (respect these):

- **Money = integer minor units.** Every money column is `*Minor` (an integer
  in the branch's currency minor unit). **No floats, no per-currency
  assumptions.** `Branch.currency` holds the ISO 4217 code (default `BDT`).
  - Legacy JSON: ledger/purchases were already minor units; salaries &
    daily-entry expenses were whole-currency (×100 on backfill).
- **Every table has `branchId`** (+ FK) for tenant scoping / future RLS, plus
  `createdAt` / `updatedAt`.
- **Enums** for fixed sets: `LedgerEntryType`, `PurchaseStatus`, `ExpenseLineKind`.
- **Existing string IDs are reused as primary keys** so cross-links keep
  resolving (e.g. `lg-0149`, `v-...`, employee UUIDs).
- One soft link kept as a plain string: `DailyEntryExpenseLine.salaryPaymentId`
  (~60% don't resolve to a real payment, so it is NOT a FK).
- Deferred (no data yet): purchase returns, ledger attachments.

Migration: `packages/database-schema/prisma/migrations/20260717000000_add_relational_domains`.
Backfill: `scripts/backfill-relational.mjs` (idempotent; clears + re-copies).

### 3c. Where we are / what's next

- [x] Relational schema + migration created, applied to LOCAL copy.
- [x] Backfilled from JSON and verified (row counts + money totals + link
      integrity all match the JSON source exactly).
- [x] **Stage D1 (done, local):** the API now dual-writes. Feature services
      still save the JSON columns first (unchanged behaviour), then call
      `RelationalSyncService` BEST-EFFORT to mirror the write into the
      relational tables. A sync failure only logs a warning — it never fails the
      user's save. Reads are still served from JSON, so the website is
      unaffected. Verified with `apps/api/src/scripts/smoke-sync.ts` (re-syncing
      all domains produced zero row-count drift).
      - `RelationalSyncService` (`modules/relational-sync/`) is `@Global`.
      - Wired into ledger, payroll, employees, and daily-entries `upsert`.
      - Daily-entry deletes need no sync (FK `onDelete: Cascade` handles it).
- [x] **Stage D2a (done, local):** `employees` and `payroll` GET endpoints now
      assemble responses FROM the relational tables (`*Minor` ÷ 100 for whole
      currency), with a try/catch fallback to the JSON blob if the projection is
      empty or assembly fails. Verified byte-for-byte on money totals + counts
      via `apps/api/src/scripts/verify-d2.ts`.
      - Schema hardened: `SalaryLine.employeeId` is now nullable with
        `onDelete: SetNull` (migration `20260717010000_salaryline_employee_nullable`),
        so unlinked salary rows and removed employees never break the projection.
      - `selectedMonthKey` is not stored; it is derived as the latest `monthKey`
        on read (the frontend re-coerces it anyway).
- [x] **Stage D2b (done, local):** the relational model is now LOSSLESS and
      order-preserving, and ALL reads come from relational.
      - New tables/columns (migrations `20260718000000_ledger_attachments_returns_sortindex`
        and `20260718001000_expense_line_note_receipts`):
        - `LedgerEntryAttachment` (ledger receipts).
        - `PurchaseReturn` + `ReturnLine` (moves[] where `kind = return`).
        - `sortIndex` on every list-member table (suppliers, ledger, items,
          purchases, returns, employees, salary rows/payments, expense lines/items)
          so JSON array order is reconstructed exactly. `moves[]` uses a shared
          index across purchases + returns so the mixed array re-merges in order.
        - `DailyEntryExpenseLine` gained `note`, `ledgerEmployeeLineKind`,
          `receiptDataUrls` (the last 3 JSON fields it was dropping).
      - `RelationalSyncService` updated to populate all of the above.
      - `ledger` and `daily-entries` GET now assemble from relational (JSON
        fallback kept). Parity proven by `apps/api/src/scripts/verify-d2.ts`:
        supplier/entry/move ORDER match, amount + item totals match, and daily
        expense-line count/amount/order match exactly.
- [x] **Write cutover (done, local):** relational is now the AUTHORITATIVE store.
      Each feature service (`ledger`, `employees`, `payroll`, `daily-entries`)
      writes the JSON blob AND the relational projection inside ONE
      `prisma.$transaction` — both commit or roll back together, so a relational
      failure now fails the save (no silent drift). `RelationalSyncService.sync*`
      methods take an optional `outerTx` and reuse it via `withTx`. The JSON
      columns are still written as a live backup/fallback during the safety
      window. Verified by `apps/api/src/scripts/verify-write-cutover.ts`
      (re-saving every workspace caused zero row drift).
- [x] **Expense payables model — P1 & P2 (done, local).** New epic on top of the
      cutover; full plan + ERD in `docs/expense-payables-plan.md`.
      - P1 schema (migration `20260718002000_expense_payables_model`): `Expense`,
        `ExpenseItem`, `Payment` (settles an Expense OR a SalaryLine — CHECK
        enforced), `ExpenseReturn`, `ExpenseAttachment`, `ExpenseCategory`; enums
        `ExpenseKind`, `PaymentMethod` (generic: cash/card/bank_transfer/
        mobile_money/cheque/other). Additive — nothing dropped.
      - P2 backfill `scripts/backfill-expenses.mjs` + verify `scripts/verify-expenses.mjs`.
        POs→item-purchase expenses; vendor/staff/regular lines→payments; methods
        parsed from the cashbook memo. **Decision:** the daily balance still
        subtracts ALL payments (any method) — method is informational, so no
        historical balance changes. Money gate passes: 0 days where Σ payments ≠
        the old `DailyEntry.expenses`.
- [x] **Expense payables model — P3 backend (done, local).** Four new NestJS
      modules under `apps/api/src/modules/`, all guarded by `JwtAuthGuard +
      RbacGuard`, branch from the token, whole-currency in JSON (×100 on write),
      perms reuse `daily_entry:read/write` (no reseed needed):
      - `expense-categories` — CRUD (`GET/POST /expense-categories`,
        `PUT/DELETE /expense-categories/:id`). Per-branch, unique name; delete is
        SET NULL on expenses.
      - `expenses` — `GET /expenses` (filters kind/category/supplier/status/
        from/to; derives paid/due/status), `GET /expenses/:id` (items, payments,
        returns, attachments), `POST/PUT/DELETE`, plus `POST /expenses/quick`
        (create + one payment in a tx). Items replaced on update. Delete blocked
        while payments exist.
      - `payments` — CRUD (`GET/POST /payments`, `PUT/DELETE /payments/:id`).
        Targets exactly one of expenseId | salaryLineId (validated + CHECK).
      - `expense-reports` — `GET /expense-reports/summary?from&to`: totals
        (total/paid/due), byCategory (incl. custom labels + salary), byMonth.
        Salary payable = basic+SC+OT+bonus+fines, paid via unified `Payment`.
      - Shared helpers in `modules/expenses/expense.util.ts` (toWhole/toMinor,
        derivePaidDue, PAYMENT_METHODS, EXPENSE_KINDS). Wired in `app.module.ts`;
        typecheck + boot verified (all routes map, DI clean).
      - NOTE: these are NEW read/write endpoints for the payables UI. The legacy
        JSON workspace endpoints (ledger/payroll/employees/daily-entries) are
        untouched, so the current site keeps working during the transition.
      - NEXT: P4 frontend (expenses list, expense detail w/ payments, Quick
        Expense, payables dashboard, salary method/txn, daily-entry change).
      - E2E: `scripts/e2e-test.mjs` drives the running API over HTTP (mints an
        OWNER JWT from `JWT_ACCESS_SECRET`) — 42 checks covering old-data reads,
        daily-entry dual-write round-trip, category/expense/payment/quick CRUD,
        interconnections (payment→paid/due/status→reports, category delete→SET
        NULL), validation, and self-cleanup back to baseline. Run the API on a
        free port (e.g. `PORT=3010 npm run dev -w @universal-pos/api`) then
        `node scripts/e2e-test.mjs`. Parity gates: `apps/api/src/scripts/
        verify-d2.ts`, `verify-write-cutover.ts`, `scripts/verify-expenses.mjs`.
- [x] **Expense payables — P4 frontend (done, local, terminal app).** New
      "Payables" nav branch → four screens, mirroring the daily-entry REST
      pattern (`apiFetch` + per-resource API, `useSyncExternalStore`-free simple
      hooks), Tailwind `--pos-*` tokens, whole-currency (`৳`) money:
      - Feature layer `apps/terminal/src/features/payables/` (`types.ts`,
        `labels.ts`, `payablesApi.ts`, `index.ts`) — expenses/payments/
        categories/reports + `listSuppliers()` (reads `/ledger/workspace`).
      - Views in `components/pos/`: `PayablesModuleView` (leaf switch,
        `PAYABLES_LEAF_IDS`), `PayablesDashboardView` (Total/Paid/Due + by
        category/month), `ExpensesListView` (filters + totals + create drawer +
        detail drawer w/ items, payments add/delete, expense delete),
        `QuickExpenseView`, `ExpenseCategoriesView`. Shared `payablesUi.ts`.
      - Nav in `data/posNav.tsx` (leaves `pay-dashboard|pay-list|pay-quick|
        pay-categories`), wired in `pages/PosTerminalPage.tsx`.
      - Verified: `tsc --noEmit` + eslint clean + `vite build` OK.
      - REMAINING (p4-salary, deferred): add payment method + transaction id to
        the payroll payout modal (`StaffPayoutModal.tsx`) AND route salary
        payouts into the unified `Payment` table so live salary payments show as
        "paid" in the payables dashboard (today the dashboard's salary "paid"
        comes only from backfilled `Payment` rows via `SalaryLine.unifiedPayments`;
        live payroll writes still only create legacy `SalaryPayment`). This
        needs payroll write-path + relational-sync plumbing (and method/txn
        columns), so it's a focused follow-up, not pure frontend.
- [x] **Legacy JSON workspace blobs dropped (this app):** stopped writing/reading
      `BranchLedgerWorkspace` / `BranchSalaryWorkspace` / `BranchEmployeeDirectory`
      and `DailyEntry.expenseLines`. Migration
      `20260723000000_drop_legacy_json_workspaces`. API workspace endpoints still
      accept/return the same JSON *shapes* over HTTP; persistence is relational only.
- [x] **Shadow deploy live:** `https://v2-steakandmarrow.inventivelab.bd`
      — separate VPS path `/opt/krunch-pos-v2`, compose `krunch-pos-v2`, API
      `:3002`, Postgres `:5435` / DB `krunch_v2`, Caddy `krunch-v2.caddy`.
      Deploy via `./scripts/deploy-v2-to-vps.sh` + `deploy/.env.v2` (never
      touches `/opt/krunch-pos`). Relational-only schema (no JSON blobs).
- [x] **Import mapped prod data** into `krunch_v2` for validation (re-synced
      2026-07-27). Local: restore prod dump → `backfill-relational.mjs` +
      `backfill-expenses.mjs` → dump relational rows → load into remote
      `krunch_v2` only. Counts: 22 suppliers, 405 ledger, 201 POs, ~203 expenses,
      24 daily entries, 17 employees. Login uses prod password (`Welcome123!`).
      Prod v1 still JSON-only (no `Supplier` table; `BranchLedgerWorkspace`
      intact).
- [x] **V1↔V2 payable parity (2026-07-27):** bill paid/due now comes from
      cashbook `LedgerEntry` payments allocated FIFO onto purchase bills (not
      daily vendor lines). Root cause of false dues: 2026-07-19 had ×15
      duplicate POs while daily only logged 1 vendor cash-out. After fix,
      per-supplier due matches v1 account due; real open due ≈ ৳3,600.92.
      Re-check anytime: `scripts/verify-v1-v2-parity.mjs` (needs
      `V1_DATABASE_URL` + `V2_DATABASE_URL`). Kind remap:
      `scripts/remap-supplier-expense-kinds.mjs`.
- [x] **Salary payment parity (2026-07-28):** unified `Payment` rows for
      salaries now mirror `SalaryPayment` (the salary register) 1:1 instead of
      being re-derived from daily staff lines — daily-line dates mis-attributed
      which salary month a payout settled (July cash paying June salary), so
      Reports/All Expenses disagreed with the Employee Salaries page. V2 data
      re-synced from a fresh prod dump the same day (dropped a stale `mahdi`
      row prod had since deleted).
- [ ] **Cutover (later):** when mapping looks good, migrate a recent window (e.g.
      last N days), switch traffic to this domain/DB, retire prod v1.

### 3d. Table inventory & flags (updated 2026-07-23)

Integrity verified: 0 orphan FKs, `Payment_one_target_chk` present. Categorised:

- **Live relational (source of truth):** `Branch`, `DailyEntry`,
  `DailyEntryExpenseLine`, `DailyEntryExpenseItem`, `Supplier`, `LedgerEntry`,
  `LedgerEntryItem`, `PurchaseOrder`, `PurchaseOrderItem`, `Employee`,
  `SalaryMonth`, `SalaryLine`, `SalaryPayment`, `Expense`, `ExpenseItem`,
  `Payment`.
- **Removed from this app (prod v1 DB may still have them — do not touch prod):**
  `BranchLedgerWorkspace`, `BranchSalaryWorkspace`, `BranchEmployeeDirectory`,
  `DailyEntry.expenseLines`. Import/mapping scripts may still read these from a
  *prod dump* into the shadow relational DB.
- **Wired but empty (KEEP — features not exercised yet, not dead):**
  `ExpenseCategory`, `ExpenseReturn`, `ExpenseAttachment`, `PurchaseReturn`,
  `ReturnLine`, `LedgerEntryAttachment`.
- **Core / infra (KEEP):** `Staff`, `StaffRole`, `Role`, `TempPermission`
  (used by staff elevate), `AuditLog`, `MediaAsset` (storage), `_prisma_migrations`.
- **FLAGGED AS DEAD — no code references anywhere (candidate for removal):**
  `Shift` — leftover from the removed classic-POS ordering side. Not read or
  written by API or terminal. Left in place per "flag, don't remove"; safe to
  drop in a future cleanup migration.

### 3e. "Amount paid" capture — current state (design open question)

- Daily entry expense lines have 4 kinds: `purchase` (the bill — adds ৳0 to the
  day's cash), `vendor` (cash paid to a supplier), `regular` (cash expense),
  `staff` (payout). So "how much I paid for a purchase" today = a separate
  `vendor` line paired with the `purchase` bill line.
- New payables: `Expense` is the bill/total; `Payment` rows settle it. Quick
  Expense creates expense + payment in one step (has "amount paid now" + method).
  The full **New Expense / item-purchase create drawer does NOT yet have an
  inline "paid now" field** — you create the bill, then add a payment in the
  detail drawer.
- **Not yet wired:** a payables `Payment` (even cash) does NOT post to the
  DailyEntry cash register. Payables and the daily register are currently
  parallel. Deciding how/whether cash payments flow into the daily register is
  an open design decision (see chat 2026-07-19).

### 3f. Done 2026-07-19 (S1 + inline paid + status pills)

- **S1 shipped:** `POST /expenses` (New Expense) now accepts an optional initial
  payment (`paidAmount` + `method` + `transactionId`) and records it atomically.
  UI: New Expense drawer has a "Paid now / method / txn" block (defaults unpaid).
  Quick Expense already did this.
- **Daily Entry item-purchase inline "Paid now / Due":** each purchase vendor
  card shows a Paid-now input + live Due. It drives the existing auto-synced
  vendor payment line (`syncVendorExpensesFromPurchases`); editing detaches the
  synced line via `patchLine` (adds to `dismissedPurchaseExpenseVendorsRef`,
  clears `syncedFromPurchaseVendor`) so a partial amount sticks. Default is the
  full total (existing behavior); lower it to create a Due. Cash math unchanged.
- **Cashbook status pill:** supplier list shows Owing / Advance / Settled from
  `supplierBalance` (account-level, cents). Helpers `supplierBalanceLabel` /
  `supplierBalancePill` in `LedgerModuleView.tsx`.
- **Salaries** already show per-row due + Paid/Due/Unpaid totals (unchanged).
- Reusable status helpers: `expenseStatusPill` / `EXPENSE_STATUS_LABEL` in
  `features/payables/labels.ts`; money `formatMoney` in `components/pos/payablesUi.ts`.

### 3g. S2/S3 findings (see docs/daily-payables-integration-plan.md)

- Saving a Daily Entry does NOT create payables `Payment` rows today (relational
  sync writes `SalaryPayment`, not `Payment`). S2 therefore needs a write-side
  change so daily-entry cash-outs create `Payment` rows.
- Historical outflow is 84% non-cash (card, memo-derived), so a cash-only daily
  register will diverge from historical `expenses` — freeze closed days, apply
  cash-only forward. Owner decisions pending before building S2 (see plan doc).

### 3j. S3 (post-integrity UI) — 2026-07-19

- **S3a DONE + verified:** derived payables rows are read-only in the Payables
  module. API exposes `source` + `editable` on expense DTOs; `expenses.update/
  remove` and `payments.create/update/remove` reject non-`manual` rows with 409
  (server-authoritative model A). Frontend shows an "Auto" badge in the list and a
  read-only banner + hidden edit/delete/add-payment in the detail drawer.
  Verified via API: update/delete/add-payment on a derived bill all 409.
- **S3c DONE + verified (date cutover):** `dailyCashMethod(date, memo)` in
  RelationalSyncService — an explicit method memo always wins; otherwise daily
  cash-outs on/after `DAILY_CASH_DEFAULT_FROM` (env, default `2026-07-19`) default
  to `cash`, earlier ones stay `other` so frozen history isn't relabeled.
  **P5 action:** set `DAILY_CASH_DEFAULT_FROM` to the real production go-live date.
  Verified boundary: 2026-07-18 → other, 2026-07-20 → cash; parity green.
- **S3b DONE + verified (reuse derived):** each item-purchase bill maps 1:1 to a
  derived Expense `exp_po_<poId>`. `LedgerModuleView` fetches
  `listExpenses({kind:'item_purchase'})` once and shows a Paid/Partial/Unpaid pill
  on invoice rows in **Bills & payments** (with paid/due tooltip) and a Status
  column in **Items purchased** (per-purchase view). Verified: 67 POs ↔ 67
  `exp_po_*` expenses (1:1), join resolves paid totals. S3 complete.

### 3i. Cross-module integrity cutover (durable) — see docs/cross-module-integrity-cutover.md

- Owner chose the **durable single-source-of-truth fix**, **integrity first** (S3 UI after).
- **I1 DONE + verified:** Daily Entry read now resolves `vendor` from the current
  `Supplier` (via line's `ledgerEntryId`/`purchaseOrderId` → `supplierId`) and
  `employeeName` from the current `Employee` (`employeeId`), falling back to the
  captured copy when the entity is gone. Renames propagate to past entries.
  `daily-entries.service.ts` `buildExpenseLine` + `expenseLinesByEntry`.
- **I2 DONE + verified:** `DailyEntry.remove` now safe-cascades — after deleting
  the day it removes that day's linked bills (`LedgerEntry`) + purchase orders
  from the **relational** tables when they're unlocked AND not referenced by any
  other day (locked/shared ones are kept + logged), then reprojects payables.
  Because Cashbook reads assemble from relational (`ledger.service` D2b), the
  removal shows immediately; the JSON blob stays as the frozen rollback snapshot.
  Verified: unreferenced bill/PO removed; bill shared by 2 days kept until the
  last day is gone; parity gate green.
  - **Caveat (→ I3/I4):** the terminal still holds the ledger workspace in memory;
    if the user edits+saves Cashbooks in the same session it could re-add a removed
    bill from stale memory. Fix = frontend refresh after cross-module delete /
    relational-first writes.
- **I3 (interim safety) — chosen over the full rewrite for now:**
  - **I3a DONE (typechecked):** deleting a day now flushes pending ledger edits,
    deletes server-side (safe-cascade), then force-reloads the ledger store
    (`reloadLedgerWorkspace` in `ledgerWorkspaceStore.ts`) so Cashbooks can't
    show or re-save a removed bill from stale memory. Closes the I2 caveat.
  - **I3b already-safe:** on a failed ledger post the daily save proceeds (data
    not lost) and `syncDailyEntryExpenseLines` nulls the dangling link (no
    orphan reference); the user is warned. No risky save-flow change needed.
  - **Salary side DONE + verified:** `DailyEntry.remove` now also deletes that
    day's posted staff payouts (`SalaryPayment` where `dailyEntryDate == date`)
    from relational, skipping any in a locked month. Payroll reads assemble from
    relational (`payroll.service` D2), so the register reflects it; the frontend
    delete flow also flush+reloads the salary store (`reloadSalaryWorkspace`).
    Verified: unlocked-month payout removed, locked-month payout kept, parity green.
- **I3-full DONE + verified 2026-07-19 (atomic cross-module save):** the daily
  save is now ONE request — `PUT /daily-entries/:date/commit` — carrying the
  daily entry + derived ledger workspace + salary bundle. `DailyCommitService`
  writes all three (JSON blob + relational projection each) plus a single
  `syncPayables`, inside ONE Prisma `$transaction` — all commit or all roll back,
  so a mid-sequence failure can no longer orphan data. Built by extracting
  `writeWithinTx` on Ledger/Payroll and `upsertWithinTx` on DailyEntries, adding a
  `deferPayables` flag to the three sync methods. Frontend `handleSave` sends the
  commit and cancels the stores' debounced PUTs (`cancelLedger/SalaryWorkspacePersist`)
  so they can't race/double-write, then re-pulls both stores from the server.
  Verified: idempotent multi-module commit (200, parity green); forced mid-tx
  failure fully rolled back (canary + daily row both absent); real UI save with
  item-purchase bills persisted with parity green. See
  docs/cross-module-integrity-cutover.md.
- **I4 (retire denormalized copies) — deferred to P6:** reads already resolve
  names by reference (I1); the stored copies remain only as the FK-null fallback
  and JSON rollback path, so they're dropped together with the legacy JSON columns
  in P6 (a week after production runs on relational). No further change until then.

### 3h. S2 progress 2026-07-19 (foundation done + verified)

- **Decisions:** daily cash-outs default to **cash**; historical blanket-"Card"
  payments relabelled to `other`; ownership model **A** (Daily-Entry/Cashbook
  bills+payments are system-owned/read-only in Payables; Payables is for manual
  standalone expenses).
- **Backfill method fix:** `methodFromText` no longer trusts "card" (blanket UI
  default) — maps to `other`. So a P5 re-run reproduces the relabel.
- **Migration `20260719000000_expense_payment_source`** (additive): `source`
  column on `Expense` + `Payment` (`manual|purchase|daily|ledger`) + indexes.
- **Deterministic ids** (backfill rewritten): item-purchase `exp_po_<poId>`
  (source=purchase); daily-derived `exp_del_<lineId>` / `pay_del_<lineId>`
  (source=daily). Idempotent — safe to re-derive on every save.
- **Verified:** re-backfill → `verify-expenses` ALL PASS (67 purchases, 89
  payments, dailyParity mismatches=0, orphanTargets=0, totals unchanged).
- **S2 write path DONE + verified (model A).** `RelationalSyncService.syncPayables`
  re-derives the source-owned payables (`purchase`/`daily`) from current
  PurchaseOrders + daily lines + salary on every relevant save; `manual` rows are
  never touched. Wired at the end of `syncLedgerWorkspace`, `syncSalaryWorkspace`,
  `syncDailyEntryExpenseLines`, and in `DailyEntry.remove` (delete-reprojection).
  Logic mirrors `backfill-expenses.mjs` 1:1 so the projection == the verified
  backfill.
  - Verified: live daily save creates a new derived `Payment`; a `manual`
    expense+payment survive untouched; deleting a day re-projects back to
    canonical; `verify-expenses` ALL PASS (89 payments, 0 mismatch, 0 orphans).
  - NOT yet done = **S3**: (1) frontend cash-default method tagging on new daily
    cash-outs so the register/report reads cash truth; (2) read reflection +
    true per-bill Paid/Due/Status on Cashbook/Items pages; (3) make derived
    payables read-only in the Payables UI (model A UI enforcement).

---

## 4. Local development

Two Postgres containers may be running locally — do not confuse them:

- `krunch-localdb-postgres` on **:5434** — OUR sandbox (a copy of prod). This is
  where the relational work lives. pgAdmin at **http://localhost:5051**.
- `r-pos-postgres` on **:5433** — a DIFFERENT project's DB. Not ours. Ignore.

Local connection string (host tools / API):
`postgresql://krunch:krunch@127.0.0.1:5434/krunch?schema=public`

Run things:

- Sandbox DB + pgAdmin: `docker compose -f docker-compose.localdb.yml up -d`
- Refresh sandbox from a fresh prod dump: `scripts/restore-prod-dump-local.sh`
- API (dev): `npm run dev -w @universal-pos/api` → http://localhost:3000
- Terminal (dev): `npm run dev` (turbo, filter=terminal)
- Prisma against local (NOT prod): from `packages/database-schema`, set
  `DATABASE_URL` to the :5434 string, then `prisma migrate deploy` / `generate`.

### DB safety rules (critical)

- **Never** run the root `npm run db:migrate` / `db:push` against production
  casually — they run `db:tunnel` to the VPS. For local work, run Prisma
  directly with `DATABASE_URL` pointed at :5434.
- Prisma `migrate dev` fails here (the old migration history isn't cleanly
  replayable in the shadow DB). Generate migrations with
  `prisma migrate diff --from-url <db> --to-schema-datamodel schema.prisma
  --script` and apply with `prisma migrate deploy`.
- This app is relational-only. Prod v1 keeps its own JSON DB. Never point
  migrate/push at production; shadow DB is a separate instance.

---

## 5. Storage & deploy (brief)

- Object storage: shared MinIO (S3-compatible) at
  `https://s3.storage.inventivelab.bd`, bucket `krunch-pos`. Config via
  `S3_*` env vars; do not spin up a local MinIO.
- Production: single VPS, host Caddy reverse-proxies the API and serves the
  built terminal; pgAdmin exposed on a subpath. See `deploy/` + `scripts/deploy-to-vps.sh`.

---

## 6. Conventions for agents

- Prisma schema is the source of truth; after editing it, regenerate the client
  and (for local) apply via `migrate deploy`.
- Keep money as integer minor units end to end; only convert to whole currency
  at the API boundary for the current frontend contract.
- HTTP API may still use workspace-shaped JSON payloads; do not reintroduce
  `Branch*Workspace` / `DailyEntry.expenseLines` persistence.
- Design/plan artifacts for this work live as Cursor canvases (DB review, fix
  plan, migration runbook).
