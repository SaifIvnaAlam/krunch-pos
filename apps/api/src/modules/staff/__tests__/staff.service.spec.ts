import { Test, TestingModule } from '@nestjs/testing';
import { StaffService } from '../staff.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotFoundException } from '@nestjs/common';

describe('StaffService', () => {
  let service: StaffService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        {
          provide: PrismaService,
          useValue: {
            staff: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
            role: { findUnique: jest.fn() },
            staffRole: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
            tempPermission: { create: jest.fn() },
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<StaffService>(StaffService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStaff', () => {
    it('should throw NotFoundException for missing staff', async () => {
      (prisma.staff.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getStaff('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
