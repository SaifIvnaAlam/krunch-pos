import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';

export type ExpenseCategoryDto = {
  id: string;
  name: string;
  active: boolean;
  sortIndex: number;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  name: string;
  active: boolean;
  sortIndex: number;
  updatedAt: Date;
}): ExpenseCategoryDto {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    sortIndex: row.sortIndex,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForBranch(branchId: string): Promise<ExpenseCategoryDto[]> {
    const rows = await this.prisma.expenseCategory.findMany({
      where: { branchId },
      orderBy: [{ sortIndex: 'asc' }, { name: 'asc' }],
    });
    return rows.map(mapRow);
  }

  async create(branchId: string, dto: CreateExpenseCategoryDto): Promise<ExpenseCategoryDto> {
    const count = await this.prisma.expenseCategory.count({ where: { branchId } });
    try {
      const row = await this.prisma.expenseCategory.create({
        data: { branchId, name: dto.name.trim(), sortIndex: count },
      });
      return mapRow(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A category with this name already exists.');
      }
      throw err;
    }
  }

  async update(
    branchId: string,
    id: string,
    dto: UpdateExpenseCategoryDto,
  ): Promise<ExpenseCategoryDto> {
    await this.ensureOwned(branchId, id);
    try {
      const row = await this.prisma.expenseCategory.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.sortIndex !== undefined ? { sortIndex: dto.sortIndex } : {}),
        },
      });
      return mapRow(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A category with this name already exists.');
      }
      throw err;
    }
  }

  async remove(branchId: string, id: string): Promise<void> {
    await this.ensureOwned(branchId, id);
    // Expense.expenseCategoryId is ON DELETE SET NULL, so existing expenses keep
    // their system `kind` and simply lose the custom label.
    await this.prisma.expenseCategory.delete({ where: { id } });
  }

  private async ensureOwned(branchId: string, id: string): Promise<void> {
    const row = await this.prisma.expenseCategory.findFirst({
      where: { id, branchId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Expense category not found.');
  }
}
