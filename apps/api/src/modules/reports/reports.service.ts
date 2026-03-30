import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReportDateRange {
  startDate: string;
  endDate: string;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDailySales(branchId: string, range: ReportDateRange) {
    const orders = await this.prisma.order.findMany({
      where: {
        branchId,
        status: 'PAID',
        createdAt: {
          gte: new Date(range.startDate),
          lte: new Date(range.endDate),
        },
      },
      include: { payments: true },
    });

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const paymentBreakdown: Record<string, { count: number; total: number }> = {};
    for (const order of orders) {
      for (const payment of order.payments) {
        if (payment.status === 'COMPLETED') {
          const method = payment.method;
          if (!paymentBreakdown[method]) {
            paymentBreakdown[method] = { count: 0, total: 0 };
          }
          paymentBreakdown[method]!.count++;
          paymentBreakdown[method]!.total += Number(payment.amount);
        }
      }
    }

    return {
      branchId,
      period: range,
      totalRevenue: totalRevenue.toFixed(2),
      totalOrders,
      averageOrderValue: avgOrderValue.toFixed(2),
      paymentBreakdown,
    };
  }

  async getItemPerformance(branchId: string, range: ReportDateRange) {
    const orders = await this.prisma.order.findMany({
      where: {
        branchId,
        status: { not: 'VOIDED' },
        createdAt: {
          gte: new Date(range.startDate),
          lte: new Date(range.endDate),
        },
      },
      include: {
        items: {
          where: { voidedAt: null },
          include: { menuItem: { select: { id: true, name: true, category: true } } },
        },
      },
    });

    const itemStats = new Map<string, { name: string; category: string; quantity: number; revenue: number }>();

    for (const order of orders) {
      for (const item of order.items) {
        const key = item.menuItemId;
        const existing = itemStats.get(key);
        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += Number(item.unitPrice) * item.quantity;
        } else {
          itemStats.set(key, {
            name: item.menuItem.name,
            category: item.menuItem.category,
            quantity: item.quantity,
            revenue: Number(item.unitPrice) * item.quantity,
          });
        }
      }
    }

    return Array.from(itemStats.entries())
      .map(([id, stats]) => ({
        menuItemId: id,
        ...stats,
        revenue: stats.revenue.toFixed(2),
      }))
      .sort((a, b) => b.quantity - a.quantity);
  }

  async getStaffPerformance(branchId: string, range: ReportDateRange) {
    const orders = await this.prisma.order.findMany({
      where: {
        branchId,
        createdAt: {
          gte: new Date(range.startDate),
          lte: new Date(range.endDate),
        },
      },
      include: {
        staff: { select: { id: true, name: true } },
      },
    });

    const staffStats = new Map<string, { name: string; ordersCreated: number; ordersVoided: number; totalRevenue: number }>();

    for (const order of orders) {
      const key = order.staffId;
      const existing = staffStats.get(key);
      if (existing) {
        existing.ordersCreated++;
        if (order.status === 'VOIDED') existing.ordersVoided++;
        if (order.status === 'PAID') existing.totalRevenue += Number(order.totalAmount);
      } else {
        staffStats.set(key, {
          name: order.staff.name,
          ordersCreated: 1,
          ordersVoided: order.status === 'VOIDED' ? 1 : 0,
          totalRevenue: order.status === 'PAID' ? Number(order.totalAmount) : 0,
        });
      }
    }

    return Array.from(staffStats.entries())
      .map(([id, stats]) => ({
        staffId: id,
        ...stats,
        totalRevenue: stats.totalRevenue.toFixed(2),
      }))
      .sort((a, b) => Number(b.totalRevenue) - Number(a.totalRevenue));
  }

  async getVoidsAndDiscounts(branchId: string, range: ReportDateRange) {
    const [voidedOrders, auditLogs] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          branchId,
          status: 'VOIDED',
          updatedAt: {
            gte: new Date(range.startDate),
            lte: new Date(range.endDate),
          },
        },
        include: { staff: { select: { id: true, name: true } } },
      }),
      this.prisma.auditLog.findMany({
        where: {
          branchId,
          action: { in: ['ORDER_VOID', 'ORDER_DISCOUNT', 'KITCHEN_VOID_ITEM'] },
          createdAt: {
            gte: new Date(range.startDate),
            lte: new Date(range.endDate),
          },
        },
        include: { staff: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      voidedOrders: voidedOrders.map((o) => ({
        orderId: o.id,
        staffName: o.staff.name,
        totalAmount: Number(o.totalAmount).toFixed(2),
        createdAt: o.createdAt,
      })),
      auditEntries: auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        staffName: log.staff.name,
        resource: log.resource,
        overrideBy: log.overrideBy,
        metadata: log.metadata,
        createdAt: log.createdAt,
      })),
      summary: {
        totalVoids: voidedOrders.length,
        totalVoidValue: voidedOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0).toFixed(2),
        discountCount: auditLogs.filter((l) => l.action === 'ORDER_DISCOUNT').length,
      },
    };
  }
}
