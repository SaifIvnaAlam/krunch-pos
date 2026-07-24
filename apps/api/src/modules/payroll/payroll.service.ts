import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RelationalSyncService } from '../relational-sync/relational-sync.service';
import { UpsertSalaryWorkspaceDto } from './dto/upsert-salary-workspace.dto';

export type SalaryWorkspaceDto = {
  selectedMonthKey: string;
  months: Record<string, unknown>;
  updatedAt: string;
};

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function emptyBundle(monthKey = currentMonthKey()): SalaryWorkspaceDto {
  const t = new Date().toISOString();
  return {
    selectedMonthKey: monthKey,
    months: {
      [monthKey]: {
        periodLabel: monthKey,
        rows: [
          {
            id: randomUUID(),
            name: '',
            basic: 0,
            pct: null,
            serviceCharge: 0,
            overtime: 0,
            eidBonus: 0,
            fines: 0,
            payments: [],
          },
        ],
        updatedAt: t,
      },
    },
    updatedAt: t,
  };
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationalSync: RelationalSyncService,
  ) {}

  async getWorkspace(branchId: string): Promise<SalaryWorkspaceDto> {
    const assembled = await this.assembleFromRelational(branchId);
    return assembled ?? emptyBundle();
  }

  private async assembleFromRelational(
    branchId: string,
  ): Promise<SalaryWorkspaceDto | null> {
    const months = await this.prisma.salaryMonth.findMany({
      where: { branchId },
      include: {
        lines: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { payments: { orderBy: [{ createdAt: 'asc' }, { date: 'asc' }] } },
        },
      },
    });
    if (months.length === 0) return null;

    const toWhole = (minor: number) => minor / 100;
    const monthsObj: Record<string, unknown> = {};
    let latestUpdated = new Date(0);

    for (const m of months) {
      if (m.updatedAt > latestUpdated) latestUpdated = m.updatedAt;
      monthsObj[m.monthKey] = {
        periodLabel: m.periodLabel,
        rows: m.lines.map((l) => ({
          id: l.id,
          employeeId: l.employeeId ?? '',
          name: l.name,
          basic: toWhole(l.basicMinor),
          pct: l.pct == null ? null : Number(l.pct),
          serviceCharge: toWhole(l.serviceChargeMinor),
          overtime: toWhole(l.overtimeMinor),
          eidBonus: toWhole(l.eidBonusMinor),
          fines: toWhole(l.finesMinor),
          payments: l.payments.map((p) => ({
            id: p.id,
            amount: toWhole(p.amountMinor),
            date: p.date,
            ...(p.note ? { note: p.note } : {}),
            ...(p.dailyEntryLineId ? { dailyEntryLineId: p.dailyEntryLineId } : {}),
            ...(p.dailyEntryDate ? { dailyEntryDate: p.dailyEntryDate } : {}),
            ...(p.postedEmployeeLineKind
              ? { postedEmployeeLineKind: p.postedEmployeeLineKind }
              : {}),
          })),
        })),
        updatedAt: m.updatedAt.toISOString(),
        ...(m.serviceChargePoolMinor != null
          ? { serviceChargePool: toWhole(m.serviceChargePoolMinor) }
          : {}),
        ...(m.isLocked ? { isLocked: true } : {}),
        ...(m.lockedAt ? { lockedAt: m.lockedAt.toISOString() } : {}),
        ...(m.lockedBy ? { lockedBy: m.lockedBy } : {}),
      };
    }

    // `YYYY-MM` sorts lexicographically; pick the most recent month as selected.
    const selectedMonthKey = Object.keys(monthsObj).sort().slice(-1)[0]!;
    return {
      selectedMonthKey,
      months: monthsObj,
      updatedAt: latestUpdated.toISOString(),
    };
  }

  async upsertWorkspace(
    branchId: string,
    dto: UpsertSalaryWorkspaceDto,
  ): Promise<SalaryWorkspaceDto> {
    await this.prisma.$transaction((tx) => this.writeWithinTx(tx, branchId, dto));
    return this.getWorkspace(branchId);
  }

  /**
   * Persist salary workspace into relational tables inside a caller-provided
   * transaction. Used by `upsertWorkspace` and the atomic daily commit (I3).
   * Pass `deferPayables` when the caller re-projects payables once at the end.
   */
  async writeWithinTx(
    tx: Prisma.TransactionClient,
    branchId: string,
    dto: UpsertSalaryWorkspaceDto,
    opts?: { deferPayables?: boolean },
  ): Promise<void> {
    await this.relationalSync.syncSalaryWorkspace(
      branchId,
      { months: dto.months as Record<string, unknown> },
      tx,
      opts,
    );
  }
}
