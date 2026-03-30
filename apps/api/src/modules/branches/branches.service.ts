import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface CreateBranchDto {
  name: string;
  address?: string;
  timezone?: string;
}

interface UpdateBranchDto {
  name?: string;
  address?: string;
  timezone?: string;
  isActive?: boolean;
}

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listBranches(): Promise<Array<{
    id: string;
    name: string;
    address: string | null;
    timezone: string;
    isActive: boolean;
    staffCount: number;
  }>> {
    const branches = await this.prisma.branch.findMany({
      include: { _count: { select: { staff: true } } },
      orderBy: { name: 'asc' },
    });

    return branches.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      timezone: b.timezone,
      isActive: b.isActive,
      staffCount: b._count.staff,
    }));
  }

  async getBranch(branchId: string): Promise<{
    id: string;
    name: string;
    address: string | null;
    timezone: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async createBranch(
    dto: CreateBranchDto,
    callerStaffId: string,
    callerTerminalId: string,
  ): Promise<{ id: string; name: string }> {
    const branch = await this.prisma.branch.create({
      data: {
        name: dto.name,
        address: dto.address,
        timezone: dto.timezone ?? 'UTC',
      },
    });

    await this.audit.log({
      staffId: callerStaffId,
      action: 'BRANCH_CREATE',
      resource: branch.id,
      branchId: branch.id,
      terminalId: callerTerminalId,
      result: 'SUCCESS',
    });

    return { id: branch.id, name: branch.name };
  }

  async updateBranch(
    branchId: string,
    dto: UpdateBranchDto,
    callerStaffId: string,
    callerTerminalId: string,
  ): Promise<{ id: string; name: string }> {
    const existing = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!existing) throw new NotFoundException('Branch not found');

    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data: dto,
    });

    await this.audit.log({
      staffId: callerStaffId,
      action: 'BRANCH_UPDATE',
      resource: branchId,
      branchId,
      terminalId: callerTerminalId,
      result: 'SUCCESS',
    });

    return { id: updated.id, name: updated.name };
  }
}
