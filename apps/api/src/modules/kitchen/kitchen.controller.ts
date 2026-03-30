import {
  Controller, Get, Post, Body, Param, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KitchenService } from './kitchen.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { Request } from 'express';

interface JwtPayload { staffId: string; branchId: string; terminalId: string; roles: string[]; permissions: string[]; }

@ApiTags('Kitchen')
@Controller('kitchen')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @Get('queue')
  @RequirePermission('orders:create')
  @ApiOperation({ summary: 'Get kitchen queue' })
  async getQueue(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.kitchenService.getKitchenQueue(user.branchId);
  }

  @Post(':orderId/ready')
  @RequirePermission('orders:create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark order ready' })
  async markReady(@Param('orderId') orderId: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.kitchenService.markReady(orderId, user.staffId, user.branchId, user.terminalId);
  }

  @Post(':orderId/items/:itemId/void')
  @RequirePermission('orders:void_item')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Void single item in kitchen' })
  async voidItem(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @Body() dto: { reason: string },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.kitchenService.voidItem(orderId, itemId, dto.reason, user.staffId, user.branchId, user.terminalId);
  }
}
