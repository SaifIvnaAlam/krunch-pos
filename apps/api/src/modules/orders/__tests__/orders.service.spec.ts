import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from '../orders.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthService } from '../../auth/auth.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

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
});
