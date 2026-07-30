import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  EXPENSE_KINDS,
  ExpenseKindValue,
  PAYMENT_METHODS,
  PaymentMethodValue,
} from '../expense.util';

/**
 * Quick Expense fast path: create an expense and settle it (fully or partly)
 * with a single payment in one transaction.
 */
export class QuickExpenseDto {
  @ApiPropertyOptional({ enum: EXPENSE_KINDS, example: 'other_expense' })
  @IsOptional()
  @IsIn(EXPENSE_KINDS)
  kind?: ExpenseKindValue;

  @ApiProperty({ example: '2026-04-19' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiPropertyOptional({ example: 'Tea & snacks' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expenseCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiProperty({ example: 500, description: 'Whole-currency payable total' })
  @IsNumber()
  @Min(0)
  total!: number;

  @ApiPropertyOptional({
    example: 500,
    description: 'Whole-currency amount paid now. Defaults to the full total.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @ApiProperty({ enum: PAYMENT_METHODS, example: 'cash' })
  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethodValue;

  @ApiPropertyOptional({ example: 'TXN-8891' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  transactionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
