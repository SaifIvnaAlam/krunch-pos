import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockDirection } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';

function toNum(d: Prisma.Decimal): number {
  return d.toNumber();
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getInventory(branchId: string) {
    return this.prisma.menuItem.findMany({
      where: { branchId },
      select: {
        id: true,
        name: true,
        category: true,
        isAvailable: true,
        is86d: true,
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async adjustStock(
    itemId: string,
    adjustment: { isAvailable?: boolean; is86d?: boolean },
    staffId: string,
    branchId: string,
    terminalId: string,
  ) {
    const item = await this.prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!item || item.branchId !== branchId) throw new NotFoundException('Inventory item not found');

    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: adjustment,
    });

    await this.audit.log({
      staffId,
      action: 'INVENTORY_ADJUST',
      resource: itemId,
      branchId,
      terminalId,
      result: 'SUCCESS',
      metadata: { adjustment },
    });

    return updated;
  }

  // ——— Stock ledger (SKU inventory) ———

  async listStockItems(branchId: string) {
    const items = await this.prisma.stockItem.findMany({
      where: { branchId },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    const ids = items.map((i) => i.id);
    const balanceMap = await this.computeBalancesForItems(ids);
    return items.map((row) => ({
      id: row.id,
      branchId: row.branchId,
      sku: row.sku,
      name: row.name,
      category: row.category,
      unit: row.unit,
      parLevel: toNum(row.parLevel),
      lastCountedAt: row.lastCountedAt?.toISOString() ?? null,
      balance: balanceMap.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createStockItem(
    dto: CreateStockItemDto,
    branchId: string,
    staffId: string,
    terminalId: string,
  ) {
    const opening = dto.openingQuantity ?? 0;
    if (opening > 0 && !dto.openingReason?.trim()) {
      throw new BadRequestException('openingReason is required when openingQuantity is greater than zero');
    }

    const sku = dto.sku.trim();
    const clash = await this.prisma.stockItem.findUnique({
      where: { branchId_sku: { branchId, sku } },
    });
    if (clash) throw new BadRequestException(`SKU already exists in this branch: ${sku}`);

    const lastCountedAt = dto.lastCountedAt ? new Date(dto.lastCountedAt) : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.create({
        data: {
          branchId,
          sku,
          name: dto.name.trim(),
          category: dto.category.trim(),
          unit: dto.unit.trim(),
          parLevel: dto.parLevel,
          lastCountedAt,
        },
      });
      if (opening > 0) {
        await tx.stockMovement.create({
          data: {
            branchId,
            stockItemId: item.id,
            direction: StockDirection.IN,
            quantity: opening,
            reason: dto.openingReason!.trim(),
            staffId,
            occurredAt: new Date(),
          },
        });
      }
      return item;
    });

    await this.audit.log({
      staffId,
      action: 'STOCK_ITEM_CREATE',
      resource: created.id,
      branchId,
      terminalId,
      result: 'SUCCESS',
      metadata: { sku: created.sku, openingQuantity: opening || undefined },
    });

    const balanceMap = await this.computeBalancesForItems([created.id]);
    return {
      id: created.id,
      branchId: created.branchId,
      sku: created.sku,
      name: created.name,
      category: created.category,
      unit: created.unit,
      parLevel: toNum(created.parLevel),
      lastCountedAt: created.lastCountedAt?.toISOString() ?? null,
      balance: balanceMap.get(created.id) ?? 0,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateStockItem(
    id: string,
    dto: UpdateStockItemDto,
    branchId: string,
    staffId: string,
    terminalId: string,
  ) {
    const existing = await this.prisma.stockItem.findUnique({ where: { id } });
    if (!existing || existing.branchId !== branchId) {
      throw new NotFoundException('Stock item not found');
    }

    if (dto.sku !== undefined && dto.sku.trim() !== existing.sku) {
      const nextSku = dto.sku.trim();
      const clash = await this.prisma.stockItem.findUnique({
        where: { branchId_sku: { branchId, sku: nextSku } },
      });
      if (clash) throw new BadRequestException(`SKU already exists in this branch: ${nextSku}`);
    }

    const data: Prisma.StockItemUpdateInput = {};
    if (dto.sku !== undefined) data.sku = dto.sku.trim();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.category !== undefined) data.category = dto.category.trim();
    if (dto.unit !== undefined) data.unit = dto.unit.trim();
    if (dto.parLevel !== undefined) data.parLevel = dto.parLevel;
    if (dto.lastCountedAt !== undefined) {
      data.lastCountedAt = dto.lastCountedAt === null ? null : new Date(dto.lastCountedAt);
    }

    const updated = await this.prisma.stockItem.update({
      where: { id },
      data,
    });

    await this.audit.log({
      staffId,
      action: 'STOCK_ITEM_UPDATE',
      resource: id,
      branchId,
      terminalId,
      result: 'SUCCESS',
      metadata: { fields: Object.keys(dto) },
    });

    const balanceMap = await this.computeBalancesForItems([id]);
    return {
      id: updated.id,
      branchId: updated.branchId,
      sku: updated.sku,
      name: updated.name,
      category: updated.category,
      unit: updated.unit,
      parLevel: toNum(updated.parLevel),
      lastCountedAt: updated.lastCountedAt?.toISOString() ?? null,
      balance: balanceMap.get(id) ?? 0,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async listStockMovements(stockItemId: string, branchId: string) {
    const item = await this.prisma.stockItem.findUnique({ where: { id: stockItemId } });
    if (!item || item.branchId !== branchId) throw new NotFoundException('Stock item not found');

    const rows = await this.prisma.stockMovement.findMany({
      where: { stockItemId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map((m) => ({
      id: m.id,
      stockItemId: m.stockItemId,
      branchId: m.branchId,
      direction: m.direction,
      quantity: toNum(m.quantity),
      reason: m.reason,
      occurredAt: m.occurredAt.toISOString(),
      staffId: m.staffId,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async createStockMovement(
    stockItemId: string,
    dto: CreateStockMovementDto,
    branchId: string,
    staffId: string,
    terminalId: string,
  ) {
    const item = await this.prisma.stockItem.findUnique({ where: { id: stockItemId } });
    if (!item || item.branchId !== branchId) throw new NotFoundException('Stock item not found');

    const balance = await this.balanceForItem(stockItemId);
    if (dto.direction === StockDirection.OUT && balance < dto.quantity) {
      throw new BadRequestException(
        `Insufficient stock: balance ${balance}, attempted OUT ${dto.quantity}`,
      );
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    const movement = await this.prisma.stockMovement.create({
      data: {
        branchId,
        stockItemId,
        direction: dto.direction,
        quantity: dto.quantity,
        reason: dto.reason.trim(),
        staffId,
        occurredAt,
      },
    });

    await this.audit.log({
      staffId,
      action: 'STOCK_MOVEMENT_CREATE',
      resource: movement.id,
      branchId,
      terminalId,
      result: 'SUCCESS',
      metadata: {
        stockItemId,
        direction: dto.direction,
        quantity: dto.quantity,
      },
    });

    const newBalance = await this.balanceForItem(stockItemId);

    return {
      id: movement.id,
      stockItemId: movement.stockItemId,
      branchId: movement.branchId,
      direction: movement.direction,
      quantity: toNum(movement.quantity),
      reason: movement.reason,
      occurredAt: movement.occurredAt.toISOString(),
      staffId: movement.staffId,
      createdAt: movement.createdAt.toISOString(),
      balanceAfter: newBalance,
    };
  }

  private async balanceForItem(stockItemId: string): Promise<number> {
    const map = await this.computeBalancesForItems([stockItemId]);
    return map.get(stockItemId) ?? 0;
  }

  private async computeBalancesForItems(itemIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (itemIds.length === 0) return map;
    const movements = await this.prisma.stockMovement.findMany({
      where: { stockItemId: { in: itemIds } },
      select: { stockItemId: true, direction: true, quantity: true },
    });
    for (const id of itemIds) map.set(id, 0);
    for (const m of movements) {
      const q = toNum(m.quantity);
      const prev = map.get(m.stockItemId) ?? 0;
      map.set(m.stockItemId, prev + (m.direction === StockDirection.IN ? q : -q));
    }
    return map;
  }
}
