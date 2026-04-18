import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { Request } from 'express';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Menu item availability (86 / sellable flags)' })
  async getInventory(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.inventoryService.getInventory(user.branchId);
  }

  @Get('stock-items')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'List stock SKUs with computed balance from movements' })
  async listStockItems(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.inventoryService.listStockItems(user.branchId);
  }

  @Post('stock-items')
  @RequirePermission('inventory:adjust')
  @ApiOperation({ summary: 'Create a stock SKU (optional opening IN movement)' })
  async createStockItem(@Body() dto: CreateStockItemDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.inventoryService.createStockItem(dto, user.branchId, user.staffId, user.terminalId);
  }

  @Patch('stock-items/:id')
  @RequirePermission('inventory:adjust')
  @ApiOperation({ summary: 'Update stock SKU metadata (not balance — use movements)' })
  async updateStockItem(
    @Param('id') id: string,
    @Body() dto: UpdateStockItemDto,
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.inventoryService.updateStockItem(id, dto, user.branchId, user.staffId, user.terminalId);
  }

  @Get('stock-items/:id/movements')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Ledger lines for a stock SKU' })
  async listStockMovements(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.inventoryService.listStockMovements(id, user.branchId);
  }

  @Post('stock-items/:id/movements')
  @RequirePermission('inventory:adjust')
  @ApiOperation({ summary: 'Record stock IN or OUT' })
  async createStockMovement(
    @Param('id') id: string,
    @Body() dto: CreateStockMovementDto,
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.inventoryService.createStockMovement(
      id,
      dto,
      user.branchId,
      user.staffId,
      user.terminalId,
    );
  }

  @Patch(':id')
  @RequirePermission('inventory:adjust')
  @ApiOperation({ summary: 'Adjust menu item availability (legacy menu inventory)' })
  async adjustStock(
    @Param('id') id: string,
    @Body() dto: { isAvailable?: boolean; is86d?: boolean },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.inventoryService.adjustStock(id, dto, user.staffId, user.branchId, user.terminalId);
  }
}
