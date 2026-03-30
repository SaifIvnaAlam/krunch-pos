import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface ProcessPaymentDto {
  orderId: string;
  method: 'CASH' | 'CARD_STRIPE' | 'CARD_ADYEN' | 'SPLIT';
  amount: number;
  stripePaymentIntentId?: string;
  adyenReference?: string;
}

interface RefundPaymentDto {
  reason: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async processPayment(dto: ProcessPaymentDto, staffId: string, branchId: string, terminalId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { payments: true },
    });

    if (!order || order.branchId !== branchId) throw new NotFoundException('Order not found');
    if (order.status === 'VOIDED') throw new BadRequestException('Cannot pay for voided order');
    if (order.status === 'PAID') throw new BadRequestException('Order already fully paid');

    const existingPaid = order.payments
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum.add(p.amount), new Decimal(0));

    const paymentAmount = new Decimal(dto.amount);
    const remaining = order.totalAmount.sub(existingPaid);

    if (paymentAmount.gt(remaining)) {
      throw new BadRequestException('Payment amount exceeds remaining balance');
    }

    const idempotencyKey = uuidv4();

    const payment = await this.prisma.payment.create({
      data: {
        orderId: dto.orderId,
        method: dto.method,
        amount: paymentAmount,
        status: 'COMPLETED',
        stripeId: dto.stripePaymentIntentId ?? null,
        adyenId: dto.adyenReference ?? null,
        idempotencyKey,
      },
    });

    const totalPaid = existingPaid.add(paymentAmount);
    if (totalPaid.gte(order.totalAmount)) {
      await this.prisma.order.update({
        where: { id: dto.orderId },
        data: { status: 'PAID' },
      });
    }

    await this.audit.log({
      staffId,
      action: 'PAYMENT_PROCESS',
      resource: payment.id,
      branchId,
      terminalId,
      result: 'SUCCESS',
      metadata: { orderId: dto.orderId, method: dto.method, amount: dto.amount },
    });

    return payment;
  }

  async refundPayment(paymentId: string, dto: RefundPaymentDto, staffId: string, branchId: string, terminalId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment || payment.order.branchId !== branchId) throw new NotFoundException('Payment not found');
    if (payment.status !== 'COMPLETED') throw new BadRequestException('Only completed payments can be refunded');

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'REFUNDED' },
    });

    await this.audit.log({
      staffId,
      action: 'PAYMENT_REFUND',
      resource: paymentId,
      branchId,
      terminalId,
      result: 'SUCCESS',
      metadata: { orderId: payment.orderId, reason: dto.reason, amount: payment.amount.toString() },
    });

    return updated;
  }

  async getPayments(branchId: string) {
    return this.prisma.payment.findMany({
      where: { order: { branchId } },
      include: { order: { select: { id: true, tableNumber: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
