import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './decorators/require-permission.decorator';
import { RbacService } from './rbac.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { asJsonInput } from '../../common/prisma-json';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

const GLOBAL_ROLES = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'AUDITOR'];
const SECURITY_ALERT_THRESHOLD = 3;
const SECURITY_ALERT_WINDOW_SECONDS = 60;

@Injectable()
export class RbacGuard implements CanActivate {
  private readonly logger = new Logger(RbacGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<
      string | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user) {
      throw new ForbiddenException('No authenticated user');
    }

    const resourceBranchId =
      request.params?.branchId ?? request.body?.branchId ?? user.branchId;

    const isGlobalRole = user.roles.some((role: string) =>
      GLOBAL_ROLES.includes(role),
    );

    if (!isGlobalRole && resourceBranchId !== user.branchId) {
      await this.recordDenial(user, requiredPermission, 'BRANCH_MISMATCH');
      throw new ForbiddenException('Access denied: branch mismatch');
    }

    const hasPermission = this.rbacService.hasPermission(
      user.permissions,
      requiredPermission,
    );

    if (!hasPermission) {
      await this.recordDenial(user, requiredPermission, 'PERMISSION_DENIED');
      throw new ForbiddenException(
        `Access denied: missing permission '${requiredPermission}'`,
      );
    }

    await this.createAuditLog(
      user.staffId,
      `RBAC_CHECK:${requiredPermission}`,
      request.originalUrl,
      user.branchId,
      user.terminalId,
      'ALLOWED',
    );

    return true;
  }

  private async recordDenial(
    user: JwtPayload,
    permission: string,
    reason: string,
  ): Promise<void> {
    await this.createAuditLog(
      user.staffId,
      `RBAC_DENIED:${permission}`,
      null,
      user.branchId,
      user.terminalId,
      'DENIED',
      { reason },
    );

    const key = `rbac_deny:${user.terminalId}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, SECURITY_ALERT_WINDOW_SECONDS);
    }

    if (count >= SECURITY_ALERT_THRESHOLD) {
      this.logger.warn(
        `Security alert: ${count} permission denials from terminal ${user.terminalId}`,
      );
      await this.createAuditLog(
        user.staffId,
        'SECURITY_ALERT',
        'rbac',
        user.branchId,
        user.terminalId,
        'ALERT',
        { reason: 'Multiple permission denials', count },
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
}
