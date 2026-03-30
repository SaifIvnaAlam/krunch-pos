import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

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
}
