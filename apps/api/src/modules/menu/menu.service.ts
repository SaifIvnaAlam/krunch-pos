import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { asJsonInput } from '../../common/prisma-json';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../../redis/redis.service';

import { normalizeStorageObjectKey } from '../../common/storage-key';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  async getMenu(branchId: string) {
    return this.prisma.menuItem.findMany({
      where: { branchId },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async createItem(dto: CreateMenuItemDto, staffId: string, branchId: string, terminalId: string) {
    const item = await this.prisma.menuItem.create({
      data: {
        branchId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        category: dto.category,
        imageKey: dto.imageKey ? normalizeStorageObjectKey(dto.imageKey) : undefined,
        modifiers: asJsonInput(dto.modifiers ?? undefined),
      },
    });

    await this.audit.log({
      staffId, action: 'MENU_CREATE', resource: item.id, branchId, terminalId, result: 'SUCCESS',
    });

    return item;
  }

  async updateItem(itemId: string, dto: UpdateMenuItemDto, staffId: string, branchId: string, terminalId: string) {
    const existing = await this.prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.branchId !== branchId) throw new NotFoundException('Menu item not found');

    const data: Prisma.MenuItemUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.price !== undefined && { price: dto.price }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
      ...(dto.imageKey !== undefined && {
        imageKey:
          dto.imageKey === null || dto.imageKey === ''
            ? null
            : normalizeStorageObjectKey(dto.imageKey),
      }),
      ...(dto.modifiers !== undefined && { modifiers: asJsonInput(dto.modifiers) }),
    };
    const updated = await this.prisma.menuItem.update({ where: { id: itemId }, data });

    await this.audit.log({
      staffId, action: 'MENU_UPDATE', resource: itemId, branchId, terminalId, result: 'SUCCESS',
    });

    return updated;
  }

  async deleteItem(itemId: string, staffId: string, branchId: string, terminalId: string) {
    const existing = await this.prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.branchId !== branchId) throw new NotFoundException('Menu item not found');

    await this.prisma.menuItem.delete({ where: { id: itemId } });

    await this.audit.log({
      staffId, action: 'MENU_DELETE', resource: itemId, branchId, terminalId, result: 'SUCCESS',
    });
  }

  async mark86(itemId: string, staffId: string, branchId: string, terminalId: string) {
    const existing = await this.prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.branchId !== branchId) throw new NotFoundException('Menu item not found');

    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { is86d: true, isAvailable: false },
    });

    await this.audit.log({
      staffId, action: 'MENU_86', resource: itemId, branchId, terminalId, result: 'SUCCESS',
      metadata: { itemName: existing.name },
    });

    return updated;
  }

  async un86(itemId: string, staffId: string, branchId: string, terminalId: string) {
    const existing = await this.prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.branchId !== branchId) throw new NotFoundException('Menu item not found');

    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { is86d: false, isAvailable: true },
    });

    await this.audit.log({
      staffId, action: 'MENU_UN86', resource: itemId, branchId, terminalId, result: 'SUCCESS',
    });

    return updated;
  }
}
