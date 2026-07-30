import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  allocateLedgerPaymentsFifo,
  expenseKindForSupplier,
} from '../expenses/expense.util';

/**
 * Project API workspace / daily-entry payloads into the relational tables.
 * Feature services call these inside the same transaction as the user write —
 * relational is the only store (no legacy JSON blob dual-write).
 *
 * Money: `*Minor` columns are integer minor units of the branch currency.
 *   - ledger / purchase amounts are already minor units in the payload.
 *   - salaries & daily-entry expenses are whole-currency in the payload -> x100.
 */

const asMinor = (v: unknown) => (v == null ? 0 : Math.round(Number(v)));
const toMinor = (v: unknown) => (v == null ? 0 : Math.round(Number(v) * 100));
const toMinorOrNull = (v: unknown) =>
  v == null || v === '' ? null : Math.round(Number(v) * 100);
const asNum = (v: unknown) => (v == null ? 0 : Number(v));
const asNumOrNull = (v: unknown) => (v == null || v === '' ? null : Number(v));
const str = (v: unknown) => (v == null ? '' : String(v));
const strOrNull = (v: unknown) => (v == null || v === '' ? null : String(v));
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};

const TX_OPTS = { timeout: 120000, maxWait: 20000 } as const;

@Injectable()
export class RelationalSyncService {
  private readonly logger = new Logger(RelationalSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Run a sync fn, swallowing (logging) any error so it never breaks a save. */
  async safe(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`Relational sync (${label}) failed: ${err}`);
    }
  }

  /**
   * Run `body` inside a transaction. When the caller already holds one, reuse
   * it so the whole write commits or rolls back together. Otherwise open a
   * fresh transaction.
   */
  private withTx<T>(
    tx: Prisma.TransactionClient | undefined,
    body: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return tx ? body(tx) : this.prisma.$transaction(body, TX_OPTS);
  }

  private async ensureSupplier(
    tx: Prisma.TransactionClient,
    branchId: string,
    id: string,
  ): Promise<void> {
    await tx.supplier.upsert({
      where: { id },
      create: { id, branchId, name: '(unknown supplier)', bookPurpose: 'vendor' },
      update: {},
    });
  }

  private async ensureEmployee(
    tx: Prisma.TransactionClient,
    branchId: string,
    id: string,
  ): Promise<void> {
    await tx.employee.upsert({
      where: { id },
      create: { id, branchId, name: '(unknown employee)' },
      update: {},
    });
  }

  private async deleteMissing(
    tx: Prisma.TransactionClient,
    model: { deleteMany: (args: any) => Promise<unknown> },
    baseWhere: Record<string, unknown>,
    keptIds: string[],
  ): Promise<void> {
    const where =
      keptIds.length === 0 ? baseWhere : { ...baseWhere, id: { notIn: keptIds } };
    await model.deleteMany({ where });
  }

  // ---- Cashbooks / Ledger -------------------------------------------------

  async syncLedgerWorkspace(
    branchId: string,
    data: { suppliers: unknown[]; moves: unknown[]; ledger: unknown[] },
    outerTx?: Prisma.TransactionClient,
    opts?: { deferPayables?: boolean },
  ): Promise<void> {
    const suppliers = arr(data.suppliers);
    const allMoves = arr(data.moves);
    const ledger = arr(data.ledger);

    await this.withTx(outerTx, async (tx) => {
      const supplierIds = new Set<string>();
      for (let i = 0; i < suppliers.length; i++) {
        const s = suppliers[i];
        const id = str(s.id);
        if (!id) continue;
        const fields = {
          branchId,
          name: str(s.name),
          bookPurpose: str(s.bookPurpose) || 'vendor',
          contactPerson: str(s.contactPerson),
          phone: str(s.phone),
          email: str(s.email),
          address: str(s.address),
          notes: str(s.notes),
          sortIndex: i,
        };
        await tx.supplier.upsert({ where: { id }, create: { id, ...fields }, update: fields });
        supplierIds.add(id);
      }

      for (const sid of [
        ...ledger.map((e) => str(e.supplierId)),
        ...allMoves.map((m) => str(m.supplierId)),
      ]) {
        if (sid && !supplierIds.has(sid)) {
          await this.ensureSupplier(tx, branchId, sid);
          supplierIds.add(sid);
        }
      }

      const ledgerIds: string[] = [];
      for (let i = 0; i < ledger.length; i++) {
        const e = ledger[i];
        const id = str(e.id);
        if (!id) continue;
        const fields = {
          branchId,
          supplierId: str(e.supplierId),
          date: str(e.date),
          type: str(e.type) as any,
          ref: str(e.ref),
          memo: str(e.memo),
          amountMinor: asMinor(e.amountCents),
          isLocked: Boolean(e.isLocked),
          lockedAt: e.lockedAt ? new Date(e.lockedAt) : null,
          sortIndex: i,
        };
        await tx.ledgerEntry.upsert({ where: { id }, create: { id, ...fields }, update: fields });
        await tx.ledgerEntryItem.deleteMany({ where: { ledgerEntryId: id } });
        const items = arr(e.items);
        if (items.length) {
          await tx.ledgerEntryItem.createMany({
            data: items.map((it, j) => ({
              branchId,
              ledgerEntryId: id,
              sourceId: str(it.id),
              name: str(it.name),
              qty: asNum(it.qty),
              unit: str(it.unit),
              rateMinor: asMinor(it.rateCents),
              totalMinor: asMinor(it.totalCents),
              sortIndex: j,
            })),
          });
        }
        await tx.ledgerEntryAttachment.deleteMany({ where: { ledgerEntryId: id } });
        const attachments = arr(e.attachments);
        if (attachments.length) {
          await tx.ledgerEntryAttachment.createMany({
            data: attachments.map((a, j) => ({
              branchId,
              ledgerEntryId: id,
              fileName: str(a.fileName),
              mimeType: str(a.mimeType),
              dataUrl: str(a.dataUrl),
              sortIndex: j,
            })),
          });
        }
        ledgerIds.push(id);
      }
      await this.deleteMissing(tx, tx.ledgerEntry, { branchId }, ledgerIds);

      // moves[] is a mixed array of purchases and returns; keep the array index
      // as a shared sortIndex so the two can be re-merged in original order.
      const poIds: string[] = [];
      const returnIds: string[] = [];
      for (let i = 0; i < allMoves.length; i++) {
        const m = allMoves[i];
        const id = str(m.id);
        if (!id) continue;
        if (str(m.kind) === 'return') {
          const rfields = {
            branchId,
            supplierId: str(m.supplierId),
            ref: str(m.ref),
            linkedPurchaseId: strOrNull(m.linkedPurchaseId),
            date: str(m.date),
            reason: str(m.reason),
            status: (str(m.status) || 'draft') as any,
            sortIndex: i,
          };
          await tx.purchaseReturn.upsert({
            where: { id },
            create: { id, ...rfields },
            update: rfields,
          });
          await tx.returnLine.deleteMany({ where: { purchaseReturnId: id } });
          const lines = arr(m.lines);
          if (lines.length) {
            await tx.returnLine.createMany({
              data: lines.map((l, j) => ({
                branchId,
                purchaseReturnId: id,
                sourceId: str(l.id),
                description: str(l.description),
                qty: asNum(l.qty),
                unit: str(l.unit),
                creditMinor: asMinor(l.creditCents),
                sortIndex: j,
              })),
            });
          }
          returnIds.push(id);
          continue;
        }
        const fields = {
          branchId,
          supplierId: str(m.supplierId),
          ref: str(m.ref),
          date: str(m.date),
          status: (str(m.status) || 'draft') as any,
          note: str(m.note),
          amountMinor: asMinor(m.amountCents),
          sortIndex: i,
        };
        await tx.purchaseOrder.upsert({ where: { id }, create: { id, ...fields }, update: fields });
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        const items = arr(m.items);
        if (items.length) {
          await tx.purchaseOrderItem.createMany({
            data: items.map((it, j) => ({
              branchId,
              purchaseOrderId: id,
              sourceId: str(it.id),
              name: str(it.name),
              qty: asNum(it.qty),
              unit: str(it.unit),
              rateMinor: asMinor(it.rateCents),
              totalMinor: asMinor(it.totalCents),
              sortIndex: j,
            })),
          });
        }
        poIds.push(id);
      }
      // Returns reference purchases (linkedPurchaseId, SET NULL) — delete returns
      // before purchases so a removed purchase doesn't orphan a kept return's link.
      await this.deleteMissing(tx, tx.purchaseReturn, { branchId }, returnIds);
      await this.deleteMissing(tx, tx.purchaseOrder, { branchId }, poIds);

      // Suppliers not present and not referenced (kept ids only) are safe to drop.
      await this.deleteMissing(tx, tx.supplier, { branchId }, [...supplierIds]);

      // Re-project item-purchase payables from the purchase orders just written.
      // Deferred when composed in a multi-module commit (payables runs once at the end).
      if (!opts?.deferPayables) await this.syncPayables(branchId, tx);
    });
  }

  // ---- Employee directory -------------------------------------------------

  async syncEmployeeDirectory(
    branchId: string,
    employees: unknown[],
    outerTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const list = arr(employees);
    await this.withTx(outerTx, async (tx) => {
      const keptIds: string[] = [];
      for (let i = 0; i < list.length; i++) {
        const em = list[i];
        const id = str(em.id);
        if (!id) continue;
        const fields = {
          branchId,
          name: str(em.name),
          role: str(em.role),
          phone: str(em.phone),
          email: str(em.email),
          defaultBasicSalaryMinor: toMinor(em.defaultBasicSalary),
          serviceChargePct: asNumOrNull(em.serviceChargePct),
          active: em.active === undefined ? true : Boolean(em.active),
          notes: str(em.notes),
          sortIndex: i,
        };
        await tx.employee.upsert({ where: { id }, create: { id, ...fields }, update: fields });
        keptIds.push(id);
      }

      // Drop removed employees. Salary-line and expense-line refs are ON DELETE
      // SET NULL, so this is always safe (rows keep their captured name).
      await this.deleteMissing(tx, tx.employee, { branchId }, keptIds);
    });
  }

  // ---- Payroll / salaries -------------------------------------------------

  async syncSalaryWorkspace(
    branchId: string,
    bundle: { months?: Record<string, unknown> },
    outerTx?: Prisma.TransactionClient,
    opts?: { deferPayables?: boolean },
  ): Promise<void> {
    const months = obj(bundle?.months);
    await this.withTx(outerTx, async (tx) => {
      const keptMonthIds: string[] = [];
      for (const [monthKey, docRaw] of Object.entries(months)) {
        const doc = obj(docRaw);
        const monthFields = {
          periodLabel: str(doc.periodLabel),
          serviceChargePoolMinor: toMinorOrNull(doc.serviceChargePool),
          isLocked: Boolean(doc.isLocked),
          lockedAt: doc.lockedAt ? new Date(doc.lockedAt) : null,
          lockedBy: strOrNull(doc.lockedBy),
        };
        const month = await tx.salaryMonth.upsert({
          where: { branchId_monthKey: { branchId, monthKey } },
          create: { branchId, monthKey, ...monthFields },
          update: monthFields,
        });
        keptMonthIds.push(month.id);

        const keptLineIds: string[] = [];
        const rows = arr(doc.rows);
        for (let ri = 0; ri < rows.length; ri++) {
          const r = rows[ri];
          const id = str(r.id);
          if (!id) continue;
          const employeeId = str(r.employeeId) || null;
          if (employeeId) await this.ensureEmployee(tx, branchId, employeeId);
          const lineFields = {
            branchId,
            salaryMonthId: month.id,
            employeeId,
            name: str(r.name),
            basicMinor: toMinor(r.basic),
            pct: asNumOrNull(r.pct),
            serviceChargeMinor: toMinor(r.serviceCharge),
            overtimeMinor: toMinor(r.overtime),
            eidBonusMinor: toMinor(r.eidBonus),
            finesMinor: toMinor(r.fines),
            sortIndex: ri,
          };
          await tx.salaryLine.upsert({ where: { id }, create: { id, ...lineFields }, update: lineFields });

          const keptPayIds: string[] = [];
          const payments = arr(r.payments);
          for (let pi = 0; pi < payments.length; pi++) {
            const p = payments[pi];
            const pid = str(p.id);
            if (!pid) continue;
            const payFields = {
              branchId,
              salaryLineId: id,
              amountMinor: toMinor(p.amount),
              date: str(p.date),
              note: str(p.note),
              dailyEntryLineId: strOrNull(p.dailyEntryLineId),
              dailyEntryDate: strOrNull(p.dailyEntryDate),
              postedEmployeeLineKind: strOrNull(p.postedEmployeeLineKind),
              sortIndex: pi,
            };
            await tx.salaryPayment.upsert({ where: { id: pid }, create: { id: pid, ...payFields }, update: payFields });
            keptPayIds.push(pid);
          }
          await this.deleteMissing(tx, tx.salaryPayment, { salaryLineId: id }, keptPayIds);
          keptLineIds.push(id);
        }
        await this.deleteMissing(tx, tx.salaryLine, { salaryMonthId: month.id }, keptLineIds);
      }
      await this.deleteMissing(tx, tx.salaryMonth, { branchId }, keptMonthIds);

      // Re-project salary-targeted payments from the salary lines just written.
      if (!opts?.deferPayables) await this.syncPayables(branchId, tx);
    });
  }

  // ---- Daily-entry expense lines -----------------------------------------

  async syncDailyEntryExpenseLines(
    branchId: string,
    dailyEntryId: string,
    expenseLines: unknown[],
    outerTx?: Prisma.TransactionClient,
    opts?: { deferPayables?: boolean },
  ): Promise<void> {
    const lines = arr(expenseLines);
    await this.withTx(outerTx, async (tx) => {
      const [ledgerRows, poRows, empRows, catRows] = await Promise.all([
        tx.ledgerEntry.findMany({ where: { branchId }, select: { id: true } }),
        tx.purchaseOrder.findMany({ where: { branchId }, select: { id: true } }),
        tx.employee.findMany({ where: { branchId }, select: { id: true } }),
        tx.expenseCategory.findMany({ where: { branchId }, select: { id: true } }),
      ]);
      const ledgerIds = new Set(ledgerRows.map((r) => r.id));
      const poIds = new Set(poRows.map((r) => r.id));
      const empIds = new Set(empRows.map((r) => r.id));
      const catIds = new Set(catRows.map((r) => r.id));

      // Full replace for this daily entry (expense lines have no inbound FKs).
      const existing = await tx.dailyEntryExpenseLine.findMany({
        where: { dailyEntryId },
        select: { id: true },
      });
      if (existing.length) {
        const ids = existing.map((e) => e.id);
        await tx.dailyEntryExpenseItem.deleteMany({ where: { expenseLineId: { in: ids } } });
        await tx.dailyEntryExpenseLine.deleteMany({ where: { dailyEntryId } });
      }

      for (let i = 0; i < lines.length; i++) {
        const el = lines[i];
        const link = obj(el.ledgerLink);
        const ledgerEntryId = ledgerIds.has(str(link.ledgerEntryId)) ? str(link.ledgerEntryId) : null;
        const purchaseOrderId = poIds.has(str(link.purchaseOrderId)) ? str(link.purchaseOrderId) : null;
        const employeeId = empIds.has(str(el.employeeId)) ? str(el.employeeId) : null;
        const paidRaw = el.paidAmount;
        const paidAmountMinor =
          paidRaw === undefined || paidRaw === null || paidRaw === ''
            ? null
            : toMinor(paidRaw);
        const catId = strOrNull(el.expenseCategoryId);
        const expenseCategoryId = catId && catIds.has(catId) ? catId : null;
        const created = await tx.dailyEntryExpenseLine.create({
          data: {
            branchId,
            dailyEntryId,
            lineId: str(el.lineId),
            kind: str(el.kind) as any,
            amountMinor: toMinor(el.amount),
            paidAmountMinor,
            label: str(el.label),
            vendor: str(el.vendor),
            note: str(el.note),
            ledgerNote: str(el.ledgerNote),
            ledgerKind: (strOrNull(el.ledgerKind) as any) ?? null,
            ledgerEmployeeLineKind: strOrNull(el.ledgerEmployeeLineKind),
            receiptDataUrls:
              Array.isArray(el.receiptDataUrls) && el.receiptDataUrls.length
                ? (el.receiptDataUrls as any)
                : undefined,
            ledgerEntryId,
            purchaseOrderId,
            employeeId,
            employeeName: strOrNull(el.employeeName),
            staffLineKind: strOrNull(el.staffLineKind),
            salaryPaymentId: strOrNull(el.salaryPaymentId),
            expenseCategoryId,
            sortIndex: i,
          },
        });
        const items = arr(el.items);
        if (items.length) {
          await tx.dailyEntryExpenseItem.createMany({
            data: items.map((it, j) => ({
              branchId,
              expenseLineId: created.id,
              sourceId: str(it.id),
              name: str(it.name),
              qty: asNum(it.qty),
              unit: str(it.unit),
              rateMinor: toMinor(it.rate),
              totalMinor: toMinor(it.total),
              sortIndex: j,
            })),
          });
        }
      }

      // Keep the payables model in step with the daily lines just written.
      if (!opts?.deferPayables) await this.syncPayables(branchId, tx);
    });
  }

  // ---- Payables projection (S2) ------------------------------------------
  // The Payables model (Expense/Payment) is a *projection* of the daily/ledger/
  // salary activity. Rows we own carry a non-`manual` `source` and are fully
  // re-derived here on every relevant save; `manual` rows (authored in the
  // Payables module) are never touched. Logic mirrors scripts/backfill-expenses.mjs
  // 1:1 so the projection equals the verified backfill; deterministic ids keep it
  // idempotent. Ownership model A: derived bills/payments are read-only in Payables.

  /** Sources this projection owns and is free to delete/recreate. */
  private static readonly DERIVED_SOURCES = ['purchase', 'daily', 'ledger'];

  private paymentMethodFromText(text: unknown): string {
    const m = str(text).toLowerCase();
    // "card" is intentionally NOT trusted — historical cashbook payments carried a
    // blanket "Card" memo that was a UI default (see backfill-expenses.mjs).
    if (m.includes('cash')) return 'cash';
    if (m.includes('bank')) return 'bank_transfer';
    if (m.includes('mobile') || m.includes('bkash') || m.includes('nagad') || m.includes('mfs'))
      return 'mobile_money';
    if (m.includes('cheque') || m.includes('check')) return 'cheque';
    return 'other';
  }

  /// Go-live date for the cash default (S3c). Set to the production cutover date
  /// at P5; before it, unknown daily cash-outs stay `other` (frozen history),
  /// on/after it they default to `cash`. An explicit method memo always wins.
  private static readonly DAILY_CASH_DEFAULT_FROM =
    process.env.DAILY_CASH_DEFAULT_FROM || '2026-07-19';

  /// Method for a daily cash-out: trust an explicit memo (any date); otherwise
  /// default new entries (on/after the cutover) to cash, keeping older ones as
  /// `other` so the historical projection doesn't get relabeled.
  private dailyCashMethod(date: string, text: unknown): string {
    const parsed = this.paymentMethodFromText(text);
    if (parsed !== 'other') return parsed;
    return date >= RelationalSyncService.DAILY_CASH_DEFAULT_FROM ? 'cash' : 'other';
  }

  private purchaseDescription(po: { items: { name: string }[]; ref: string; note: string }): string {
    const names = po.items.map((it) => it.name).filter(Boolean);
    if (names.length === 1) return names[0]!;
    if (names.length > 1) return `${names[0]} +${names.length - 1} more`;
    return po.ref || po.note || 'Item purchase';
  }

  async syncPayables(branchId: string, outerTx?: Prisma.TransactionClient): Promise<void> {
    await this.withTx(outerTx, async (tx) => {
      const derived = { source: { in: RelationalSyncService.DERIVED_SOURCES } };
      // Clear rows we own. Payments first (salary-targeted ones aren't cascaded by
      // expense deletion); deleting derived expenses cascades their items/payments.
      await tx.payment.deleteMany({ where: { branchId, ...derived } });
      await tx.expense.deleteMany({ where: { branchId, ...derived } });

      // 1. Expenses from PurchaseOrders (kind from supplier class / name map).
      const suppliers = await tx.supplier.findMany({
        where: { branchId },
        select: { id: true, name: true, bookPurpose: true },
      });
      const supplierById = new Map(suppliers.map((s) => [s.id, s]));
      const pos = await tx.purchaseOrder.findMany({
        where: { branchId },
        include: { items: { orderBy: { sortIndex: 'asc' } } },
        orderBy: { sortIndex: 'asc' },
      });
      for (const po of pos) {
        const expenseId = `exp_po_${po.id}`;
        const supplier = po.supplierId ? supplierById.get(po.supplierId) : null;
        const kind = expenseKindForSupplier({
          name: supplier?.name,
          bookPurpose: supplier?.bookPurpose,
        });
        await tx.expense.create({
          data: {
            id: expenseId,
            branchId,
            kind: kind as any,
            date: po.date,
            description: this.purchaseDescription(po),
            supplierId: po.supplierId,
            totalMinor: po.amountMinor,
            note: po.note ?? '',
            source: 'purchase',
            sortIndex: po.sortIndex,
          },
        });
        if (po.items.length) {
          await tx.expenseItem.createMany({
            data: po.items.map((it, j) => ({
              branchId,
              expenseId,
              name: it.name,
              qty: it.qty,
              unit: it.unit,
              rateMinor: it.rateMinor,
              totalMinor: it.totalMinor,
              sortIndex: j,
            })),
          });
        }
      }
      // 2. daily expense lines + salary context.
      const lines = await tx.dailyEntryExpenseLine.findMany({
        where: { branchId },
        include: { dailyEntry: { select: { date: true } } },
        orderBy: [{ dailyEntryId: 'asc' }, { sortIndex: 'asc' }],
      });

      const byEntry = new Map<string, typeof lines>();
      for (const l of lines) {
        const a = byEntry.get(l.dailyEntryId) ?? [];
        a.push(l);
        byEntry.set(l.dailyEntryId, a);
      }

      // 3. Daily regular lines. Vendor cash-outs settle via ledger FIFO below;
      // staff payouts come from the salary register (step 3b) — daily-line
      // dates mis-attribute which salary month a payout settles.
      for (const [, entryLines] of byEntry) {
        for (const line of entryLines) {
          const date = line.dailyEntry.date;
          if (line.kind !== 'regular') continue;

          const expenseId = `exp_del_${line.id}`;
          const paidMinor =
            line.paidAmountMinor != null ? line.paidAmountMinor : line.amountMinor;
          await tx.expense.create({
            data: {
              id: expenseId,
              branchId,
              kind: 'other_expense' as any,
              expenseCategoryId: line.expenseCategoryId ?? null,
              date,
              description: line.label || line.vendor || 'Expense',
              totalMinor: line.amountMinor,
              note: line.note ?? '',
              source: 'daily',
              sortIndex: line.sortIndex,
            },
          });
          if (paidMinor > 0) {
            await tx.payment.create({
              data: {
                id: `pay_del_${line.id}`,
                branchId,
                expenseId,
                date,
                amountMinor: paidMinor,
                method: this.dailyCashMethod(date, line.ledgerNote || line.note) as any,
                note: line.note ?? '',
                source: 'daily',
                sortIndex: line.sortIndex,
              },
            });
          }
        }
      }

      // 3b. Salary payouts from the salary register — SalaryPayment carries the
      // salary month each payout settles (v1 truth), so mirror it 1:1.
      const sps = await tx.salaryPayment.findMany({ where: { branchId } });
      for (const sp of sps) {
        await tx.payment.create({
          data: {
            id: `pay_sp_${sp.id}`,
            branchId,
            salaryLineId: sp.salaryLineId,
            date: sp.date,
            amountMinor: sp.amountMinor,
            method: 'cash' as any,
            note: sp.note ?? '',
            source: 'daily',
            sortIndex: sp.sortIndex,
          },
        });
      }

      // 4. Settle purchase bills from cashbook ledger payments (FIFO by date/id).
      // Matches v1 supplier account due (Σ invoices − Σ |payments|).
      const billExpenses = await tx.expense.findMany({
        where: { branchId, source: 'purchase' },
        select: { id: true, supplierId: true, date: true, totalMinor: true },
      });
      const ledgerPays = await tx.ledgerEntry.findMany({
        where: { branchId, type: 'payment' },
        select: {
          id: true,
          supplierId: true,
          date: true,
          amountMinor: true,
          memo: true,
          ref: true,
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      });
      const allocs = allocateLedgerPaymentsFifo(billExpenses, ledgerPays);
      let sort = 0;
      for (const a of allocs) {
        await tx.payment.create({
          data: {
            id: `pay_lg_${a.ledgerEntryId}_${a.expenseId}`,
            branchId,
            expenseId: a.expenseId,
            date: a.date,
            amountMinor: a.amountMinor,
            method: this.paymentMethodFromText(a.memo) as any,
            transactionId: a.transactionId,
            note: a.memo || '',
            source: 'ledger',
            sortIndex: sort++,
          },
        });
      }
    });
  }
}
