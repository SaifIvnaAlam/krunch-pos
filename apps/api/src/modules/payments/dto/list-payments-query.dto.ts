import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { PAYMENT_METHODS, PaymentMethodValue } from '../../expenses/expense.util';

export class ListPaymentsQueryDto {
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

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  method?: PaymentMethodValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expenseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salaryLineId?: string;
}
