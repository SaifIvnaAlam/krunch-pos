import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { asJsonInput } from '../../common/prisma-json';

interface CreateAuditLogDto {
  staffId: string;
  action: string;
  resource?: string | null;
  branchId: string;
  terminalId: string;
  overrideBy?: string | null;
  offlineAuth?: boolean;
  result: string;
  metadata?: Record<string, unknown>;
}

interface AuditQueryDto {
  branchId: string;
  page?: number;
  limit?: number;
  staffId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(dto: CreateAuditLogDto): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          staffId: dto.staffId,
          action: dto.action,
          resource: dto.resource ?? null,
          branchId: dto.branchId,
          terminalId: dto.terminalId,
          overrideBy: dto.overrideBy ?? null,
          offlineAuth: dto.offlineAuth ?? false,
          result: dto.result,
          metadata: asJsonInput(dto.metadata ?? undefined),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create audit log: ${dto.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async query(dto: AuditQueryDto): Promise<{
    data: Array<{
      id: string;
      staffId: string;
      action: string;
      resource: string | null;
      branchId: string;
      terminalId: string;
      overrideBy: string | null;
      offlineAuth: boolean;
      result: string;
      metadata: unknown;
      createdAt: Date;
      staff: { id: string; name: string };
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { branchId: dto.branchId };

    if (dto.staffId) {
      where['staffId'] = dto.staffId;
    }
    if (dto.action) {
      where['action'] = { contains: dto.action };
    }
    if (dto.startDate || dto.endDate) {
      const createdAt: Record<string, Date> = {};
      if (dto.startDate) createdAt['gte'] = new Date(dto.startDate);
      if (dto.endDate) createdAt['lte'] = new Date(dto.endDate);
      where['createdAt'] = createdAt;
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { staff: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
