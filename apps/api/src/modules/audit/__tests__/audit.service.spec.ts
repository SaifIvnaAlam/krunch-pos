import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: PrismaService,
          useValue: {
            auditLog: {
              create: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    it('should create an audit log entry', async () => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      await service.log({
        staffId: 'staff-1',
        action: 'TEST_ACTION',
        branchId: 'branch-1',
        terminalId: 'term-1',
        result: 'SUCCESS',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          staffId: 'staff-1',
          action: 'TEST_ACTION',
          branchId: 'branch-1',
          terminalId: 'term-1',
          result: 'SUCCESS',
        }),
      });
    });

    it('should not throw when audit creation fails', async () => {
      (prisma.auditLog.create as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(
        service.log({
          staffId: 'staff-1',
          action: 'TEST_ACTION',
          branchId: 'branch-1',
          terminalId: 'term-1',
          result: 'SUCCESS',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('query', () => {
    it('should return paginated audit logs', async () => {
      const mockLogs = [
        {
          id: '1',
          staffId: 'staff-1',
          action: 'TEST',
          resource: null,
          branchId: 'branch-1',
          terminalId: 'term-1',
          overrideBy: null,
          offlineAuth: false,
          result: 'SUCCESS',
          metadata: null,
          createdAt: new Date(),
          staff: { id: 'staff-1', name: 'Test Staff' },
        },
      ];

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs);
      (prisma.auditLog.count as jest.Mock).mockResolvedValue(1);

      const result = await service.query({
        branchId: 'branch-1',
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });
});
