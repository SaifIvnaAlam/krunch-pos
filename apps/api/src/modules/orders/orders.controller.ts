import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { Request } from 'express';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermission('orders:create')
  @ApiOperation({ summary: 'List orders (branch-scoped)' })
  @ApiQuery({ name: 'status', required: false })
  async listOrders(@Req() req: Request, @Query('status') status?: string) {
    const user = req.user as JwtPayload;
    return this.ordersService.listOrders(user.branchId, status);
  }

  @Post()
  @RequirePermission('orders:create')
  @ApiOperation({ summary: 'Create order' })
  @ApiResponse({ status: 201, description: 'Order created' })
  async createOrder(@Body() dto: { tableNumber?: string; items: Array<{ menuItemId: string; quantity: number; modifiers?: Record<string, unknown>; notes?: string }> }, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.ordersService.createOrder(dto, user.staffId, user.branchId, user.terminalId);
  }

  @Get(':id')
  @RequirePermission('orders:create')
  @ApiOperation({ summary: 'Get order' })
  async getOrder(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.ordersService.getOrder(id, user.branchId);
  }

  @Patch(':id')
  @RequirePermission('orders:modify')
  @ApiOperation({ summary: 'Modify order' })
  async modifyOrder(
    @Param('id') id: string,
    @Body() dto: { addItems?: Array<{ menuItemId: string; quantity: number; modifiers?: Record<string, unknown>; notes?: string }>; removeItems?: string[]; updateItems?: Array<{ itemId: string; quantity?: number; modifiers?: Record<string, unknown>; notes?: string }> },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.ordersService.modifyOrder(id, dto, user.staffId, user.branchId, user.terminalId);
  }

  @Post(':id/void')
  @RequirePermission('orders:void')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Void order' })
  async voidOrder(
    @Param('id') id: string,
    @Body() dto: { reason: string; overrideToken?: string },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.ordersService.voidOrder(id, dto.reason, dto.overrideToken, user.staffId, user.branchId, user.terminalId);
  }

  @Post(':id/hold')
  @RequirePermission('orders:hold')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hold order' })
  async holdOrder(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.ordersService.holdOrder(id, user.staffId, user.branchId, user.terminalId);
  }

  @Post(':id/fire')
  @RequirePermission('orders:create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send to kitchen' })
  async fireOrder(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.ordersService.fireOrder(id, user.staffId, user.branchId, user.terminalId);
  }

  @Post(':id/split')
  @RequirePermission('orders:split')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Split bill' })
  async splitBill(
    @Param('id') id: string,
    @Body() dto: { splits: Array<{ itemIds: string[]; paymentMethod: string }> },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.ordersService.splitBill(id, dto, user.staffId, user.branchId, user.terminalId);
  }

  @Post(':id/discount')
  @RequirePermission('orders:discount')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply discount' })
  async applyDiscount(
    @Param('id') id: string,
    @Body() dto: { type: 'percentage' | 'fixed'; value: number; reason: string; overrideToken?: string },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.ordersService.applyDiscount(id, dto, user.staffId, user.branchId, user.terminalId);
  }
}
