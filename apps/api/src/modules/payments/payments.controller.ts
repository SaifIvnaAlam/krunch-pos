import {
  Controller, Get, Post, Body, Param, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { Request } from 'express';

interface JwtPayload { staffId: string; branchId: string; terminalId: string; roles: string[]; permissions: string[]; }

@ApiTags('Payments')
@Controller('payments')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @RequirePermission('payments:process')
  @ApiOperation({ summary: 'Process payment' })
  async processPayment(
    @Body() dto: { orderId: string; method: 'CASH' | 'CARD_STRIPE' | 'CARD_ADYEN' | 'SPLIT'; amount: number; stripePaymentIntentId?: string; adyenReference?: string },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.paymentsService.processPayment(dto, user.staffId, user.branchId, user.terminalId);
  }

  @Post(':id/refund')
  @RequirePermission('payments:refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund payment' })
  async refundPayment(
    @Param('id') id: string,
    @Body() dto: { reason: string },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.paymentsService.refundPayment(id, dto, user.staffId, user.branchId, user.terminalId);
  }

  @Get()
  @RequirePermission('payments:view')
  @ApiOperation({ summary: 'Payment history' })
  async getPayments(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.paymentsService.getPayments(user.branchId);
  }
}
