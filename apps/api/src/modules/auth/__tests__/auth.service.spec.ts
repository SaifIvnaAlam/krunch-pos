import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { TokenService } from '../token.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PrismaService>;
  let redis: jest.Mocked<RedisService>;
  let tokenService: jest.Mocked<TokenService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            staff: { findUnique: jest.fn() },
            auditLog: { create: jest.fn() },
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            exists: jest.fn(),
            incr: jest.fn(),
            expire: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            generateTokenPair: jest.fn(),
            verifyRefreshToken: jest.fn(),
            decodeToken: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(60),
            getOrThrow: jest.fn().mockReturnValue('test-secret'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
    tokenService = module.get(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('loginWithPin', () => {
    it('should throw UnauthorizedException for invalid staff', async () => {
      (prisma.staff.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
      (redis.incr as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(undefined);

      await expect(
        service.loginWithPin({
          staffId: 'invalid',
          pin: '1234',
          terminalId: 'term-1',
          branchId: 'branch-1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive staff', async () => {
      (prisma.staff.findUnique as jest.Mock).mockResolvedValue({
        id: 'staff-1',
        isActive: false,
        pinHash: '$2b$10$test',
        staffRoles: [],
        tempPermissions: [],
      });
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      await expect(
        service.loginWithPin({
          staffId: 'staff-1',
          pin: '1234',
          terminalId: 'term-1',
          branchId: 'branch-1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should blacklist token in Redis', async () => {
      (tokenService.decodeToken as jest.Mock).mockResolvedValue({
        staffId: 'staff-1',
        branchId: 'branch-1',
        terminalId: 'term-1',
        exp: Math.floor(Date.now() / 1000) + 900,
      });
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      await service.logout('some-token', 'staff-1');

      expect(redis.set).toHaveBeenCalledWith(
        'blacklist:some-token',
        '1',
        expect.any(Number),
      );
    });
  });
});
