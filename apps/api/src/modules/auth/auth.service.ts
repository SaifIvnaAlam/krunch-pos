import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as jose from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TokenService } from './token.service';
import { AuthResult, OverrideResult } from './auth.types';
import { asJsonInput } from '../../common/prisma-json';
import { parseEnvSeconds } from '../../common/parse-env-int';

interface LoginWithPinDto {
  staffId: string;
  pin: string;
  terminalId: string;
  branchId: string;
}

interface NfcLoginDto {
  nfcCardUid: string;
  terminalId: string;
  branchId: string;
}

interface OverrideRequestDto {
  managerPin: string;
  action: string;
  orderId?: string;
  staffId: string;
}

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

  async loginWithPin(dto: LoginWithPinDto): Promise<AuthResult> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: dto.staffId },
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
            branchId: dto.branchId,
            validFrom: { lte: new Date() },
            validUntil: { gt: new Date() },
          },
        },
      },
    });

    if (!staff) {
      await this.recordFailedLogin(dto.staffId, dto.branchId, dto.terminalId);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!staff.isActive) {
      await this.createAuditLog(
        dto.staffId, 'AUTH_LOGIN_INACTIVE', null,
        dto.branchId, dto.terminalId, 'DENIED',
      );
      throw new UnauthorizedException('Account is deactivated');
    }

    const pinValid = await bcrypt.compare(dto.pin, staff.pinHash);
    if (!pinValid) {
      await this.recordFailedLogin(dto.staffId, dto.branchId, dto.terminalId);
      throw new UnauthorizedException('Invalid credentials');
    }

    const roles = staff.staffRoles.map((sr) => sr.role.name);
    const rolePermissions = staff.staffRoles.flatMap((sr) => sr.role.permissions);
    const tempPerms = staff.tempPermissions.flatMap((tp) => tp.permissions);
    const permissions = [...new Set([...rolePermissions, ...tempPerms])];

    const { accessToken, refreshToken } = await this.tokenService.generateTokenPair({
      staffId: staff.id,
      branchId: dto.branchId,
      terminalId: dto.terminalId,
      roles,
      permissions,
    });

    await this.createAuditLog(
      staff.id, 'AUTH_LOGIN_PIN', null,
      dto.branchId, dto.terminalId, 'SUCCESS',
    );

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
      roles,
      permissions,
    };
  }

  async loginWithNfc(dto: NfcLoginDto): Promise<AuthResult> {
    const staff = await this.prisma.staff.findUnique({
      where: { nfcCardUid: dto.nfcCardUid },
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
            branchId: dto.branchId,
            validFrom: { lte: new Date() },
            validUntil: { gt: new Date() },
          },
        },
      },
    });

    if (!staff || !staff.isActive) {
      throw new UnauthorizedException('Invalid NFC card');
    }

    const roles = staff.staffRoles.map((sr) => sr.role.name);
    const rolePermissions = staff.staffRoles.flatMap((sr) => sr.role.permissions);
    const tempPerms = staff.tempPermissions.flatMap((tp) => tp.permissions);
    const permissions = [...new Set([...rolePermissions, ...tempPerms])];

    const { accessToken, refreshToken } = await this.tokenService.generateTokenPair({
      staffId: staff.id,
      branchId: dto.branchId,
      terminalId: dto.terminalId,
      roles,
      permissions,
    });

    await this.createAuditLog(
      staff.id, 'AUTH_LOGIN_NFC', null,
      dto.branchId, dto.terminalId, 'SUCCESS',
    );

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
      roles,
      permissions,
    };
  }

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

  async requestOverride(dto: OverrideRequestDto): Promise<OverrideResult> {
    const manager = await this.prisma.staff.findUnique({
      where: { id: dto.staffId },
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
      },
    });

    if (!manager || !manager.isActive) {
      throw new UnauthorizedException('Invalid manager credentials');
    }

    const pinValid = await bcrypt.compare(dto.managerPin, manager.pinHash);
    if (!pinValid) {
      throw new UnauthorizedException('Invalid manager PIN');
    }

    const managerPermissions = manager.staffRoles.flatMap((sr) => sr.role.permissions);
    const hasPermission = managerPermissions.includes(dto.action) || managerPermissions.includes('*');
    if (!hasPermission) {
      throw new ForbiddenException('Manager does not have the required permission');
    }

    const overrideToken = uuidv4();
    const ttl = this.configService.get<number>('OVERRIDE_TOKEN_EXPIRY', 60);
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;

    await this.redis.set(
      `override:${overrideToken}`,
      JSON.stringify({
        action: dto.action,
        managerId: manager.id,
        orderId: dto.orderId,
        expiresAt,
      }),
      ttl,
    );

    return { overrideToken, action: dto.action, expiresAt };
  }

  async validateOverrideToken(
    token: string,
    expectedAction: string,
  ): Promise<{ managerId: string; orderId?: string }> {
    const data = await this.redis.get(`override:${token}`);
    if (!data) {
      throw new UnauthorizedException('Override token is invalid or expired');
    }

    const parsed = JSON.parse(data) as {
      action: string;
      managerId: string;
      orderId?: string;
      expiresAt: number;
    };

    if (parsed.action !== expectedAction) {
      throw new ForbiddenException('Override token action mismatch');
    }

    await this.redis.del(`override:${token}`);

    return { managerId: parsed.managerId, orderId: parsed.orderId };
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
      roles,
      permissions,
    };
  }

  async loginWithEmail(dto: {
    email: string;
    password: string;
    terminalId: string;
    branchId: string;
  }): Promise<AuthResult> {
    const staff = await this.prisma.staff.findFirst({
      where: { email: dto.email.toLowerCase().trim(), isActive: true },
      include: this.staffAuthInclude(dto.branchId),
    });

    if (!staff?.passwordHash) {
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

  async loginWithGoogle(dto: {
    idToken: string;
    terminalId: string;
    branchId: string;
  }): Promise<AuthResult> {
    const audiences = this.configService
      .get<string>('GOOGLE_CLIENT_IDS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (audiences.length === 0) {
      throw new BadRequestException(
        'Google sign-in is not configured (set GOOGLE_CLIENT_IDS)',
      );
    }

    const JWKS = jose.createRemoteJWKSet(
      new URL('https://www.googleapis.com/oauth2/v3/certs'),
    );

    let payload: jose.JWTPayload;
    try {
      const verified = await jose.jwtVerify(dto.idToken, JWKS, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: audiences,
      });
      payload = verified.payload;
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    const email =
      typeof payload['email'] === 'string'
        ? payload['email'].toLowerCase().trim()
        : null;
    if (!email || payload['email_verified'] === false) {
      throw new UnauthorizedException('Google account email is missing or not verified');
    }

    const staff = await this.prisma.staff.findFirst({
      where: { email, isActive: true },
      include: this.staffAuthInclude(dto.branchId),
    });

    if (!staff) {
      throw new UnauthorizedException(
        'No active staff profile is linked to this Google account',
      );
    }

    const result = await this.buildAuthResult(staff, dto.branchId, dto.terminalId);
    await this.createAuditLog(
      staff.id,
      'AUTH_LOGIN_GOOGLE',
      null,
      dto.branchId,
      dto.terminalId,
      'SUCCESS',
    );
    return result;
  }
}
