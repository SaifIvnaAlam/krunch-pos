import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RelationalSyncService } from '../relational-sync/relational-sync.service';
import { UpsertEmployeeDirectoryDto } from './dto/upsert-employee-directory.dto';
import { normalizeEmployeeDirectory } from './employee-directory.util';

export type EmployeeDirectoryDto = {
  employees: unknown[];
  updatedAt: string;
};

const EMPTY: EmployeeDirectoryDto = {
  employees: [],
  updatedAt: new Date(0).toISOString(),
};

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationalSync: RelationalSyncService,
  ) {}

  async getForBranch(branchId: string): Promise<EmployeeDirectoryDto> {
    const rows = await this.prisma.employee.findMany({
      where: { branchId },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });
    if (rows.length === 0) return { ...EMPTY };

    const updatedAt = rows.reduce(
      (max, r) => (r.updatedAt > max ? r.updatedAt : max),
      new Date(0),
    );
    return {
      employees: normalizeEmployeeDirectory(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          role: r.role,
          phone: r.phone,
          email: r.email,
          defaultBasicSalary: r.defaultBasicSalaryMinor / 100,
          serviceChargePct: r.serviceChargePct == null ? null : Number(r.serviceChargePct),
          active: r.active,
          notes: r.notes,
        })),
      ),
      updatedAt: updatedAt.toISOString(),
    };
  }

  async upsertForBranch(
    branchId: string,
    dto: UpsertEmployeeDirectoryDto,
  ): Promise<EmployeeDirectoryDto> {
    const employees = normalizeEmployeeDirectory(dto.employees);
    await this.prisma.$transaction(async (tx) => {
      await this.relationalSync.syncEmployeeDirectory(branchId, employees, tx);
    });
    return this.getForBranch(branchId);
  }
}
