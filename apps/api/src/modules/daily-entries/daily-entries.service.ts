import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DailyEntry, Prisma } from '@prisma/client';
import {
  attachmentRefsDropped,
  collectDailyEntryAttachmentRefs,
} from '../../common/daily-entry-attachments';
import { PrismaService } from '../../prisma/prisma.service';
import { RelationalSyncService } from '../relational-sync/relational-sync.service';
import { StorageService } from '../storage/storage.service';
import { UpsertDailyEntryDto } from './dto/upsert-daily-entry.dto';

export type DailyEntryDto = {
  date: string;
  openingBalance: number;
  cashSale: number;
  bankSale: number;
  bkashSale: number;
  nagadSale: number;
  pathaoSale: number;
  foodiSale: number;
  foodpandaSale: number;
  voidSale?: number;
  voidSaleRemarks?: string;
  voidSaleAttachmentDataUrls?: string[];
  expenses: number;
  bankWithdrawn: number;
  expenseLines?: unknown[];
  remainingBalance: number;
  updatedAt: string;
  enteredBy?: string;
  isLocked: boolean;
  lockedAt?: string;
  lockedBy?: string;
};

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function mapRow(row: DailyEntry, expenseLines: unknown[] = []): DailyEntryDto {
  const voidSaleNum = decimalToNumber(row.voidSale);
  const attachments = row.voidSaleAttachmentDataUrls;
  return {
    date: row.date,
    openingBalance: decimalToNumber(row.openingBalance),
    cashSale: decimalToNumber(row.cashSale),
    bankSale: decimalToNumber(row.bankSale),
    bkashSale: decimalToNumber(row.bkashSale),
    nagadSale: decimalToNumber(row.nagadSale),
    pathaoSale: decimalToNumber(row.pathaoSale),
    foodiSale: decimalToNumber(row.foodiSale),
    foodpandaSale: decimalToNumber(row.foodpandaSale),
    ...(voidSaleNum > 0 ? { voidSale: voidSaleNum } : {}),
    ...(row.voidSaleRemarks ? { voidSaleRemarks: row.voidSaleRemarks } : {}),
    ...(Array.isArray(attachments) && attachments.length > 0
      ? { voidSaleAttachmentDataUrls: attachments as string[] }
      : {}),
    expenses: decimalToNumber(row.expenses),
    bankWithdrawn: decimalToNumber(row.bankWithdrawn),
    expenseLines,
    remainingBalance: decimalToNumber(row.remainingBalance),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.enteredByName ? { enteredBy: row.enteredByName } : {}),
    isLocked: row.isLocked,
    ...(row.lockedAt ? { lockedAt: row.lockedAt.toISOString() } : {}),
    ...(row.lockedByName ? { lockedBy: row.lockedByName } : {}),
  };
}

const MINOR = 100;
const toWhole = (minor: number) => minor / MINOR;

/// Rebuild a single JSON expense line from its relational row + items.
function buildExpenseLine(el: {
  lineId: string;
  kind: string;
  amountMinor: number;
  paidAmountMinor?: number | null;
  expenseCategoryId?: string | null;
  label: string;
  vendor: string;
  note: string;
  ledgerNote: string;
  ledgerKind: string | null;
  ledgerEmployeeLineKind: string | null;
  receiptDataUrls: unknown;
  ledgerEntryId: string | null;
  purchaseOrderId: string | null;
  employeeId: string | null;
  employeeName: string | null;
  staffLineKind: string | null;
  salaryPaymentId: string | null;
  items: {
    sourceId: string;
    name: string;
    qty: Prisma.Decimal;
    unit: string;
    rateMinor: number;
    totalMinor: number;
  }[];
}, resolved?: { vendor?: string | null; employeeName?: string | null }): Record<string, unknown> {
  const line: Record<string, unknown> = { kind: el.kind, amount: toWhole(el.amountMinor) };
  // I1: names by reference — prefer the current Supplier/Employee name over the
  // copy stored on the line, so renames propagate to past entries. Fall back to
  // the captured copy when the entity is gone (FK SET NULL) or has no link.
  const vendor = resolved?.vendor ?? el.vendor;
  const employeeName = resolved?.employeeName ?? el.employeeName;
  if (vendor) line.vendor = vendor;
  if (el.label) line.label = el.label;
  if (el.employeeId) line.employeeId = el.employeeId;
  if (employeeName) line.employeeName = employeeName;
  if (el.staffLineKind) line.staffLineKind = el.staffLineKind;
  if (el.note) line.note = el.note;
  if (el.paidAmountMinor != null) line.paidAmount = toWhole(el.paidAmountMinor);
  if (el.expenseCategoryId) line.expenseCategoryId = el.expenseCategoryId;
  if (Array.isArray(el.receiptDataUrls) && el.receiptDataUrls.length) {
    line.receiptDataUrls = el.receiptDataUrls;
  }
  if (el.lineId) line.lineId = el.lineId;
  if (el.ledgerKind) line.ledgerKind = el.ledgerKind;
  if (el.ledgerEmployeeLineKind) line.ledgerEmployeeLineKind = el.ledgerEmployeeLineKind;
  if (el.ledgerNote) line.ledgerNote = el.ledgerNote;
  if (el.ledgerEntryId || el.purchaseOrderId) {
    const link: Record<string, string> = {};
    if (el.ledgerEntryId) link.ledgerEntryId = el.ledgerEntryId;
    if (el.purchaseOrderId) link.purchaseOrderId = el.purchaseOrderId;
    line.ledgerLink = link;
  }
  if (el.salaryPaymentId) line.salaryPaymentId = el.salaryPaymentId;
  if (el.items.length) {
    line.items = el.items.map((it) => ({
      id: it.sourceId,
      name: it.name,
      qty: Number(it.qty),
      unit: it.unit,
      rate: toWhole(it.rateMinor),
      total: toWhole(it.totalMinor),
    }));
  }
  return line;
}

@Injectable()
export class DailyEntriesService {
  private readonly logger = new Logger(DailyEntriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly relationalSync: RelationalSyncService,
  ) {}

  async listForBranch(branchId: string): Promise<DailyEntryDto[]> {
    const rows = await this.prisma.dailyEntry.findMany({
      where: { branchId },
      orderBy: { date: 'desc' },
    });
    const linesByEntry = await this.expenseLinesByEntry(branchId);
    return rows.map((r) => mapRow(r, linesByEntry.get(r.id) ?? []));
  }

  async getByDate(branchId: string, date: string): Promise<DailyEntryDto | null> {
    const row = await this.prisma.dailyEntry.findUnique({
      where: { branchId_date: { branchId, date } },
    });
    if (!row) return null;
    const linesByEntry = await this.expenseLinesByEntry(branchId, row.id);
    return mapRow(row, linesByEntry.get(row.id) ?? []);
  }

  /// Assemble API-shaped expenseLines[] from relational rows.
  private async expenseLinesByEntry(
    branchId: string,
    dailyEntryId?: string,
  ): Promise<Map<string, unknown[]>> {
    const rows = await this.prisma.dailyEntryExpenseLine.findMany({
      where: { branchId, ...(dailyEntryId ? { dailyEntryId } : {}) },
      orderBy: [{ dailyEntryId: 'asc' }, { sortIndex: 'asc' }],
      include: { items: { orderBy: { sortIndex: 'asc' } } },
    });

    // I1: resolve current names by reference so renames propagate.
    const employeeIds = [...new Set(rows.map((r) => r.employeeId).filter(Boolean))] as string[];
    const ledgerEntryIds = [...new Set(rows.map((r) => r.ledgerEntryId).filter(Boolean))] as string[];
    const purchaseOrderIds = [...new Set(rows.map((r) => r.purchaseOrderId).filter(Boolean))] as string[];
    const [employees, ledgerEntries, purchaseOrders] = await Promise.all([
      employeeIds.length
        ? this.prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      ledgerEntryIds.length
        ? this.prisma.ledgerEntry.findMany({ where: { id: { in: ledgerEntryIds } }, select: { id: true, supplierId: true } })
        : Promise.resolve([]),
      purchaseOrderIds.length
        ? this.prisma.purchaseOrder.findMany({ where: { id: { in: purchaseOrderIds } }, select: { id: true, supplierId: true } })
        : Promise.resolve([]),
    ]);
    const empName = new Map(employees.map((e) => [e.id, e.name]));
    const supplierIdByLedger = new Map(ledgerEntries.map((l) => [l.id, l.supplierId]));
    const supplierIdByPo = new Map(purchaseOrders.map((p) => [p.id, p.supplierId]));
    const supplierIds = [
      ...new Set(
        [...supplierIdByLedger.values(), ...supplierIdByPo.values()].filter(Boolean) as string[],
      ),
    ];
    const suppliers = supplierIds.length
      ? await this.prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } })
      : [];
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

    const map = new Map<string, unknown[]>();
    for (const el of rows) {
      const supplierId = el.ledgerEntryId
        ? supplierIdByLedger.get(el.ledgerEntryId)
        : el.purchaseOrderId
          ? supplierIdByPo.get(el.purchaseOrderId)
          : null;
      const resolved = {
        vendor: supplierId ? supplierName.get(supplierId) ?? null : null,
        employeeName: el.employeeId ? empName.get(el.employeeId) ?? null : null,
      };
      const list = map.get(el.dailyEntryId) ?? [];
      list.push(buildExpenseLine(el, resolved));
      map.set(el.dailyEntryId, list);
    }
    return map;
  }

  async upsert(
    branchId: string,
    staffId: string,
    dto: UpsertDailyEntryDto,
  ): Promise<DailyEntryDto> {
    await this.prepareUpsert(branchId, dto);

    const row = await this.prisma.$transaction((tx) =>
      this.upsertWithinTx(tx, branchId, staffId, dto),
    );

    const expenseLines =
      (await this.expenseLinesByEntry(branchId, row.id)).get(row.id) ?? [];
    return mapRow(row, expenseLines);
  }

  /**
   * Lock guard + orphaned-attachment cleanup for a daily upsert. Runs BEFORE the
   * write transaction (the attachment delete is an external S3 side-effect that
   * must not sit inside the DB tx). Call this ahead of `upsertWithinTx`.
   */
  async prepareUpsert(branchId: string, dto: UpsertDailyEntryDto): Promise<void> {
    const existing = await this.prisma.dailyEntry.findUnique({
      where: { branchId_date: { branchId, date: dto.date } },
    });
    if (existing?.isLocked) {
      throw new ConflictException(
        'This daily entry is locked and cannot be edited.',
      );
    }
    const orphanedRefs = attachmentRefsDropped(
      existing ? collectDailyEntryAttachmentRefs(existing) : [],
      collectDailyEntryAttachmentRefs({
        voidSaleAttachmentDataUrls: dto.voidSaleAttachmentDataUrls,
        expenseLines: dto.expenseLines,
      }),
    );
    await this.deleteAttachmentRefs(branchId, orphanedRefs);
  }

  /**
   * Write the daily entry header + relational expense lines inside a
   * caller-provided transaction. Used by `upsert` and the atomic daily commit
   * (I3). Pass `deferPayables` when the caller re-projects payables once at the
   * end. Assumes `prepareUpsert` already ran.
   */
  async upsertWithinTx(
    tx: Prisma.TransactionClient,
    branchId: string,
    staffId: string,
    dto: UpsertDailyEntryDto,
    opts?: { deferPayables?: boolean },
  ): Promise<DailyEntry> {
    const voidSale =
      dto.voidSale != null && dto.voidSale > 0 ? new Prisma.Decimal(dto.voidSale) : null;

    const data = {
      openingBalance: new Prisma.Decimal(dto.openingBalance),
      cashSale: new Prisma.Decimal(dto.cashSale),
      bankSale: new Prisma.Decimal(dto.bankSale),
      bkashSale: new Prisma.Decimal(dto.bkashSale),
      nagadSale: new Prisma.Decimal(dto.nagadSale ?? 0),
      pathaoSale: new Prisma.Decimal(dto.pathaoSale),
      foodiSale: new Prisma.Decimal(dto.foodiSale),
      foodpandaSale: new Prisma.Decimal(dto.foodpandaSale),
      voidSale,
      voidSaleRemarks:
        voidSale != null && dto.voidSaleRemarks?.trim()
          ? dto.voidSaleRemarks.trim()
          : null,
      voidSaleAttachmentDataUrls: (dto.voidSaleAttachmentDataUrls ??
        []) as Prisma.InputJsonValue,
      expenses: new Prisma.Decimal(dto.expenses),
      bankWithdrawn: new Prisma.Decimal(dto.bankWithdrawn ?? 0),
      remainingBalance: new Prisma.Decimal(dto.remainingBalance),
      enteredByStaffId: staffId,
      enteredByName: dto.enteredBy?.trim() || null,
    };

    const saved = await tx.dailyEntry.upsert({
      where: { branchId_date: { branchId, date: dto.date } },
      create: { branchId, date: dto.date, ...data },
      update: data,
    });
    await this.relationalSync.syncDailyEntryExpenseLines(
      branchId,
      saved.id,
      dto.expenseLines ?? [],
      tx,
      opts,
    );
    return saved;
  }

  async lock(
    branchId: string,
    staffId: string,
    date: string,
    lockedBy?: string,
  ): Promise<DailyEntryDto> {
    const existing = await this.prisma.dailyEntry.findUnique({
      where: { branchId_date: { branchId, date } },
    });
    if (!existing) {
      throw new NotFoundException(`No daily entry for ${date}`);
    }
    if (existing.isLocked) {
      return mapRow(existing);
    }

    const row = await this.prisma.dailyEntry.update({
      where: { branchId_date: { branchId, date } },
      data: {
        isLocked: true,
        lockedAt: new Date(),
        lockedByStaffId: staffId,
        lockedByName: lockedBy?.trim() || null,
      },
    });

    return mapRow(row);
  }

  async unlock(branchId: string, date: string): Promise<DailyEntryDto> {
    const existing = await this.prisma.dailyEntry.findUnique({
      where: { branchId_date: { branchId, date } },
    });
    if (!existing) {
      throw new NotFoundException(`No daily entry for ${date}`);
    }
    if (!existing.isLocked) {
      return mapRow(existing);
    }

    const row = await this.prisma.dailyEntry.update({
      where: { branchId_date: { branchId, date } },
      data: {
        isLocked: false,
        lockedAt: null,
        lockedByStaffId: null,
        lockedByName: null,
      },
    });

    return mapRow(row);
  }

  async remove(branchId: string, date: string): Promise<void> {
    const existing = await this.prisma.dailyEntry.findUnique({
      where: { branchId_date: { branchId, date } },
    });
    if (!existing) {
      throw new NotFoundException(`No daily entry for ${date}`);
    }
    if (existing.isLocked) {
      throw new ConflictException(
        'This daily entry is locked and cannot be deleted.',
      );
    }

    await this.deleteAttachmentRefs(
      branchId,
      collectDailyEntryAttachmentRefs(existing),
    );

    // I2: this day's linked bills/POs, so we can safe-cascade the delete.
    const dayLines = await this.prisma.dailyEntryExpenseLine.findMany({
      where: { dailyEntryId: existing.id },
      select: { ledgerEntryId: true, purchaseOrderId: true },
    });
    const ledgerIds = [...new Set(dayLines.map((l) => l.ledgerEntryId).filter(Boolean))] as string[];
    const poIds = [...new Set(dayLines.map((l) => l.purchaseOrderId).filter(Boolean))] as string[];
    // PO ids that share a purchase line with a bill (so we keep them paired).
    const poPairedWithLedger = new Set(
      dayLines.filter((l) => l.ledgerEntryId && l.purchaseOrderId).map((l) => l.purchaseOrderId as string),
    );

    const summary = await this.prisma.$transaction(async (tx) => {
      // Delete the day first: cascades its expense lines, so any remaining
      // reference to a candidate bill/PO can only come from ANOTHER day.
      await tx.dailyEntry.delete({ where: { branchId_date: { branchId, date } } });

      const removedLedgerIds: string[] = [];
      const keptLedger: { id: string; reason: string }[] = [];
      for (const id of ledgerIds) {
        const le = await tx.ledgerEntry.findUnique({
          where: { id },
          select: { id: true, isLocked: true },
        });
        if (!le) continue;
        if (le.isLocked) {
          keptLedger.push({ id, reason: 'locked' });
          continue;
        }
        const usedElsewhere = await tx.dailyEntryExpenseLine.count({ where: { ledgerEntryId: id } });
        if (usedElsewhere > 0) {
          keptLedger.push({ id, reason: 'referenced by another day' });
          continue;
        }
        removedLedgerIds.push(id);
      }
      const keptLedgerIds = new Set(keptLedger.map((k) => k.id));

      const removedPoIds: string[] = [];
      for (const id of poIds) {
        const usedElsewhere = await tx.dailyEntryExpenseLine.count({ where: { purchaseOrderId: id } });
        if (usedElsewhere > 0) continue; // referenced by another day
        // Keep a PO whose paired bill is being kept, to avoid a half-removed pair.
        if (poPairedWithLedger.has(id)) {
          const stillHasKeptBill = dayLines.some(
            (l) => l.purchaseOrderId === id && l.ledgerEntryId && keptLedgerIds.has(l.ledgerEntryId),
          );
          if (stillHasKeptBill) continue;
        }
        removedPoIds.push(id);
      }

      if (removedLedgerIds.length) {
        await tx.ledgerEntry.deleteMany({ where: { branchId, id: { in: removedLedgerIds } } });
      }
      if (removedPoIds.length) {
        await tx.purchaseOrder.deleteMany({ where: { branchId, id: { in: removedPoIds } } });
      }

      // Salary side: remove the staff payouts this day posted to the register
      // (identified by dailyEntryDate), skipping any that landed in a locked month.
      const dayPayouts = await tx.salaryPayment.findMany({
        where: { branchId, dailyEntryDate: date },
        select: { id: true, salaryLine: { select: { salaryMonth: { select: { isLocked: true } } } } },
      });
      const removablePayoutIds = dayPayouts
        .filter((p) => !p.salaryLine?.salaryMonth?.isLocked)
        .map((p) => p.id);
      const keptPayouts = dayPayouts.length - removablePayoutIds.length;
      if (removablePayoutIds.length) {
        await tx.salaryPayment.deleteMany({ where: { id: { in: removablePayoutIds } } });
      }

      // Re-project payables from the remaining POs + lines (drops the deleted day's
      // derived rows and any expense for a removed PO).
      await this.relationalSync.syncPayables(branchId, tx);
      return {
        removedBills: removedLedgerIds.length,
        removedPurchaseOrders: removedPoIds.length,
        removedPayouts: removablePayoutIds.length,
        keptPayouts,
        kept: keptLedger,
      };
    });

    if (summary.kept.length || summary.removedPayouts || summary.keptPayouts) {
      this.logger.log(
        `Deleted daily entry ${date}: removed ${summary.removedBills} bill(s), ` +
          `${summary.removedPurchaseOrders} PO(s), ${summary.removedPayouts} payout(s); ` +
          `kept ${summary.kept.length} bill(s) (${summary.kept.map((k) => k.reason).join(', ') || 'none'}), ` +
          `${summary.keptPayouts} payout(s) in locked months.`,
      );
    }
  }

  private async deleteAttachmentRefs(
    branchId: string,
    refs: readonly string[],
  ): Promise<void> {
    if (refs.length === 0) return;

    await Promise.all(
      refs.map(async (ref) => {
        try {
          await this.storage.deletePersistedRef(branchId, ref);
        } catch (error) {
          this.logger.warn(
            `Failed to delete attachment ref ${ref} for branch ${branchId}: ${error}`,
          );
        }
      }),
    );
  }
}
