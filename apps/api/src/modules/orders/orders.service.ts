import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { asJsonInput } from '../../common/prisma-json';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';

interface CreateOrderDto {
  tableNumber?: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    modifiers?: Record<string, unknown>;
    notes?: string;
  }>;
}

interface ModifyOrderDto {
  addItems?: Array<{
    menuItemId: string;
    quantity: number;
    modifiers?: Record<string, unknown>;
    notes?: string;
  }>;
  removeItems?: string[];
  updateItems?: Array<{
    itemId: string;
    quantity?: number;
    modifiers?: Record<string, unknown>;
    notes?: string;
  }>;
}

interface DiscountDto {
  type: 'percentage' | 'fixed';
  value: number;
  reason: string;
  overrideToken?: string;
}

interface SplitBillDto {
  splits: Array<{
    itemIds: string[];
    paymentMethod: string;
  }>;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
  ) {}

  async listOrders(
    branchId: string,
    status?: string,
  ): Promise<Array<{
    id: string;
    branchId: string;
    staffId: string;
    tableNumber: string | null;
    status: string;
    totalAmount: Decimal;
    createdAt: Date;
    updatedAt: Date;
    itemCount: number;
  }>> {
    const where: Record<string, unknown> = { branchId };
    if (status) where['status'] = status;

    const orders = await this.prisma.order.findMany({
      where,
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((o) => ({
      id: o.id,
      branchId: o.branchId,
      staffId: o.staffId,
      tableNumber: o.tableNumber,
      status: o.status,
      totalAmount: o.totalAmount,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      itemCount: o._count.items,
    }));
  }

  async getOrder(orderId: string, branchId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { menuItem: { select: { id: true, name: true, category: true } } } },
        payments: true,
        staff: { select: { id: true, name: true } },
      },
    });

    if (!order || order.branchId !== branchId) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async createOrder(
    dto: CreateOrderDto,
    staffId: string,
    branchId: string,
    terminalId: string,
  ) {
    const menuItemIds = dto.items.map((i) => i.menuItemId);
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, branchId },
    });

    if (menuItems.length !== menuItemIds.length) {
      throw new BadRequestException('One or more menu items not found in this branch');
    }

    const unavailable = menuItems.filter((mi) => !mi.isAvailable || mi.is86d);
    if (unavailable.length > 0) {
      throw new BadRequestException(
        `Unavailable items: ${unavailable.map((mi) => mi.name).join(', ')}`,
      );
    }

    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));

    let totalAmount = new Decimal(0);
    const orderItemCreates = dto.items.map((item) => {
      const menuItem = menuItemMap.get(item.menuItemId)!;
      const lineTotal = menuItem.price.mul(item.quantity);
      totalAmount = totalAmount.add(lineTotal);
      return {
        menuItem: { connect: { id: item.menuItemId } },
        quantity: item.quantity,
        unitPrice: menuItem.price,
        modifiers: asJsonInput(item.modifiers ?? undefined),
        notes: item.notes ?? null,
      };
    });

    const order = await this.prisma.order.create({
      data: {
        branchId,
        staffId,
        tableNumber: dto.tableNumber ?? null,
        totalAmount,
        items: { create: orderItemCreates },
      },
      include: { items: true },
    });

    await this.audit.log({
      staffId,
      action: 'ORDER_CREATE',
      resource: order.id,
      branchId,
      terminalId,
      result: 'SUCCESS',
      metadata: { tableNumber: dto.tableNumber, itemCount: dto.items.length, totalAmount: totalAmount.toString() },
    });

    return order;
  }

  async modifyOrder(
    orderId: string,
    dto: ModifyOrderDto,
    staffId: string,
    branchId: string,
    terminalId: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order || order.branchId !== branchId) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === 'PAID' || order.status === 'VOIDED') {
      throw new BadRequestException(`Cannot modify order in ${order.status} status`);
    }

    let newTotal = order.totalAmount;

    if (dto.removeItems && dto.removeItems.length > 0) {
      const itemsToRemove = order.items.filter((i) => dto.removeItems!.includes(i.id));
      for (const item of itemsToRemove) {
        newTotal = newTotal.sub(item.unitPrice.mul(item.quantity));
      }
      await this.prisma.orderItem.deleteMany({
        where: { id: { in: dto.removeItems }, orderId },
      });
    }

    if (dto.addItems && dto.addItems.length > 0) {
      const menuItemIds = dto.addItems.map((i) => i.menuItemId);
      const menuItems = await this.prisma.menuItem.findMany({
        where: { id: { in: menuItemIds }, branchId },
      });
      const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));

      for (const item of dto.addItems) {
        const menuItem = menuItemMap.get(item.menuItemId);
        if (!menuItem) throw new BadRequestException(`Menu item ${item.menuItemId} not found`);
        if (!menuItem.isAvailable || menuItem.is86d) throw new BadRequestException(`${menuItem.name} is unavailable`);

        newTotal = newTotal.add(menuItem.price.mul(item.quantity));
        await this.prisma.orderItem.create({
          data: {
            orderId,
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            unitPrice: menuItem.price,
            modifiers: asJsonInput(item.modifiers ?? undefined),
            notes: item.notes ?? null,
          },
        });
      }
    }

    if (dto.updateItems && dto.updateItems.length > 0) {
      for (const update of dto.updateItems) {
        const existing = order.items.find((i) => i.id === update.itemId);
        if (!existing) throw new BadRequestException(`Order item ${update.itemId} not found`);

        const updateData: Prisma.OrderItemUpdateInput = {};
        if (update.quantity !== undefined) {
          const oldLineTotal = existing.unitPrice.mul(existing.quantity);
          const newLineTotal = existing.unitPrice.mul(update.quantity);
          newTotal = newTotal.sub(oldLineTotal).add(newLineTotal);
          updateData.quantity = update.quantity;
        }
        if (update.modifiers !== undefined) {
          updateData.modifiers = asJsonInput(update.modifiers);
        }
        if (update.notes !== undefined) updateData.notes = update.notes;

        await this.prisma.orderItem.update({
          where: { id: update.itemId },
          data: updateData,
        });
      }
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { totalAmount: newTotal },
      include: { items: true },
    });

    await this.audit.log({
      staffId,
      action: 'ORDER_MODIFY',
      resource: orderId,
      branchId,
      terminalId,
      result: 'SUCCESS',
    });

    return updated;
  }

  async voidOrder(
    orderId: string,
    reason: string,
    overrideToken: string | undefined,
    staffId: string,
    branchId: string,
    terminalId: string,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.branchId !== branchId) throw new NotFoundException('Order not found');
    if (order.status === 'VOIDED') throw new BadRequestException('Order already voided');

    let overrideBy: string | undefined;
    if (overrideToken) {
      const override = await this.authService.validateOverrideToken(overrideToken, 'orders:void');
      overrideBy = override.managerId;
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'VOIDED' },
    });

    await this.audit.log({
      staffId,
      action: 'ORDER_VOID',
      resource: orderId,
      branchId,
      terminalId,
      overrideBy,
      result: 'SUCCESS',
      metadata: { reason },
    });

    return updated;
  }

  async holdOrder(orderId: string, staffId: string, branchId: string, terminalId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.branchId !== branchId) throw new NotFoundException('Order not found');
    if (order.status !== 'OPEN') throw new BadRequestException('Only OPEN orders can be held');

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'HELD' },
    });

    await this.audit.log({ staffId, action: 'ORDER_HOLD', resource: orderId, branchId, terminalId, result: 'SUCCESS' });
    return updated;
  }

  async fireOrder(orderId: string, staffId: string, branchId: string, terminalId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.branchId !== branchId) throw new NotFoundException('Order not found');
    if (order.status !== 'OPEN' && order.status !== 'HELD') {
      throw new BadRequestException('Only OPEN or HELD orders can be fired');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'SENT_TO_KITCHEN' },
    });

    await this.audit.log({ staffId, action: 'ORDER_FIRE', resource: orderId, branchId, terminalId, result: 'SUCCESS' });
    return updated;
  }

  async applyDiscount(
    orderId: string,
    dto: DiscountDto,
    staffId: string,
    branchId: string,
    terminalId: string,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.branchId !== branchId) throw new NotFoundException('Order not found');
    if (order.status === 'PAID' || order.status === 'VOIDED') {
      throw new BadRequestException(`Cannot discount order in ${order.status} status`);
    }

    let overrideBy: string | undefined;
    if (dto.overrideToken) {
      const override = await this.authService.validateOverrideToken(dto.overrideToken, 'orders:discount');
      overrideBy = override.managerId;
    }

    let discountAmount: Decimal;
    if (dto.type === 'percentage') {
      if (dto.value < 0 || dto.value > 100) throw new BadRequestException('Percentage must be 0-100');
      discountAmount = order.totalAmount.mul(dto.value).div(100);
    } else {
      discountAmount = new Decimal(dto.value);
      if (discountAmount.gt(order.totalAmount)) throw new BadRequestException('Discount exceeds order total');
    }

    const newTotal = order.totalAmount.sub(discountAmount);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { totalAmount: newTotal },
    });

    await this.audit.log({
      staffId,
      action: 'ORDER_DISCOUNT',
      resource: orderId,
      branchId,
      terminalId,
      overrideBy,
      result: 'SUCCESS',
      metadata: { type: dto.type, value: dto.value, reason: dto.reason, discountAmount: discountAmount.toString() },
    });

    return updated;
  }

  async splitBill(
    orderId: string,
    dto: SplitBillDto,
    staffId: string,
    branchId: string,
    terminalId: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.branchId !== branchId) throw new NotFoundException('Order not found');

    const allItemIds = dto.splits.flatMap((s) => s.itemIds);
    const uniqueIds = new Set(allItemIds);
    if (uniqueIds.size !== allItemIds.length) {
      throw new BadRequestException('Duplicate item IDs in split');
    }

    const orderItemIds = order.items.map((i) => i.id);
    const missingIds = allItemIds.filter((id) => !orderItemIds.includes(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(`Items not found in order: ${missingIds.join(', ')}`);
    }

    const splitDetails = dto.splits.map((split) => {
      const items = order.items.filter((i) => split.itemIds.includes(i.id));
      const subtotal = items.reduce(
        (sum, item) => sum.add(item.unitPrice.mul(item.quantity)),
        new Decimal(0),
      );
      return {
        itemIds: split.itemIds,
        paymentMethod: split.paymentMethod,
        subtotal: subtotal.toString(),
      };
    });

    await this.audit.log({
      staffId,
      action: 'ORDER_SPLIT',
      resource: orderId,
      branchId,
      terminalId,
      result: 'SUCCESS',
      metadata: { splitCount: dto.splits.length, splits: splitDetails },
    });

    return { orderId, splits: splitDetails };
  }
}
