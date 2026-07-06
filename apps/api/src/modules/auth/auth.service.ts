import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TokenService } from './token.service';
import { AuthBranchSummary, AuthResult } from './auth.types';
import { asJsonInput } from '../../common/prisma-json';
import { parseEnvSeconds } from '../../common/parse-env-int';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SECURITY_ALERT_THRESHOLD = 3;
  private readonly SECURITY_ALERT_WINDOW = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) {}

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = await this.tokenService.verifyRefreshToken(refreshToken);

    const isBlacklisted = await this.redis.exists(`blacklist:${refreshToken}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    await this.redis.set(
      `blacklist:${refreshToken}`,
      '1',
      parseEnvSeconds(this.configService, 'JWT_REFRESH_EXPIRY', 28800),
    );

    const staff = await this.prisma.staff.findUnique({
      where: { id: payload.staffId },
      include: {
        staffRoles: {
          include: { role: true },
          where: {
            OR: [
              { validUntil: null },
              { validUntil: { gt: new Date() } },
            ],
          },
        },
        tempPermissions: {
          where: {
            branchId: payload.branchId,
            validFrom: { lte: new Date() },
            validUntil: { gt: new Date() },
          },
        },
      },
    });

    if (!staff || !staff.isActive) {
      throw new UnauthorizedException('Staff account no longer active');
    }

    const roles = staff.staffRoles.map((sr) => sr.role.name);
    const rolePermissions = staff.staffRoles.flatMap((sr) => sr.role.permissions);
    const tempPerms = staff.tempPermissions.flatMap((tp) => tp.permissions);
    const permissions = [...new Set([...rolePermissions, ...tempPerms])];

    return this.tokenService.generateTokenPair({
      staffId: staff.id,
      branchId: payload.branchId,
      terminalId: payload.terminalId,
      roles,
      permissions,
    });
  }

  async logout(accessToken: string, staffId: string): Promise<void> {
    const payload = await this.tokenService.decodeToken(accessToken);
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await this.redis.set(`blacklist:${accessToken}`, '1', ttl);
    }

    await this.createAuditLog(
      staffId, 'AUTH_LOGOUT', null,
      payload.branchId, payload.terminalId, 'SUCCESS',
    );
  }

  private async recordFailedLogin(
    staffId: string,
    branchId: string,
    terminalId: string,
  ): Promise<void> {
    await this.createAuditLog(
      staffId, 'AUTH_LOGIN_FAILED', null,
      branchId, terminalId, 'DENIED',
    );

    const key = `failed_auth:${terminalId}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.SECURITY_ALERT_WINDOW);
    }

    if (count >= this.SECURITY_ALERT_THRESHOLD) {
      this.logger.warn(
        `Security alert: ${count} failed auth attempts on terminal ${terminalId} in ${this.SECURITY_ALERT_WINDOW}s`,
      );
      await this.createAuditLog(
        staffId, 'SECURITY_ALERT', 'terminal',
        branchId, terminalId, 'ALERT',
        { reason: 'Multiple failed login attempts', count },
      );
    }
  }

  private async createAuditLog(
    staffId: string,
    action: string,
    resource: string | null,
    branchId: string,
    terminalId: string,
    result: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          staffId,
          action,
          resource,
          branchId,
          terminalId,
          result,
          metadata: asJsonInput(metadata ?? undefined),
        },
      });
    } catch (error) {
      this.logger.error('Failed to create audit log', error);
    }
  }

  private static readonly GLOBAL_RESTAURANT_ROLE_NAMES = new Set([
    'SUPER_ADMIN',
    'OWNER',
    'ADMIN',
  ]);

  private async resolveRestaurantsForStaff(staff: {
    primaryBranchId: string | null;
    primaryBranch: {
      id: string;
      name: string;
      address: string | null;
      isActive: boolean;
    } | null;
    staffRoles: Array<{
      branchId: string | null;
      role: { name: string };
    }>;
  }): Promise<AuthBranchSummary[]> {
    const hasGlobalRole = staff.staffRoles.some(
      (sr) =>
        sr.branchId === null &&
        AuthService.GLOBAL_RESTAURANT_ROLE_NAMES.has(sr.role.name),
    );

    if (hasGlobalRole) {
      return this.prisma.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true, address: true },
        orderBy: { name: 'asc' },
      });
    }

    const byId = new Map<string, AuthBranchSummary>();

    if (staff.primaryBranch?.isActive) {
      byId.set(staff.primaryBranch.id, {
        id: staff.primaryBranch.id,
        name: staff.primaryBranch.name,
        address: staff.primaryBranch.address,
      });
    }

    const branchIds = [
      ...new Set(
        staff.staffRoles
          .map((sr) => sr.branchId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (branchIds.length > 0) {
      const roleBranches = await this.prisma.branch.findMany({
        where: { id: { in: branchIds }, isActive: true },
        select: { id: true, name: true, address: true },
      });
      for (const branch of roleBranches) {
        byId.set(branch.id, branch);
      }
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private staffAuthInclude(branchId: string) {
    return {
      staffRoles: {
        include: { role: true },
        where: {
          OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
        },
      },
      tempPermissions: {
        where: {
          branchId,
          validFrom: { lte: new Date() },
          validUntil: { gt: new Date() },
        },
      },
    };
  }

  private async buildAuthResult(
    staff: {
      id: string;
      name: string;
      email: string | null;
      isActive: boolean;
      primaryBranchId: string | null;
      staffRoles: Array<{ role: { name: string; permissions: string[] } }>;
      tempPermissions: Array<{ permissions: string[] }>;
    },
    branchId: string,
    terminalId: string,
  ): Promise<AuthResult> {
    const roles = staff.staffRoles.map((sr) => sr.role.name);
    const rolePermissions = staff.staffRoles.flatMap((sr) => sr.role.permissions);
    const tempPerms = staff.tempPermissions.flatMap((tp) => tp.permissions);
    const permissions = [...new Set([...rolePermissions, ...tempPerms])];

    const { accessToken, refreshToken } = await this.tokenService.generateTokenPair({
      staffId: staff.id,
      branchId,
      terminalId,
      roles,
      permissions,
    });

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, address: true },
    });

    return {
      accessToken,
      refreshToken,
      staffProfile: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        isActive: staff.isActive,
        primaryBranchId: staff.primaryBranchId,
      },
      activeBranch: branch
        ? { id: branch.id, name: branch.name, address: branch.address }
        : { id: branchId, name: 'Branch', address: null },
      roles,
      permissions,
    };
  }

  async lookupRestaurantsByEmail(email: string): Promise<AuthBranchSummary[]> {
    const normalized = email.toLowerCase().trim();
    if (!normalized) return [];

    const staff = await this.prisma.staff.findFirst({
      where: {
        email: normalized,
        isActive: true,
        passwordHash: { not: null },
      },
      include: {
        primaryBranch: { select: { id: true, name: true, address: true, isActive: true } },
        staffRoles: {
          include: { role: true },
          where: {
            OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
          },
        },
      },
    });

    if (!staff) return [];

    return this.resolveRestaurantsForStaff(staff);
  }

  async loginWithEmail(dto: {
    email: string;
    password: string;
    terminalId: string;
    branchId: string;
  }): Promise<AuthResult> {
    const staff = await this.prisma.staff.findFirst({
      where: { email: dto.email.toLowerCase().trim(), isActive: true },
      include: {
        ...this.staffAuthInclude(dto.branchId),
        primaryBranch: { select: { id: true, name: true, address: true, isActive: true } },
      },
    });

    if (!staff?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const allowedBranches = await this.resolveRestaurantsForStaff(staff);
    if (!allowedBranches.some((b) => b.id === dto.branchId)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const ok = await bcrypt.compare(dto.password, staff.passwordHash);
    if (!ok) {
      await this.recordFailedLogin(staff.id, dto.branchId, dto.terminalId);
      throw new UnauthorizedException('Invalid email or password');
    }

    const result = await this.buildAuthResult(staff, dto.branchId, dto.terminalId);
    await this.createAuditLog(
      staff.id,
      'AUTH_LOGIN_EMAIL',
      null,
      dto.branchId,
      dto.terminalId,
      'SUCCESS',
    );
    return result;
  }
}
