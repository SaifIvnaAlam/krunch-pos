import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EXPENSE_KINDS,
  ExpenseKindValue,
  PAYMENT_METHODS,
  PaymentMethodValue,
} from '../expense.util';
import { ExpenseItemDto } from './expense-item.dto';

export class CreateExpenseDto {
  @ApiProperty({ enum: EXPENSE_KINDS, example: 'other_expense' })
  @IsIn(EXPENSE_KINDS)
  kind!: ExpenseKindValue;

  @ApiProperty({ example: '2026-04-19' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiPropertyOptional({ example: 'Kitchen gas refill' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ description: 'Custom expense category id (optional label)' })
  @IsOptional()
  @IsString()
  expenseCategoryId?: string;

  @ApiPropertyOptional({ description: 'Supplier id (typically for item purchases)' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiProperty({ example: 5000, description: 'Whole-currency payable total' })
  @IsNumber()
  @Min(0)
  total!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ type: [ExpenseItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseItemDto)
  items?: ExpenseItemDto[];

  @ApiPropertyOptional({
    example: 2000,
    description:
      'Whole-currency amount paid now. When > 0, records an initial payment ' +
      'against this expense in the same transaction. Cannot exceed total.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({
    enum: PAYMENT_METHODS,
    example: 'cash',
    description: 'Method for the initial payment (defaults to cash).',
  })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  method?: PaymentMethodValue;

  @ApiPropertyOptional({ example: 'TXN-8891' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  transactionId?: string;
}
