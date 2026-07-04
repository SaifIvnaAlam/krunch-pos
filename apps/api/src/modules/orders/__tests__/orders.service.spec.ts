import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from '../orders.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthService } from '../../auth/auth.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: {
            order: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
            orderItem: { create: jest.fn(), deleteMany: jest.fn(), update: jest.fn() },
            menuItem: { findMany: jest.fn() },
          },
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: AuthService, useValue: { validateOverrideToken: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrder', () => {
    it('should throw NotFoundException for missing order', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getOrder('non-existent', 'branch-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('holdOrder', () => {
    it('should throw BadRequestException for non-OPEN orders', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'order-1',
        branchId: 'branch-1',
        status: 'PAID',
      });
      await expect(
        service.holdOrder('order-1', 'staff-1', 'branch-1', 'term-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createOrder', () => {
    const menuItemId = 'a0000000-0000-4000-8000-000000000101';

    it('includes service charge and tax when applyServiceCharge is true', async () => {
      (prisma.menuItem.findMany as jest.Mock).mockResolvedValue([
        {
          id: menuItemId,
          branchId: 'branch-1',
          name: 'Steak',
          price: new Decimal('10.00'),
          isAvailable: true,
          is86d: false,
        },
      ]);

      let capturedTotal: Decimal | undefined;
      (prisma.order.create as jest.Mock).mockImplementation(({ data }) => {
        capturedTotal = data.totalAmount;
        return Promise.resolve({ id: 'order-1', ...data, items: [] });
      });

      await service.createOrder(
        {
          tableNumber: '5',
          applyServiceCharge: true,
          items: [{ menuItemId, quantity: 1 }],
        },
        'staff-1',
        'branch-1',
        'term-1',
      );

      expect(capturedTotal?.toFixed(2)).toBe('11.91');
    });
  });
});
