import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertSalaryWorkspaceDto } from './dto/upsert-salary-workspace.dto';

export type SalaryWorkspaceDto = {
  selectedMonthKey: string;
  months: Record<string, unknown>;
  updatedAt: string;
};

const MONTH_KEY = /^\d{4}-\d{2}$/;

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

function coerceBundle(raw: unknown): SalaryWorkspaceDto | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const selectedMonthKey =
    typeof o.selectedMonthKey === 'string' && MONTH_KEY.test(o.selectedMonthKey)
      ? o.selectedMonthKey
      : null;
  const monthsRaw = o.months;
  if (!selectedMonthKey || !monthsRaw || typeof monthsRaw !== 'object' || Array.isArray(monthsRaw)) {
    return null;
  }

  const months: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(monthsRaw as Record<string, unknown>)) {
    if (!MONTH_KEY.test(k) || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const doc = v as Record<string, unknown>;
    const rows = doc.rows;
    if (!Array.isArray(rows) || rows.length === 0) continue;
    months[k] = v;
  }

  if (Object.keys(months).length === 0) return null;

  if (!months[selectedMonthKey]) {
    months[selectedMonthKey] = months[Object.keys(months)[0]!];
  }

  const updatedAt =
    typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString();

  return { selectedMonthKey, months, updatedAt };
}

function mapRow(row: { bundle: unknown; updatedAt: Date }): SalaryWorkspaceDto {
  const coerced = coerceBundle(row.bundle);
  if (coerced) {
    return { ...coerced, updatedAt: row.updatedAt.toISOString() };
  }
  return { ...emptyBundle(), updatedAt: row.updatedAt.toISOString() };
}

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspace(branchId: string): Promise<SalaryWorkspaceDto> {
    const row = await this.prisma.branchSalaryWorkspace.findUnique({
      where: { branchId },
    });
    return row ? mapRow(row) : emptyBundle();
  }

  async upsertWorkspace(
    branchId: string,
    dto: UpsertSalaryWorkspaceDto,
  ): Promise<SalaryWorkspaceDto> {
    const bundle = {
      selectedMonthKey: dto.selectedMonthKey,
      months: dto.months,
    };

    const row = await this.prisma.branchSalaryWorkspace.upsert({
      where: { branchId },
      create: {
        branchId,
        bundle: bundle as Prisma.InputJsonValue,
      },
      update: {
        bundle: bundle as Prisma.InputJsonValue,
      },
    });

    return mapRow(row);
  }
}
