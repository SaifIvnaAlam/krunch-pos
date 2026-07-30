import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { EXPENSE_KINDS, ExpenseKindValue } from '../expense.util';

export const EXPENSE_STATUSES = ['unpaid', 'partially_paid', 'paid'] as const;

export class ListExpensesQueryDto {
  @ApiPropertyOptional({ enum: EXPENSE_KINDS })
  @IsOptional()
  @IsIn(EXPENSE_KINDS)
  kind?: ExpenseKindValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expenseCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ enum: EXPENSE_STATUSES })
  @IsOptional()
  @IsIn(EXPENSE_STATUSES)
  status?: (typeof EXPENSE_STATUSES)[number];

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
