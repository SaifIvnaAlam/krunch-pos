import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const BCRYPT_SALT_ROUNDS = 10;
const PBKDF2_ITERATIONS = 100000;

interface CreateStaffDto {
  name: string;
  email?: string;
  pin: string;
  nfcCardUid?: string;
  primaryBranchId?: string;
}

interface UpdateStaffDto {
  name?: string;
  email?: string;
  pin?: string;
  nfcCardUid?: string;
  isActive?: boolean;
}

interface AssignRoleDto {
  roleId: string;
  branchId?: string;
  validFrom?: string;
  validUntil?: string;
}

interface ElevateDto {
  permissions: string[];
  branchId: string;
  validFrom: string;
  validUntil: string;
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listStaff(branchId: string): Promise<Array<{
    id: string;
    name: string;
    email: string | null;
    isActive: boolean;
    primaryBranchId: string | null;
    roles: Array<{ roleId: string; roleName: string; branchId: string | null }>;
  }>> {
    const staff = await this.prisma.staff.findMany({
      where: {
        OR: [
          { primaryBranchId: branchId },
          { staffRoles: { some: { branchId } } },
        ],
      },
      include: {
        staffRoles: {
          include: { role: { select: { id: true, name: true } } },
          where: {
            OR: [
              { validUntil: null },
              { validUntil: { gt: new Date() } },
            ],
          },
        },
      },
    });

    return staff.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      isActive: s.isActive,
      primaryBranchId: s.primaryBranchId,
      roles: s.staffRoles.map((sr) => ({
        roleId: sr.role.id,
        roleName: sr.role.name,
        branchId: sr.branchId,
      })),
    }));
  }

  async getStaff(staffId: string): Promise<{
    id: string;
    name: string;
    email: string | null;
    nfcCardUid: string | null;
    isActive: boolean;
    primaryBranchId: string | null;
    createdAt: Date;
    updatedAt: Date;
    roles: Array<{ id: string; roleId: string; roleName: string; branchId: string | null; validFrom: Date; validUntil: Date | null }>;
  }> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: {
        staffRoles: {
          include: { role: { select: { id: true, name: true } } },
        },
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      nfcCardUid: staff.nfcCardUid,
      isActive: staff.isActive,
      primaryBranchId: staff.primaryBranchId,
      createdAt: staff.createdAt,
      updatedAt: staff.updatedAt,
      roles: staff.staffRoles.map((sr) => ({
        id: sr.id,
        roleId: sr.role.id,
        roleName: sr.role.name,
        branchId: sr.branchId,
        validFrom: sr.validFrom,
        validUntil: sr.validUntil,
      })),
    };
  }

  async createStaff(
    dto: CreateStaffDto,
    callerStaffId: string,
    callerBranchId: string,
    callerTerminalId: string,
  ): Promise<{ id: string; name: string }> {
    if (dto.email) {
      const existing = await this.prisma.staff.findUnique({ where: { email: dto.email } });
      if (existing) {
        throw new ConflictException('Email already in use');
      }
    }

    const pinHash = await bcrypt.hash(dto.pin, BCRYPT_SALT_ROUNDS);
    const pbkdf2Salt = crypto.randomBytes(32);
    const pbkdf2Hash = crypto.pbkdf2Sync(dto.pin, pbkdf2Salt, PBKDF2_ITERATIONS, 64, 'sha256').toString('hex');

    const staff = await this.prisma.staff.create({
      data: {
        name: dto.name,
        email: dto.email,
        pinHash,
        pbkdf2Hash,
        pbkdf2Salt: pbkdf2Salt.toString('hex'),
        nfcCardUid: dto.nfcCardUid,
        primaryBranchId: dto.primaryBranchId,
      },
    });

    await this.audit.log({
      staffId: callerStaffId,
      action: 'STAFF_CREATE',
      resource: staff.id,
      branchId: callerBranchId,
      terminalId: callerTerminalId,
      result: 'SUCCESS',
      metadata: { createdStaffId: staff.id, name: staff.name },
    });

    return { id: staff.id, name: staff.name };
  }

  async updateStaff(
    staffId: string,
    dto: UpdateStaffDto,
    callerStaffId: string,
    callerBranchId: string,
    callerTerminalId: string,
  ): Promise<{ id: string; name: string }> {
    const existing = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!existing) {
      throw new NotFoundException('Staff member not found');
    }

    const updateData: Record<string, unknown> = {};

    if (dto.name !== undefined) updateData['name'] = dto.name;
    if (dto.email !== undefined) updateData['email'] = dto.email;
    if (dto.nfcCardUid !== undefined) updateData['nfcCardUid'] = dto.nfcCardUid;
    if (dto.isActive !== undefined) updateData['isActive'] = dto.isActive;

    if (dto.pin !== undefined) {
      updateData['pinHash'] = await bcrypt.hash(dto.pin, BCRYPT_SALT_ROUNDS);
      const pbkdf2Salt = crypto.randomBytes(32);
      updateData['pbkdf2Hash'] = crypto.pbkdf2Sync(dto.pin, pbkdf2Salt, PBKDF2_ITERATIONS, 64, 'sha256').toString('hex');
      updateData['pbkdf2Salt'] = pbkdf2Salt.toString('hex');
    }

    const updated = await this.prisma.staff.update({
      where: { id: staffId },
      data: updateData,
    });

    await this.audit.log({
      staffId: callerStaffId,
      action: dto.isActive === false ? 'STAFF_DEACTIVATE' : 'STAFF_UPDATE',
      resource: staffId,
      branchId: callerBranchId,
      terminalId: callerTerminalId,
      result: 'SUCCESS',
      metadata: { fields: Object.keys(updateData) },
    });

    return { id: updated.id, name: updated.name };
  }

  async assignRole(
    staffId: string,
    dto: AssignRoleDto,
    callerStaffId: string,
    callerBranchId: string,
    callerTerminalId: string,
  ): Promise<{ id: string }> {
    const [staff, role] = await Promise.all([
      this.prisma.staff.findUnique({ where: { id: staffId } }),
      this.prisma.role.findUnique({ where: { id: dto.roleId } }),
    ]);

    if (!staff) throw new NotFoundException('Staff member not found');
    if (!role) throw new NotFoundException('Role not found');

    const staffRole = await this.prisma.staffRole.create({
      data: {
        staffId,
        roleId: dto.roleId,
        branchId: dto.branchId,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        assignedBy: callerStaffId,
      },
    });

    await this.audit.log({
      staffId: callerStaffId,
      action: 'STAFF_ASSIGN_ROLE',
      resource: staffId,
      branchId: callerBranchId,
      terminalId: callerTerminalId,
      result: 'SUCCESS',
      metadata: { roleId: dto.roleId, roleName: role.name },
    });

    return { id: staffRole.id };
  }

  async removeRole(
    staffId: string,
    roleAssignmentId: string,
    callerStaffId: string,
    callerBranchId: string,
    callerTerminalId: string,
  ): Promise<void> {
    const assignment = await this.prisma.staffRole.findUnique({
      where: { id: roleAssignmentId },
    });

    if (!assignment || assignment.staffId !== staffId) {
      throw new NotFoundException('Role assignment not found');
    }

    await this.prisma.staffRole.delete({ where: { id: roleAssignmentId } });

    await this.audit.log({
      staffId: callerStaffId,
      action: 'STAFF_REMOVE_ROLE',
      resource: staffId,
      branchId: callerBranchId,
      terminalId: callerTerminalId,
      result: 'SUCCESS',
      metadata: { roleAssignmentId },
    });
  }

  async elevatePermissions(
    staffId: string,
    dto: ElevateDto,
    callerStaffId: string,
    callerBranchId: string,
    callerTerminalId: string,
  ): Promise<{ id: string }> {
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff member not found');

    const tempPerm = await this.prisma.tempPermission.create({
      data: {
        staffId,
        permissions: dto.permissions,
        branchId: dto.branchId,
        validFrom: new Date(dto.validFrom),
        validUntil: new Date(dto.validUntil),
        grantedBy: callerStaffId,
      },
    });

    await this.audit.log({
      staffId: callerStaffId,
      action: 'STAFF_ELEVATE',
      resource: staffId,
      branchId: callerBranchId,
      terminalId: callerTerminalId,
      result: 'SUCCESS',
      metadata: { permissions: dto.permissions, validUntil: dto.validUntil },
    });

    return { id: tempPerm.id };
  }

  async getMe(staffId: string): Promise<{
    id: string;
    name: string;
    email: string | null;
    isActive: boolean;
    primaryBranchId: string | null;
    roles: Array<{ roleId: string; roleName: string; permissions: string[] }>;
  }> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
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

    if (!staff) throw new NotFoundException('Staff not found');

    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      isActive: staff.isActive,
      primaryBranchId: staff.primaryBranchId,
      roles: staff.staffRoles.map((sr) => ({
        roleId: sr.role.id,
        roleName: sr.role.name,
        permissions: sr.role.permissions,
      })),
    };
  }
}
