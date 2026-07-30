import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ADMIN_ROLE_IDS,
  ADMIN_SEAT_LIMIT,
  MANAGER_ROLE_IDS,
  MANAGER_SEAT_LIMIT,
  parsePortalRoleTier,
  roleIdForTier,
  tierForRoleIds,
  type PortalRoleTier,
} from './portal-access';

const BCRYPT_SALT_ROUNDS = 10;
const PBKDF2_ITERATIONS = 100000;
const MIN_PORTAL_PASSWORD_LENGTH = 8;

function assertPortalPassword(password: string): void {
  if (password.length < MIN_PORTAL_PASSWORD_LENGTH) {
    throw new BadRequestException(
      `Portal password must be at least ${MIN_PORTAL_PASSWORD_LENGTH} characters.`,
    );
  }
}

interface CreateStaffDto {
  name: string;
  email?: string;
  /** Portal sign-in password (min 8 chars). Required when email is set. Stored as bcrypt hash only. */
  password?: string;
  /** Optional legacy PIN. Auto-generated when omitted (portal users only need email/password). */
  pin?: string;
  nfcCardUid?: string;
  primaryBranchId?: string;
  /** Required for portal users: admin (Users & Access) or manager (input only). */
  roleTier?: PortalRoleTier;
}

export type StaffSeatUsage = {
  admin: { used: number; limit: number };
  manager: { used: number; limit: number };
};

export type StaffListResponse = {
  staff: Array<{
    id: string;
    name: string;
    email: string | null;
    isActive: boolean;
    primaryBranchId: string | null;
    roleTier: PortalRoleTier | null;
    roles: Array<{ roleId: string; roleName: string; branchId: string | null }>;
  }>;
  seats: StaffSeatUsage;
};

interface UpdateStaffDto {
  name?: string;
  email?: string;
  /** Set or reset portal sign-in password (min 8 chars). Stored as bcrypt hash only. */
  password?: string;
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

  private async countActiveSeats(): Promise<StaffSeatUsage> {
    const now = new Date();
    const [adminUsed, managerUsed] = await Promise.all([
      this.prisma.staff.count({
        where: {
          isActive: true,
          staffRoles: {
            some: {
              roleId: { in: [...ADMIN_ROLE_IDS] },
              OR: [{ validUntil: null }, { validUntil: { gt: now } }],
            },
          },
        },
      }),
      this.prisma.staff.count({
        where: {
          isActive: true,
          staffRoles: {
            some: {
              roleId: { in: [...MANAGER_ROLE_IDS] },
              OR: [{ validUntil: null }, { validUntil: { gt: now } }],
            },
          },
        },
      }),
    ]);

    return {
      admin: { used: adminUsed, limit: ADMIN_SEAT_LIMIT },
      manager: { used: managerUsed, limit: MANAGER_SEAT_LIMIT },
    };
  }

  private async assertSeatAvailable(tier: PortalRoleTier): Promise<void> {
    const seats = await this.countActiveSeats();
    if (tier === 'admin' && seats.admin.used >= seats.admin.limit) {
      throw new BadRequestException(
        `Admin seat limit reached (${seats.admin.limit}). Deactivate an admin before adding another.`,
      );
    }
    if (tier === 'manager' && seats.manager.used >= seats.manager.limit) {
      throw new BadRequestException(
        `Manager seat limit reached (${seats.manager.limit}). Deactivate a manager before adding another.`,
      );
    }
  }

  async listStaff(branchId: string): Promise<StaffListResponse> {
    const staff = await this.prisma.staff.findMany({
      where: {
        OR: [
          { primaryBranchId: branchId },
          { staffRoles: { some: { branchId } } },
          // Global admin/owner roles (branchId null on StaffRole)
          {
            staffRoles: {
              some: {
                roleId: { in: [...ADMIN_ROLE_IDS] },
                branchId: null,
              },
            },
          },
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
      orderBy: { name: 'asc' },
    });

    const seats = await this.countActiveSeats();

    return {
      staff: staff.map((s) => {
        const roleIds = s.staffRoles.map((sr) => sr.role.id);
        return {
          id: s.id,
          name: s.name,
          email: s.email,
          isActive: s.isActive,
          primaryBranchId: s.primaryBranchId,
          roleTier: tierForRoleIds(roleIds),
          roles: s.staffRoles.map((sr) => ({
            roleId: sr.role.id,
            roleName: sr.role.name,
            branchId: sr.branchId,
          })),
        };
      }),
      seats,
    };
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
  ): Promise<{ id: string; name: string; email: string | null; roleTier: PortalRoleTier }> {
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('Name is required.');
    }

    const email = dto.email?.toLowerCase().trim() || undefined;
    if (email) {
      const existing = await this.prisma.staff.findUnique({ where: { email } });
      if (existing) {
        throw new ConflictException('Email already in use');
      }
      if (!dto.password?.trim()) {
        throw new BadRequestException('Password is required when email is set.');
      }
    } else if (dto.password?.trim()) {
      throw new BadRequestException('Email is required when setting a portal password.');
    }

    const roleTier = parsePortalRoleTier(dto.roleTier) ?? (email ? null : 'manager');
    if (!roleTier) {
      throw new BadRequestException(
        "roleTier is required for portal users ('admin' or 'manager').",
      );
    }

    const portalPassword = dto.password?.trim();
    if (portalPassword) {
      assertPortalPassword(portalPassword);
    }

    await this.assertSeatAvailable(roleTier);

    const pin = dto.pin?.trim() || crypto.randomBytes(4).toString('hex');
    const pinHash = await bcrypt.hash(pin, BCRYPT_SALT_ROUNDS);
    const pbkdf2Salt = crypto.randomBytes(32);
    const pbkdf2Hash = crypto
      .pbkdf2Sync(pin, pbkdf2Salt, PBKDF2_ITERATIONS, 64, 'sha256')
      .toString('hex');
    const primaryBranchId = dto.primaryBranchId ?? callerBranchId;
    const roleId = roleIdForTier(roleTier);

    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new BadRequestException(
        `Role '${roleId}' is missing. Run database seed.`,
      );
    }

    const passwordHash = portalPassword
      ? await bcrypt.hash(portalPassword, BCRYPT_SALT_ROUNDS)
      : undefined;

    // Admins are global (null branch on StaffRole); managers are branch-scoped.
    const staffRoleBranchId = roleTier === 'admin' ? null : primaryBranchId;

    const staff = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staff.create({
        data: {
          name,
          email,
          passwordHash,
          pinHash,
          pbkdf2Hash,
          pbkdf2Salt: pbkdf2Salt.toString('hex'),
          nfcCardUid: dto.nfcCardUid,
          primaryBranchId,
        },
      });

      await tx.staffRole.create({
        data: {
          staffId: created.id,
          roleId: role.id,
          branchId: staffRoleBranchId,
          assignedBy: callerStaffId,
        },
      });

      return created;
    });

    await this.audit.log({
      staffId: callerStaffId,
      action: 'STAFF_CREATE',
      resource: staff.id,
      branchId: callerBranchId,
      terminalId: callerTerminalId,
      result: 'SUCCESS',
      metadata: {
        createdStaffId: staff.id,
        name: staff.name,
        email: staff.email,
        roleId: role.id,
        roleTier,
      },
    });

    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      roleTier,
    };
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

    if (dto.isActive === false && staffId === callerStaffId) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    if (dto.isActive === true && !existing.isActive) {
      const assignments = await this.prisma.staffRole.findMany({
        where: {
          staffId,
          OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
        },
        select: { roleId: true },
      });
      const tier = tierForRoleIds(assignments.map((a) => a.roleId));
      if (tier) {
        await this.assertSeatAvailable(tier);
      }
    }

    const updateData: Record<string, unknown> = {};

    if (dto.name !== undefined) updateData['name'] = dto.name.trim();
    if (dto.email !== undefined) {
      const nextEmail = dto.email.trim() ? dto.email.toLowerCase().trim() : null;
      if (nextEmail && nextEmail !== existing.email) {
        const conflict = await this.prisma.staff.findUnique({ where: { email: nextEmail } });
        if (conflict) {
          throw new ConflictException('Email already in use');
        }
      }
      updateData['email'] = nextEmail;
    }
    if (dto.nfcCardUid !== undefined) updateData['nfcCardUid'] = dto.nfcCardUid;
    if (dto.isActive !== undefined) updateData['isActive'] = dto.isActive;

    if (dto.password !== undefined) {
      const portalPassword = dto.password.trim();
      if (!portalPassword) {
        updateData['passwordHash'] = null;
      } else {
        assertPortalPassword(portalPassword);
        updateData['passwordHash'] = await bcrypt.hash(portalPassword, BCRYPT_SALT_ROUNDS);
      }
    }

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

    const tier = tierForRoleIds([dto.roleId]);
    if (tier && staff.isActive) {
      const alreadyHasTier = await this.prisma.staffRole.findFirst({
        where: {
          staffId,
          roleId: {
            in: tier === 'admin' ? [...ADMIN_ROLE_IDS] : [...MANAGER_ROLE_IDS],
          },
          OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
        },
      });
      if (!alreadyHasTier) {
        await this.assertSeatAvailable(tier);
      }
    }

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

  async getMe(
    staffId: string,
    branchId: string,
  ): Promise<{
    id: string;
    name: string;
    email: string | null;
    isActive: boolean;
    primaryBranchId: string | null;
    activeBranch: { id: string; name: string; address: string | null };
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

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, address: true },
    });

    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      isActive: staff.isActive,
      primaryBranchId: staff.primaryBranchId,
      activeBranch: branch
        ? { id: branch.id, name: branch.name, address: branch.address }
        : { id: branchId, name: 'Branch', address: null },
      roles: staff.staffRoles.map((sr) => ({
        roleId: sr.role.id,
        roleName: sr.role.name,
        permissions: sr.role.permissions,
      })),
    };
  }
}
