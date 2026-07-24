import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toMinor, toWhole } from '../expenses/expense.util';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';

type PaymentRow = {
  id: string;
  expenseId: string | null;
  salaryLineId: string | null;
  date: string;
  amountMinor: number;
  method: string;
  transactionId: string;
  note: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentDto = {
  id: string;
  expenseId: string | null;
  salaryLineId: string | null;
  date: string;
  amount: number;
  method: string;
  transactionId: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export function mapPayment(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    expenseId: row.expenseId,
    salaryLineId: row.salaryLineId,
    date: row.date,
    amount: toWhole(row.amountMinor),
    method: row.method,
    transactionId: row.transactionId,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(branchId: string, q: ListPaymentsQueryDto): Promise<PaymentDto[]> {
    const where: Prisma.PaymentWhereInput = { branchId };
    if (q.method) where.method = q.method as any;
    if (q.expenseId) where.expenseId = q.expenseId;
    if (q.salaryLineId) where.salaryLineId = q.salaryLineId;
    if (q.from || q.to) {
      where.date = {};
      if (q.from) (where.date as Prisma.StringFilter).gte = q.from;
      if (q.to) (where.date as Prisma.StringFilter).lte = q.to;
    }
    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: [{ date: 'desc' }, { sortIndex: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(mapPayment);
  }

  async create(branchId: string, dto: CreatePaymentDto): Promise<PaymentDto> {
    await this.assertExactlyOneTarget(branchId, dto.expenseId, dto.salaryLineId);
    // Model A: can't record a manual payment against a system-managed bill.
    if (dto.expenseId) {
      const exp = await this.prisma.expense.findFirst({
        where: { id: dto.expenseId, branchId },
        select: { source: true },
      });
      if (exp && exp.source !== 'manual') {
        throw new ConflictException(
          'This bill is managed automatically from Daily Entry / Cashbooks. Record the payment in its source screen, not in Payables.',
        );
      }
    }
    const sortIndex = await this.nextSortIndex(branchId, dto.expenseId, dto.salaryLineId);
    const row = await this.prisma.payment.create({
      data: {
        branchId,
        expenseId: dto.expenseId ?? null,
        salaryLineId: dto.salaryLineId ?? null,
        date: dto.date,
        amountMinor: toMinor(dto.amount),
        method: dto.method as any,
        transactionId: dto.transactionId?.trim() ?? '',
        note: dto.note?.trim() ?? '',
        sortIndex,
      },
    });
    return mapPayment(row);
  }

  async update(branchId: string, id: string, dto: UpdatePaymentDto): Promise<PaymentDto> {
    await this.ensureManual(branchId, id);
    const row = await this.prisma.payment.update({
      where: { id },
      data: {
        ...(dto.date !== undefined ? { date: dto.date } : {}),
        ...(dto.amount !== undefined ? { amountMinor: toMinor(dto.amount) } : {}),
        ...(dto.method !== undefined ? { method: dto.method as any } : {}),
        ...(dto.transactionId !== undefined ? { transactionId: dto.transactionId.trim() } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() } : {}),
      },
    });
    return mapPayment(row);
  }

  async remove(branchId: string, id: string): Promise<void> {
    await this.ensureManual(branchId, id);
    await this.prisma.payment.delete({ where: { id } });
  }

  private async assertExactlyOneTarget(
    branchId: string,
    expenseId?: string,
    salaryLineId?: string,
  ): Promise<void> {
    if (!!expenseId === !!salaryLineId) {
      throw new BadRequestException(
        'Provide exactly one of expenseId or salaryLineId.',
      );
    }
    if (expenseId) {
      const exp = await this.prisma.expense.findFirst({
        where: { id: expenseId, branchId },
        select: { id: true },
      });
      if (!exp) throw new NotFoundException('Target expense not found.');
    } else if (salaryLineId) {
      const line = await this.prisma.salaryLine.findFirst({
        where: { id: salaryLineId, branchId },
        select: { id: true },
      });
      if (!line) throw new NotFoundException('Target salary line not found.');
    }
  }

  private async nextSortIndex(
    branchId: string,
    expenseId?: string,
    salaryLineId?: string,
  ): Promise<number> {
    const where: Prisma.PaymentWhereInput = { branchId };
    if (expenseId) where.expenseId = expenseId;
    if (salaryLineId) where.salaryLineId = salaryLineId;
    return this.prisma.payment.count({ where });
  }

  private async ensureOwned(branchId: string, id: string): Promise<void> {
    const row = await this.prisma.payment.findFirst({
      where: { id, branchId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Payment not found.');
  }

  /// Model A: only `manual` payments are user-authored. Derived payments (from
  /// Daily Entry / Cashbooks / salary) are projections and read-only here.
  private async ensureManual(branchId: string, id: string): Promise<void> {
    const row = await this.prisma.payment.findFirst({
      where: { id, branchId },
      select: { id: true, source: true },
    });
    if (!row) throw new NotFoundException('Payment not found.');
    if (row.source !== 'manual') {
      throw new ConflictException(
        'This payment is managed automatically from Daily Entry / Cashbooks and cannot be edited in Payables. Update it in its source screen.',
      );
    }
  }
}
