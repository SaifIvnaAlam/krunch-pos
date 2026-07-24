import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { derivePaidDue, toWhole } from '../expenses/expense.util';
import { ReportQueryDto } from './dto/report-query.dto';

type Bucket = { totalMinor: number; paidMinor: number; dueMinor: number };

const KIND_LABEL: Record<string, string> = {
  item_purchase: 'Item Purchases',
  other_expense: 'Other Expenses',
};

function emptyBucket(): Bucket {
  return { totalMinor: 0, paidMinor: 0, dueMinor: 0 };
}

function addTo(map: Map<string, Bucket>, key: string, d: Bucket) {
  const b = map.get(key) ?? emptyBucket();
  b.totalMinor += d.totalMinor;
  b.paidMinor += d.paidMinor;
  b.dueMinor += d.dueMinor;
  map.set(key, b);
}

function toRows(map: Map<string, { label: string; bucket: Bucket }>) {
  return [...map.entries()]
    .map(([key, { label, bucket }]) => ({
      key,
      label,
      total: toWhole(bucket.totalMinor),
      paid: toWhole(bucket.paidMinor),
      due: toWhole(bucket.dueMinor),
    }))
    .sort((a, b) => b.total - a.total);
}

@Injectable()
export class ExpenseReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(branchId: string, q: ReportQueryDto) {
    const totals = emptyBucket();
    const byCategory = new Map<string, { label: string; bucket: Bucket }>();
    // High-level rollup by the three groups (item purchase / other expense /
    // salary). Used by the All Expenses overview, which shows group totals
    // rather than the per-category breakdown.
    const byKind = new Map<string, { label: string; bucket: Bucket }>();
    const byMonth = new Map<string, Bucket>();

    const bumpKind = (kindKey: string, kindLabel: string, d: Bucket) => {
      const k = byKind.get(kindKey) ?? { label: kindLabel, bucket: emptyBucket() };
      k.bucket.totalMinor += d.totalMinor;
      k.bucket.paidMinor += d.paidMinor;
      k.bucket.dueMinor += d.dueMinor;
      byKind.set(kindKey, k);
    };

    const bump = (
      catKey: string,
      catLabel: string,
      month: string,
      d: Bucket,
    ) => {
      totals.totalMinor += d.totalMinor;
      totals.paidMinor += d.paidMinor;
      totals.dueMinor += d.dueMinor;
      const cat = byCategory.get(catKey) ?? { label: catLabel, bucket: emptyBucket() };
      cat.bucket.totalMinor += d.totalMinor;
      cat.bucket.paidMinor += d.paidMinor;
      cat.bucket.dueMinor += d.dueMinor;
      byCategory.set(catKey, cat);
      if (month) addTo(byMonth, month, d);
    };

    // --- Expenses (item purchases + other expenses) ---
    const where: Prisma.ExpenseWhereInput = { branchId };
    if (q.from || q.to) {
      where.date = {};
      if (q.from) (where.date as Prisma.StringFilter).gte = q.from;
      if (q.to) (where.date as Prisma.StringFilter).lte = q.to;
    }
    const expenses = await this.prisma.expense.findMany({
      where,
      select: {
        kind: true,
        date: true,
        totalMinor: true,
        expenseCategoryId: true,
        category: { select: { name: true } },
        payments: { select: { amountMinor: true } },
        returns: { select: { creditMinor: true } },
      },
    });

    for (const e of expenses) {
      const paidMinor = e.payments.reduce((s, p) => s + p.amountMinor, 0);
      const creditMinor = e.returns.reduce((s, r) => s + r.creditMinor, 0);
      const derived = derivePaidDue(e.totalMinor, paidMinor, creditMinor);
      const owedMinor = Math.max(0, e.totalMinor - creditMinor);
      const d: Bucket = {
        totalMinor: owedMinor,
        paidMinor: derived.paidMinor,
        dueMinor: derived.dueMinor,
      };
      const catKey = e.expenseCategoryId ?? e.kind;
      const catLabel = e.category?.name ?? KIND_LABEL[e.kind] ?? e.kind;
      bump(catKey, catLabel, e.date.slice(0, 7), d);
      bumpKind(e.kind, KIND_LABEL[e.kind] ?? e.kind, d);
    }

    // --- Salaries (SalaryLine payable, paid via unified Payment) ---
    const monthWhere: Prisma.SalaryMonthWhereInput = { branchId };
    if (q.from || q.to) {
      monthWhere.monthKey = {};
      if (q.from) (monthWhere.monthKey as Prisma.StringFilter).gte = q.from.slice(0, 7);
      if (q.to) (monthWhere.monthKey as Prisma.StringFilter).lte = q.to.slice(0, 7);
    }
    const months = await this.prisma.salaryMonth.findMany({
      where: monthWhere,
      select: {
        monthKey: true,
        lines: {
          select: {
            basicMinor: true,
            serviceChargeMinor: true,
            overtimeMinor: true,
            eidBonusMinor: true,
            finesMinor: true,
            unifiedPayments: { select: { amountMinor: true } },
          },
        },
      },
    });

    for (const m of months) {
      for (const l of m.lines) {
        const totalMinor =
          l.basicMinor +
          l.serviceChargeMinor +
          l.overtimeMinor +
          l.eidBonusMinor +
          l.finesMinor;
        const paidMinor = l.unifiedPayments.reduce((s, p) => s + p.amountMinor, 0);
        const derived = derivePaidDue(totalMinor, paidMinor, 0);
        const d: Bucket = {
          totalMinor: Math.max(0, totalMinor),
          paidMinor: derived.paidMinor,
          dueMinor: derived.dueMinor,
        };
        bump('salary', 'Salary', m.monthKey, d);
        bumpKind('salary', 'Salary', d);
      }
    }

    const byMonthRows = [...byMonth.entries()]
      .map(([month, b]) => ({
        month,
        total: toWhole(b.totalMinor),
        paid: toWhole(b.paidMinor),
        due: toWhole(b.dueMinor),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      range: { from: q.from ?? null, to: q.to ?? null },
      totals: {
        total: toWhole(totals.totalMinor),
        paid: toWhole(totals.paidMinor),
        due: toWhole(totals.dueMinor),
      },
      byCategory: toRows(byCategory),
      byKind: toRows(byKind),
      byMonth: byMonthRows,
    };
  }
}
