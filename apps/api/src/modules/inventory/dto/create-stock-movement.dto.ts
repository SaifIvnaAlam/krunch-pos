import { StockDirection } from '@prisma/client';
import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength, MaxLength, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

const STOCK_DIRECTIONS = ['IN', 'OUT'] as const satisfies readonly StockDirection[];

export class CreateStockMovementDto {
  @IsIn(STOCK_DIRECTIONS)
  direction!: StockDirection;

  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  quantity!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
