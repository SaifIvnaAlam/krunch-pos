import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DailyEntry, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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

function mapRow(row: DailyEntry): DailyEntryDto {
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
    ...(row.expenseLines != null ? { expenseLines: row.expenseLines as unknown[] } : {}),
    remainingBalance: decimalToNumber(row.remainingBalance),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.enteredByName ? { enteredBy: row.enteredByName } : {}),
    isLocked: row.isLocked,
    ...(row.lockedAt ? { lockedAt: row.lockedAt.toISOString() } : {}),
    ...(row.lockedByName ? { lockedBy: row.lockedByName } : {}),
  };
}

@Injectable()
export class DailyEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForBranch(branchId: string): Promise<DailyEntryDto[]> {
    const rows = await this.prisma.dailyEntry.findMany({
      where: { branchId },
      orderBy: { date: 'desc' },
    });
    return rows.map(mapRow);
  }

  async getByDate(branchId: string, date: string): Promise<DailyEntryDto | null> {
    const row = await this.prisma.dailyEntry.findUnique({
      where: { branchId_date: { branchId, date } },
    });
    return row ? mapRow(row) : null;
  }

  async upsert(
    branchId: string,
    staffId: string,
    dto: UpsertDailyEntryDto,
  ): Promise<DailyEntryDto> {
    const existing = await this.prisma.dailyEntry.findUnique({
      where: { branchId_date: { branchId, date: dto.date } },
    });
    if (existing?.isLocked) {
      throw new ConflictException(
        'This daily entry is locked and cannot be edited.',
      );
    }

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
      expenseLines: (dto.expenseLines ?? []) as Prisma.InputJsonValue,
      remainingBalance: new Prisma.Decimal(dto.remainingBalance),
      enteredByStaffId: staffId,
      enteredByName: dto.enteredBy?.trim() || null,
    };

    const row = await this.prisma.dailyEntry.upsert({
      where: { branchId_date: { branchId, date: dto.date } },
      create: { branchId, date: dto.date, ...data },
      update: data,
    });

    return mapRow(row);
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

    await this.prisma.dailyEntry.delete({
      where: { branchId_date: { branchId, date } },
    });
  }
}
