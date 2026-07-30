# Cross-module integrity cutover (durable fix)

**Goal:** make the relational tables the single source of truth so that edits and
deletes in one module propagate everywhere automatically — instead of the legacy
model where four independent JSON workspaces are kept in step by fragile frontend
logic with denormalized name copies and soft links.

Owner decisions (2026-07-19): **durable fix** (not targeted patches), **integrity
first**, S3 UI work after. Everything local-first + verified before any production
rollout; production JSON stays as the rollback path until cutover completes.

## The gaps we are killing (from the cross-module map)

- **Rename staleness:** renaming a supplier/employee leaves the old name on past
  Daily Entries (names are copied into each line, not referenced).
- **Delete orphans:** deleting a whole day from history leaves its bills/POs
  stranded in Cashbooks; the JSON ledger blob isn't cleaned.
- **Partial-failure orphans:** ledger saved but daily sync failed (or vice-versa)
  leaves stale links / orphaned rows — only a warning is shown.
- **Derived-row confusion:** deleting a system-owned row in Payables silently
  reappears on the next save (correct under model A, but confusing).

## Stages

### I1 — Names by reference (read side) [SAFE, read-only]
Daily Entry read resolves `employeeName` from the current `Employee` row (by
`employeeId`) and `vendor` from the current `Supplier` row (via the line's
`ledgerEntryId` / `purchaseOrderId` → `supplierId`). If the entity is gone
(SET NULL), keep the last-captured name. Renames now show on every past entry.
No write-path change; API contract intentionally reflects current names.

### I2 — Delete integrity (write side)
Deleting a day (history) or an entity cleans up its dependents everywhere, not
just the relational projection. Move delete authority so cascades/reconciliation
handle it server-side (e.g. day delete also removes the day's ledger bills/POs
that belong solely to it). Guard locked rows.

### I3 — Save atomicity [DONE + verified 2026-07-19]
The daily save used to post to ledger, then daily row, then salary as three
separate client-orchestrated PUTs; a mid-sequence failure orphaned data. Now the
daily save sends ONE request to `PUT /daily-entries/:date/commit` carrying the
daily entry + the derived ledger workspace + the salary bundle. The server writes
all three (each JSON blob + its relational projection) plus a single payables
reprojection inside ONE Prisma `$transaction` — all commit or all roll back.

- API: `DailyCommitService` composes `LedgerService.writeWithinTx`,
  `PayrollService.writeWithinTx`, `DailyEntriesService.upsertWithinTx` (each
  extracted from its public upsert) with `deferPayables: true`, then runs
  `syncPayables` once. The three per-module sync methods gained a
  `deferPayables` option so payables isn't reprojected three times.
- Frontend: `handleSave` derives ledger/salary in memory as before, but sends the
  atomic commit instead of three flushes. The ledger/salary stores' debounced
  auto-PUTs are cancelled (`cancelLedgerWorkspacePersist` /
  `cancelSalaryWorkspacePersist`) so they can't race or double-write, then both
  stores are re-pulled from the server after the commit.
- Verified: (a) idempotent multi-module commit → 200, parity green; (b) forced
  mid-tx failure → 500 with FULL rollback (canary supplier + daily row both
  absent from the DB); (c) real UI save (16-Jul, with item-purchase bills) →
  persisted, parity green.

### I4 — Retire denormalized copies / relational-first writes [COUPLED TO P6]
Reads already resolve names by reference (I1); the copied names/soft links remain
stored only as the FK-null fallback and legacy JSON backup. Physically removing
them is the final step and is intentionally deferred to the P6 JSON-column drop
(a week after production runs on relational) — removing them earlier would delete
the rollback path with no benefit. No further code change needed for I4 until P6.

## Verification per stage
- I1: rename a supplier/employee → GET a past entry shows the new name; parity gate
  still green; round-trip save unaffected.
- I2/I3: delete/partial-failure scenarios leave zero orphans; `verify-expenses`
  parity + orphan checks green.
