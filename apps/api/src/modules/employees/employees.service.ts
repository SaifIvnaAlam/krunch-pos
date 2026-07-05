import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertEmployeeDirectoryDto } from './dto/upsert-employee-directory.dto';

export type EmployeeDirectoryDto = {
  employees: unknown[];
  updatedAt: string;
};

const EMPTY: EmployeeDirectoryDto = {
  employees: [],
  updatedAt: new Date(0).toISOString(),
};

function asJsonArray(value: Prisma.JsonValue | null | undefined): unknown[] {
  return Array.isArray(value) ? value : [];
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async getForBranch(branchId: string): Promise<EmployeeDirectoryDto> {
    const row = await this.prisma.branchEmployeeDirectory.findUnique({
      where: { branchId },
    });
    if (!row) return { ...EMPTY };
    return {
      employees: asJsonArray(row.employees),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async upsertForBranch(
    branchId: string,
    dto: UpsertEmployeeDirectoryDto,
  ): Promise<EmployeeDirectoryDto> {
    const row = await this.prisma.branchEmployeeDirectory.upsert({
      where: { branchId },
      update: {
        employees: dto.employees as Prisma.InputJsonValue,
      },
      create: {
        branchId,
        employees: dto.employees as Prisma.InputJsonValue,
      },
    });
    return {
      employees: asJsonArray(row.employees),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
