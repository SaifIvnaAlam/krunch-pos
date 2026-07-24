# Daily Entry ↔ Payables integration plan

Status: PLAN (not yet built). Local sandbox only; production untouched.
Decisions locked (2026-07-19):

- **Single entry point:** you record a payment in **Payables**. The Daily Entry's
  cash-out lines become a **live reflection** of those payments (not separately
  typed in). This prevents counting the same cash twice.
- **Cash only** posts to the Daily Entry register. Card / bank transfer / mobile
  money / cheque are still tracked in Payables (they affect Paid/Due) but do NOT
  move the physical cash drawer.
- **Gap A:** the New Expense / item-purchase create form gets an optional
  "Amount paid now + method + txn id + date", creating the Expense and the first
  Payment atomically (same as Quick Expense already does).

## The core idea

A cash outflow has exactly one record: a `Payment` row (against an `Expense`
for a purchase/other-expense, or against a `SalaryLine` for a payout). The Daily
Entry's cash-out total for a day = sum of **cash** `Payment`s dated that day.

## The historical landmine

The P2 backfill already created `Payment` rows from the old daily
`vendor`/`staff`/`regular` lines. So for **past days, Payments already ARE the
daily cash-out** — the stored `DailyEntryExpenseLine` rows for those kinds are
redundant duplicates of Payments. If we naively "add" reflected payments on top
of the existing lines we double-count history.

Also: historical daily `expenses` totals were computed across **all** methods
(some were card/mobile parsed from memos), whereas going forward we count cash
only. So a cash-only derivation will not exactly equal every historical total.

**Resolution:** historical (closed) days keep their recorded `expenses` figure
as-is (frozen, treated as source of truth for the past). The cash-only reflection
model applies to **new** activity from cutover forward. We assert parity only on
the forward path, not by rewriting closed days.

## Stages (all on local; each verified before the next)

- **S1 — Gap A (isolated, safe):** add "Amount paid now + method + txn id + date"
  to the New Expense / item-purchase create drawer. Backend already supports
  create-expense + create-payment; wire the form to do both in one call
  (reuse the quick-expense transaction pattern). No daily-entry changes yet.

- **S2 — Payment → day mapping (backend read):** derive each day's cash-out from
  cash `Payment`s dated that day. Daily Entry read composes vendor/staff/regular
  cash-out lines from those payments; `purchase` (bill, ৳0 cash) lines keep
  coming from item-purchase expenses. Guard so historical days stay frozen.

- **S3 — Daily Entry frontend:** vendor/staff/regular cash-out lines become
  read-only reflections with a "record in Payables" affordance; sales entry and
  the purchase(bill) entry stay editable. Show a derived "cash paid today" total.

- **S4 — Parity + verify:** for the forward path, day cash-out total == sum of
  that day's cash payments; zero drift; no double counting vs. historical
  Payments. Fold the migration into the P5 production rollout.

## Out of scope for now
- Dropping the `Shift` dead table and the frozen JSON backups (P6 cleanup).
- Changing non-cash reporting beyond "tracked in Payables, not in the register".

## S2 pre-build findings (2026-07-19 investigation)

Two facts discovered before writing S2 code — both change the shape of S2:

1. **Saving a Daily Entry does NOT create payables `Payment` rows today.**
   `RelationalSyncService` mirrors daily expense lines into
   `DailyEntryExpenseLine` and creates `SalaryPayment` (payroll-internal), but it
   never writes the payables `Payment` table. Payables `Payment` rows come only
   from the Payables module (expenses/payments/quick) and the one-time P2
   backfill. → **S2 is not just a read change.** For "day cash-out = that day's
   cash Payments" to work going forward, the daily-entry write must also create
   `Payment` rows (vendor line → Payment vs the item-purchase Expense; staff line
   → Payment vs SalaryLine; regular line → other_expense Expense + Payment).

2. **84% of historical outflow is recorded non-cash.** Of ৳371,511 total
   backfilled payments: cash ৳58,320 (16%), card ৳291,891 (79%, all against
   vendor bills), other ৳21,300. All 14 days contain non-cash payments; salary
   payments are all cash. The `card` tags are real (parsed from ledger memo text,
   not a default — `methodFromText` defaults to `other`). → A **cash-only daily
   register going forward will read far lower than the historical `expenses`
   figure**, which confirms the plan: freeze closed/historical days at their
   recorded numbers; apply the cash-only reflection only to new activity.

### Decision needed before building S2 (owner)
- Daily-entry expense lines have **no method field** today. Going forward, should
  every daily-entry cash-out line default to **cash** (it's the physical
  register), with card/bank/mobile entered only in Payables? (Recommended: yes.)
  → DECIDED 2026-07-19: **cash default**.
- Confirm the **freeze boundary**: closed/historical days keep their recorded
  `expenses` numbers untouched; cash-only derivation starts from a cutover date.
- Historical blanket-"Card" payments relabelled to `other`. → DONE 2026-07-19.

## S2 design (grounded in the sync architecture)

The live app writes the OLD structures (ledger workspace, PurchaseOrder,
DailyEntryExpenseLine, SalaryPayment) via `RelationalSyncService`, which
re-derives the relational tables transactionally on every save. It does NOT
maintain the payables model (`Expense`/`Payment`) — those exist only from the
Payables module and the one-time backfill. S2 makes the sync maintain the
payables model too. Three requirements this imposes:

1. **Deterministic ids for derived rows** (so per-save reconcile is idempotent —
   no churn/orphans). e.g. item-purchase `Expense.id = "exp_po_<purchaseOrderId>"`;
   a daily cash-out `Payment.id = "pay_del_<dailyExpenseLineId>"`; a regular-line
   `Expense.id = "exp_del_<dailyExpenseLineId>"`. Requires a one-time **re-backfill**
   with these deterministic ids (changes the current 69 Expense / 89 Payment ids;
   local only; re-verified by the parity gate).
2. **A `source` marker** on `Expense`/`Payment` (`manual | daily | purchase | ledger`)
   so the sync only reconciles rows it owns and NEVER touches user-authored
   `manual` rows.
3. **Reconcile mapping** (mirrors the proven backfill, per branch, per save):
   - purchase card → `Expense(item_purchase, source=purchase)` (+ items) from the PO.
   - vendor cash-out line → `Payment(source=daily, method=cash)` against that
     vendor's item-purchase Expense (same-day PO; else supplier FIFO; else a
     standalone other_expense) — preserves daily cash parity.
   - regular line → `Expense(other_expense, source=daily)` + `Payment`.
   - staff line → `Payment(source=daily)` against the SalaryLine.
   Read path stays unchanged (daily numbers identical). Payables + status views
   become complete/accurate. True per-bill status on Cashbook/Items pages = S3.

### The one ownership decision (owner)
Going forward, who "owns" a bill/payment that originates in Daily Entry / Cashbooks?
- **A (recommended):** system-owned. They're auto-maintained from their source
  screen and shown **read-only** in Payables; Payables stays the place to create
  standalone *other expenses* manually. No edit conflicts.
- **B:** Payables stays fully editable; the sync only fills gaps and avoids
  overwriting anything a user has touched (more complex, conflict-prone).
