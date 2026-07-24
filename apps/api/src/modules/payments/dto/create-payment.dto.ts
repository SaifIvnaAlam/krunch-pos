import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MaxLength,
} from 'class-validator';
import { PAYMENT_METHODS, PaymentMethodValue } from '../../expenses/expense.util';

export class CreatePaymentDto {
  @ApiPropertyOptional({ description: 'Target expense id (mutually exclusive with salaryLineId)' })
  @IsOptional()
  @IsString()
  expenseId?: string;

  @ApiPropertyOptional({ description: 'Target salary line id (mutually exclusive with expenseId)' })
  @IsOptional()
  @IsString()
  salaryLineId?: string;

  @ApiProperty({ example: '2026-04-19' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ example: 1500, description: 'Whole-currency amount' })
  @IsNumber()
  @Min(0)
  amount!: number;

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
  @MaxLength(500)
  note?: string;
}
