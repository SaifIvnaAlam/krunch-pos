// IMPORT HELPER (shadow DB): copy relational rows from a *prod-shaped* dump that
// still has Branch*Workspace / DailyEntry.expenseLines JSON blobs.
//
// This app's schema no longer has those tables/columns. Point DATABASE_URL at a
// temporary restore of a prod dump (JSON still present), and write into a
// separate shadow DB — or adapt to raw SQL — before running. Do NOT run against
// production.
//
// Money is stored as integer minor units of the branch currency (Branch.currency).
//   - Ledger / purchase amounts are already minor units in the JSON -> copied as-is.
//   - Salaries & daily-entry expenses are whole-currency in the JSON -> x100.
//
// Usage:
//   DATABASE_URL=postgresql://krunch:krunch@127.0.0.1:5434/krunch?schema=public \
//     node scripts/backfill-relational.mjs
//
// Never point this at production without an explicit, reviewed decision.

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

// Already-minor integer (ledger/purchase amounts).
const asMinor = (v) => (v === null || v === undefined ? 0 : Math.round(Number(v)));
// Whole-currency value -> minor units (salaries, expenses).
const toMinor = (v) => (v === null || v === undefined ? 0 : Math.round(Number(v) * 100));
const toMinorOrNull = (v) =>
  v === null || v === undefined || v === "" ? null : Math.round(Number(v) * 100);
const asNum = (v) => (v === null || v === undefined ? 0 : Number(v));
const asNumOrNull = (v) =>
  v === null || v === undefined || v === "" ? null : Number(v);
const str = (v) => (v === null || v === undefined ? "" : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);

async function main() {
  const summary = {};

  await prisma.$transaction(
    async (tx) => {
      // 1. Clear new tables (child -> parent) for a clean, idempotent rerun.
      await tx.dailyEntryExpenseItem.deleteMany();
      await tx.dailyEntryExpenseLine.deleteMany();
      await tx.salaryPayment.deleteMany();
      await tx.salaryLine.deleteMany();
      await tx.salaryMonth.deleteMany();
      await tx.employee.deleteMany();
      await tx.purchaseOrderItem.deleteMany();
      await tx.purchaseOrder.deleteMany();
      await tx.ledgerEntryItem.deleteMany();
      await tx.ledgerEntry.deleteMany();
      await tx.supplier.deleteMany();

      const ledgerIds = new Set();
      const poIds = new Set();
      const employeeIds = new Set();

      // ---- Ledger workspace: suppliers, ledger entries, purchase moves ----
      // JSON workspace tables are not in the current Prisma schema — read via SQL.
      const ledgerWs = await tx.$queryRawUnsafe(
        `SELECT "branchId", suppliers, moves, ledger FROM "BranchLedgerWorkspace"`,
      );
      let cSuppliers = 0,
        cLedger = 0,
        cLedgerItems = 0,
        cPO = 0,
        cPOItems = 0;

      for (const ws of ledgerWs) {
        const branchId = ws.branchId;

        for (const s of arr(ws.suppliers)) {
          await tx.supplier.create({
            data: {
              id: str(s.id),
              branchId,
              name: str(s.name),
              bookPurpose: str(s.bookPurpose),
              contactPerson: str(s.contactPerson),
              phone: str(s.phone),
              email: str(s.email),
              address: str(s.address),
              notes: str(s.notes),
            },
          });
          cSuppliers++;
        }

        for (const e of arr(ws.ledger)) {
          await tx.ledgerEntry.create({
            data: {
              id: str(e.id),
              branchId,
              supplierId: str(e.supplierId),
              date: str(e.date),
              type: str(e.type),
              ref: str(e.ref),
              memo: str(e.memo),
              amountMinor: asMinor(e.amountCents),
              isLocked: Boolean(e.isLocked),
              lockedAt: e.lockedAt ? new Date(e.lockedAt) : null,
            },
          });
          ledgerIds.add(str(e.id));
          cLedger++;
          const items = arr(e.items);
          if (items.length) {
            await tx.ledgerEntryItem.createMany({
              data: items.map((it) => ({
                branchId,
                ledgerEntryId: str(e.id),
                sourceId: str(it.id),
                name: str(it.name),
                qty: asNum(it.qty),
                unit: str(it.unit),
                rateMinor: asMinor(it.rateCents),
                totalMinor: asMinor(it.totalCents),
              })),
            });
            cLedgerItems += items.length;
          }
        }

        for (const m of arr(ws.moves)) {
          if (str(m.kind) !== "purchase") continue; // returns deferred (none in data)
          await tx.purchaseOrder.create({
            data: {
              id: str(m.id),
              branchId,
              supplierId: str(m.supplierId),
              ref: str(m.ref),
              date: str(m.date),
              status: str(m.status) || "draft",
              note: str(m.note),
              amountMinor: asMinor(m.amountCents),
            },
          });
          poIds.add(str(m.id));
          cPO++;
          const items = arr(m.items);
          if (items.length) {
            await tx.purchaseOrderItem.createMany({
              data: items.map((it) => ({
                branchId,
                purchaseOrderId: str(m.id),
                sourceId: str(it.id),
                name: str(it.name),
                qty: asNum(it.qty),
                unit: str(it.unit),
                rateMinor: asMinor(it.rateCents),
                totalMinor: asMinor(it.totalCents),
              })),
            });
            cPOItems += items.length;
          }
        }
      }

      // ---- Employee directory ----
      const dirs = await tx.$queryRawUnsafe(
        `SELECT "branchId", employees FROM "BranchEmployeeDirectory"`,
      );
      let cEmployees = 0;
      for (const d of dirs) {
        for (const em of arr(d.employees)) {
          await tx.employee.create({
            data: {
              id: str(em.id),
              branchId: d.branchId,
              name: str(em.name),
              role: str(em.role),
              phone: str(em.phone),
              email: str(em.email),
              defaultBasicSalaryMinor: toMinor(em.defaultBasicSalary),
              serviceChargePct: asNumOrNull(em.serviceChargePct),
              active: em.active === undefined ? true : Boolean(em.active),
              notes: str(em.notes),
            },
          });
          employeeIds.add(str(em.id));
          cEmployees++;
        }
      }

      // ---- Salary workspace: months -> lines -> payments ----
      const salaryWs = await tx.$queryRawUnsafe(
        `SELECT "branchId", bundle FROM "BranchSalaryWorkspace"`,
      );
      let cMonths = 0,
        cLines = 0,
        cPayments = 0;
      for (const ws of salaryWs) {
        const branchId = ws.branchId;
        const bundle = ws.bundle && typeof ws.bundle === "object" ? ws.bundle : {};
        const months = bundle.months && typeof bundle.months === "object" ? bundle.months : {};
        for (const [monthKey, docRaw] of Object.entries(months)) {
          const doc = docRaw && typeof docRaw === "object" ? docRaw : {};
          const monthId = randomUUID();
          await tx.salaryMonth.create({
            data: {
              id: monthId,
              branchId,
              monthKey,
              periodLabel: str(doc.periodLabel),
              serviceChargePoolMinor: toMinorOrNull(doc.serviceChargePool),
              isLocked: Boolean(doc.isLocked),
              lockedAt: doc.lockedAt ? new Date(doc.lockedAt) : null,
              lockedBy: doc.lockedBy ? str(doc.lockedBy) : null,
            },
          });
          cMonths++;
          for (const r of arr(doc.rows)) {
            if (!employeeIds.has(str(r.employeeId))) {
              throw new Error(
                `Salary line ${r.id} references missing employee ${r.employeeId}`,
              );
            }
            await tx.salaryLine.create({
              data: {
                id: str(r.id),
                branchId,
                salaryMonthId: monthId,
                employeeId: str(r.employeeId),
                name: str(r.name),
                basicMinor: toMinor(r.basic),
                pct: asNumOrNull(r.pct),
                serviceChargeMinor: toMinor(r.serviceCharge),
                overtimeMinor: toMinor(r.overtime),
                eidBonusMinor: toMinor(r.eidBonus),
                finesMinor: toMinor(r.fines),
              },
            });
            cLines++;
            const payments = arr(r.payments);
            if (payments.length) {
              await tx.salaryPayment.createMany({
                data: payments.map((p) => ({
                  id: str(p.id),
                  branchId,
                  salaryLineId: str(r.id),
                  amountMinor: toMinor(p.amount),
                  date: str(p.date),
                  note: str(p.note),
                  dailyEntryLineId: p.dailyEntryLineId ? str(p.dailyEntryLineId) : null,
                  dailyEntryDate: p.dailyEntryDate ? str(p.dailyEntryDate) : null,
                  postedEmployeeLineKind: p.postedEmployeeLineKind
                    ? str(p.postedEmployeeLineKind)
                    : null,
                })),
              });
              cPayments += payments.length;
            }
          }
        }
      }

      // ---- Daily entry expense lines ----
      const entries = await tx.$queryRawUnsafe(
        `SELECT id, "branchId", "expenseLines" FROM "DailyEntry"`,
      );
      let cEL = 0,
        cELItems = 0;
      for (const de of entries) {
        for (const el of arr(de.expenseLines)) {
          const link = el.ledgerLink && typeof el.ledgerLink === "object" ? el.ledgerLink : {};
          const ledgerEntryId = ledgerIds.has(str(link.ledgerEntryId))
            ? str(link.ledgerEntryId)
            : null;
          const purchaseOrderId = poIds.has(str(link.purchaseOrderId))
            ? str(link.purchaseOrderId)
            : null;
          const employeeId = employeeIds.has(str(el.employeeId))
            ? str(el.employeeId)
            : null;
          const elId = randomUUID();
          await tx.dailyEntryExpenseLine.create({
            data: {
              id: elId,
              branchId: de.branchId,
              dailyEntryId: de.id,
              lineId: str(el.lineId),
              kind: str(el.kind),
              amountMinor: toMinor(el.amount),
              label: str(el.label),
              vendor: str(el.vendor),
              ledgerNote: str(el.ledgerNote),
              ledgerKind: el.ledgerKind ? str(el.ledgerKind) : null,
              ledgerEntryId,
              purchaseOrderId,
              employeeId,
              employeeName: el.employeeName ? str(el.employeeName) : null,
              staffLineKind: el.staffLineKind ? str(el.staffLineKind) : null,
              salaryPaymentId: el.salaryPaymentId ? str(el.salaryPaymentId) : null,
            },
          });
          cEL++;
          const items = arr(el.items);
          if (items.length) {
            await tx.dailyEntryExpenseItem.createMany({
              data: items.map((it) => ({
                branchId: de.branchId,
                expenseLineId: elId,
                sourceId: str(it.id),
                name: str(it.name),
                qty: asNum(it.qty),
                unit: str(it.unit),
                rateMinor: toMinor(it.rate),
                totalMinor: toMinor(it.total),
              })),
            });
            cELItems += items.length;
          }
        }
      }

      Object.assign(summary, {
        suppliers: cSuppliers,
        ledgerEntries: cLedger,
        ledgerEntryItems: cLedgerItems,
        purchaseOrders: cPO,
        purchaseOrderItems: cPOItems,
        employees: cEmployees,
        salaryMonths: cMonths,
        salaryLines: cLines,
        salaryPayments: cPayments,
        dailyEntryExpenseLines: cEL,
        dailyEntryExpenseItems: cELItems,
      });
    },
    { timeout: 120000, maxWait: 20000 },
  );

  console.log("Backfill complete. Inserted rows:");
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);
}

main()
  .catch((e) => {
    console.error("Backfill FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
