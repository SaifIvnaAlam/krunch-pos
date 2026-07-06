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
            staff: { findUnique: jest.fn(), findFirst: jest.fn() },
            branch: { findMany: jest.fn(), findUnique: jest.fn() },
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

  describe('loginWithEmail', () => {
    it('should throw UnauthorizedException when staff has no password', async () => {
      (prisma.staff.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.loginWithEmail({
          email: 'owner@example.com',
          password: 'secret',
          terminalId: 'term-1',
          branchId: 'branch-1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('should throw when refresh token is blacklisted', async () => {
      tokenService.verifyRefreshToken.mockResolvedValue({
        staffId: 'staff-1',
        branchId: 'branch-1',
        terminalId: 'term-1',
        roles: ['OWNER'],
        permissions: ['*'],
        iat: 1,
        exp: 9999999999,
      });
      (redis.exists as jest.Mock).mockResolvedValue(true);

      await expect(service.refreshTokens('revoked-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
