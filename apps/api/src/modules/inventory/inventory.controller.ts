import { Controller, Get, Patch, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { Request } from 'express';

interface JwtPayload { staffId: string; branchId: string; terminalId: string; roles: string[]; permissions: string[]; }

@ApiTags('Inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Get stock levels' })
  async getInventory(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.inventoryService.getInventory(user.branchId);
  }

  @Patch(':id')
  @RequirePermission('inventory:adjust')
  @ApiOperation({ summary: 'Adjust stock' })
  async adjustStock(
    @Param('id') id: string,
    @Body() dto: { isAvailable?: boolean; is86d?: boolean },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.inventoryService.adjustStock(id, dto, user.staffId, user.branchId, user.terminalId);
  }
}
