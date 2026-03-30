import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class KitchenService {
  private readonly logger = new Logger(KitchenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getKitchenQueue(branchId: string) {
    return this.prisma.order.findMany({
      where: {
        branchId,
        status: { in: ['SENT_TO_KITCHEN', 'OPEN'] },
      },
      include: {
        items: {
          where: { voidedAt: null },
          include: {
            menuItem: { select: { id: true, name: true, category: true } },
          },
        },
        staff: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markReady(orderId: string, staffId: string, branchId: string, terminalId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.branchId !== branchId) throw new NotFoundException('Order not found');
    if (order.status !== 'SENT_TO_KITCHEN') {
      throw new BadRequestException('Only orders sent to kitchen can be marked ready');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'READY' },
    });

    await this.audit.log({
      staffId, action: 'KITCHEN_READY', resource: orderId, branchId, terminalId, result: 'SUCCESS',
    });

    return updated;
  }

  async voidItem(
    orderId: string,
    itemId: string,
    reason: string,
    staffId: string,
    branchId: string,
    terminalId: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.branchId !== branchId) throw new NotFoundException('Order not found');

    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');
    if (item.voidedAt) throw new BadRequestException('Item already voided');

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { voidedAt: new Date(), voidedBy: staffId },
    });

    const activeItems = order.items.filter((i) => i.id !== itemId && !i.voidedAt);
    const newTotal = activeItems.reduce(
      (sum, i) => sum + Number(i.unitPrice) * i.quantity,
      0,
    );

    await this.prisma.order.update({
      where: { id: orderId },
      data: { totalAmount: newTotal },
    });

    await this.audit.log({
      staffId, action: 'KITCHEN_VOID_ITEM', resource: itemId, branchId, terminalId, result: 'SUCCESS',
      metadata: { orderId, reason },
    });

    return { orderId, itemId, voided: true };
  }
}
