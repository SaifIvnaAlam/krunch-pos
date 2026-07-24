import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QuickExpenseDto } from './dto/quick-expense.dto';
import { ExpenseItemDto } from './dto/expense-item.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { derivePaidDue, PaymentStatus, toMinor, toWhole } from './expense.util';

const TX_OPTS = { timeout: 30000, maxWait: 10000 } as const;

type ExpenseSummaryDto = {
  id: string;
  kind: string;
  date: string;
  description: string;
  expenseCategoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  total: number;
  paid: number;
  due: number;
  status: PaymentStatus;
  note: string;
  /// Row ownership: `manual` rows are editable in Payables; anything else is a
  /// projection maintained by RelationalSyncService and is read-only here.
  source: string;
  editable: boolean;
  itemCount: number;
  paymentCount: number;
  items: {
    id: string;
    name: string;
    qty: number;
    unit: string;
    rate: number;
    total: number;
  }[];
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForBranch(
    branchId: string,
    q: ListExpensesQueryDto,
  ): Promise<ExpenseSummaryDto[]> {
    const where: Prisma.ExpenseWhereInput = { branchId };
    if (q.kind) where.kind = q.kind as any;
    if (q.expenseCategoryId) where.expenseCategoryId = q.expenseCategoryId;
    if (q.supplierId) where.supplierId = q.supplierId;
    if (q.from || q.to) {
      where.date = {};
      if (q.from) (where.date as Prisma.StringFilter).gte = q.from;
      if (q.to) (where.date as Prisma.StringFilter).lte = q.to;
    }

    const rows = await this.prisma.expense.findMany({
      where,
      orderBy: [{ date: 'desc' }, { sortIndex: 'asc' }, { createdAt: 'asc' }],
      include: {
        category: { select: { name: true } },
        supplier: { select: { name: true } },
        payments: { select: { amountMinor: true } },
        returns: { select: { creditMinor: true } },
        items: { orderBy: { sortIndex: 'asc' } },
        _count: { select: { items: true } },
      },
    });

    const mapped = rows.map((e) => {
      const paidMinor = e.payments.reduce((s, p) => s + p.amountMinor, 0);
      const creditMinor = e.returns.reduce((s, r) => s + r.creditMinor, 0);
      const derived = derivePaidDue(e.totalMinor, paidMinor, creditMinor);
      const summary: ExpenseSummaryDto = {
        id: e.id,
        kind: e.kind,
        date: e.date,
        description: e.description,
        expenseCategoryId: e.expenseCategoryId,
        categoryName: e.category?.name ?? null,
        supplierId: e.supplierId,
        supplierName: e.supplier?.name ?? null,
        total: toWhole(e.totalMinor),
        paid: toWhole(derived.paidMinor),
        due: toWhole(derived.dueMinor),
        status: derived.status,
        note: e.note,
        source: e.source,
        editable: e.source === 'manual',
        itemCount: e._count.items,
        paymentCount: e.payments.length,
        items: e.items.map((it) => ({
          id: it.id,
          name: it.name,
          qty: Number(it.qty),
          unit: it.unit,
          rate: toWhole(it.rateMinor),
          total: toWhole(it.totalMinor),
        })),
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      };
      return summary;
    });

    return q.status ? mapped.filter((m) => m.status === q.status) : mapped;
  }

  async getOne(branchId: string, id: string) {
    const e = await this.prisma.expense.findFirst({
      where: { id, branchId },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        items: { orderBy: { sortIndex: 'asc' } },
        payments: { orderBy: [{ date: 'asc' }, { sortIndex: 'asc' }] },
        returns: { orderBy: { sortIndex: 'asc' } },
        attachments: { orderBy: { sortIndex: 'asc' } },
      },
    });
    if (!e) throw new NotFoundException('Expense not found.');

    const paidMinor = e.payments.reduce((s, p) => s + p.amountMinor, 0);
    const creditMinor = e.returns.reduce((s, r) => s + r.creditMinor, 0);
    const derived = derivePaidDue(e.totalMinor, paidMinor, creditMinor);

    return {
      id: e.id,
      kind: e.kind,
      date: e.date,
      description: e.description,
      expenseCategoryId: e.expenseCategoryId,
      categoryName: e.category?.name ?? null,
      supplierId: e.supplierId,
      supplierName: e.supplier?.name ?? null,
      total: toWhole(e.totalMinor),
      paid: toWhole(derived.paidMinor),
      due: toWhole(derived.dueMinor),
      creditTotal: toWhole(creditMinor),
      status: derived.status,
      note: e.note,
      source: e.source,
      editable: e.source === 'manual',
      items: e.items.map((it) => ({
        id: it.id,
        name: it.name,
        qty: Number(it.qty),
        unit: it.unit,
        rate: toWhole(it.rateMinor),
        total: toWhole(it.totalMinor),
      })),
      payments: e.payments.map((p) => ({
        id: p.id,
        date: p.date,
        amount: toWhole(p.amountMinor),
        method: p.method,
        transactionId: p.transactionId,
        note: p.note,
      })),
      returns: e.returns.map((r) => ({
        id: r.id,
        date: r.date,
        reason: r.reason,
        credit: toWhole(r.creditMinor),
      })),
      attachments: e.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        dataUrl: a.dataUrl,
      })),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  async create(branchId: string, dto: CreateExpenseDto) {
    await this.assertRefs(branchId, dto.supplierId, dto.expenseCategoryId);
    const paidNow = dto.paidAmount ?? 0;
    if (paidNow > dto.total) {
      throw new BadRequestException('paidAmount cannot exceed total.');
    }
    const sortIndex = await this.prisma.expense.count({ where: { branchId } });
    const created = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          branchId,
          kind: dto.kind as any,
          date: dto.date,
          description: dto.description?.trim() ?? '',
          expenseCategoryId: dto.expenseCategoryId ?? null,
          supplierId: dto.supplierId ?? null,
          totalMinor: toMinor(dto.total),
          note: dto.note?.trim() ?? '',
          sortIndex,
        },
      });
      await this.writeItems(tx, branchId, expense.id, dto.items);
      if (paidNow > 0) {
        await tx.payment.create({
          data: {
            branchId,
            expenseId: expense.id,
            date: dto.date,
            amountMinor: toMinor(paidNow),
            method: (dto.method ?? 'cash') as any,
            transactionId: dto.transactionId?.trim() ?? '',
            sortIndex: 0,
          },
        });
      }
      return expense;
    }, TX_OPTS);
    return this.getOne(branchId, created.id);
  }

  async update(branchId: string, id: string, dto: UpdateExpenseDto) {
    await this.ensureManual(branchId, id);
    await this.assertRefs(
      branchId,
      dto.supplierId ?? undefined,
      dto.expenseCategoryId ?? undefined,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.expense.update({
        where: { id },
        data: {
          ...(dto.date !== undefined ? { date: dto.date } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
          ...(dto.expenseCategoryId !== undefined
            ? { expenseCategoryId: dto.expenseCategoryId ?? null }
            : {}),
          ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId ?? null } : {}),
          ...(dto.total !== undefined ? { totalMinor: toMinor(dto.total) } : {}),
          ...(dto.note !== undefined ? { note: dto.note.trim() } : {}),
        },
      });
      if (dto.items !== undefined) {
        await tx.expenseItem.deleteMany({ where: { expenseId: id } });
        await this.writeItems(tx, branchId, id, dto.items);
      }
    }, TX_OPTS);
    return this.getOne(branchId, id);
  }

  async remove(branchId: string, id: string): Promise<void> {
    await this.ensureManual(branchId, id);
    const paymentCount = await this.prisma.payment.count({ where: { expenseId: id } });
    if (paymentCount > 0) {
      throw new ConflictException(
        'Delete the payments on this expense before deleting the expense.',
      );
    }
    await this.prisma.expense.delete({ where: { id } });
  }

  /** One-tap: create an expense and settle it with a single payment. */
  async quick(branchId: string, dto: QuickExpenseDto) {
    await this.assertRefs(branchId, dto.supplierId, dto.expenseCategoryId);
    const paid = dto.paidAmount ?? dto.total;
    if (paid > dto.total) {
      throw new BadRequestException('paidAmount cannot exceed total.');
    }
    const sortIndex = await this.prisma.expense.count({ where: { branchId } });
    const created = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          branchId,
          kind: (dto.kind ?? 'other_expense') as any,
          date: dto.date,
          description: dto.description?.trim() ?? '',
          expenseCategoryId: dto.expenseCategoryId ?? null,
          supplierId: dto.supplierId ?? null,
          totalMinor: toMinor(dto.total),
          note: dto.note?.trim() ?? '',
          sortIndex,
        },
      });
      if (paid > 0) {
        await tx.payment.create({
          data: {
            branchId,
            expenseId: expense.id,
            date: dto.date,
            amountMinor: toMinor(paid),
            method: dto.method as any,
            transactionId: dto.transactionId?.trim() ?? '',
            sortIndex: 0,
          },
        });
      }
      return expense;
    }, TX_OPTS);
    return this.getOne(branchId, created.id);
  }

  private async writeItems(
    tx: Prisma.TransactionClient,
    branchId: string,
    expenseId: string,
    items?: ExpenseItemDto[],
  ): Promise<void> {
    if (!items?.length) return;
    await tx.expenseItem.createMany({
      data: items.map((it, i) => ({
        branchId,
        expenseId,
        name: it.name?.trim() ?? '',
        qty: new Prisma.Decimal(it.qty ?? 0),
        unit: it.unit?.trim() ?? '',
        rateMinor: toMinor(it.rate ?? 0),
        totalMinor: toMinor(it.total),
        sortIndex: i,
      })),
    });
  }

  private async assertRefs(
    branchId: string,
    supplierId?: string,
    expenseCategoryId?: string,
  ): Promise<void> {
    if (supplierId) {
      const s = await this.prisma.supplier.findFirst({
        where: { id: supplierId, branchId },
        select: { id: true },
      });
      if (!s) throw new NotFoundException('Supplier not found.');
    }
    if (expenseCategoryId) {
      const c = await this.prisma.expenseCategory.findFirst({
        where: { id: expenseCategoryId, branchId },
        select: { id: true },
      });
      if (!c) throw new NotFoundException('Expense category not found.');
    }
  }

  private async ensureOwned(branchId: string, id: string): Promise<void> {
    const row = await this.prisma.expense.findFirst({
      where: { id, branchId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Expense not found.');
  }

  /// Model A: only `manual` rows are user-authored. Derived rows (from Daily
  /// Entry / Cashbooks / salary) are projections owned by RelationalSyncService
  /// and must be changed in their source screen, never here.
  private async ensureManual(branchId: string, id: string): Promise<void> {
    const row = await this.prisma.expense.findFirst({
      where: { id, branchId },
      select: { id: true, source: true },
    });
    if (!row) throw new NotFoundException('Expense not found.');
    if (row.source !== 'manual') {
      throw new ConflictException(
        'This record is managed automatically from Daily Entry / Cashbooks and cannot be edited in Payables. Update it in its source screen.',
      );
    }
  }
}
