import { StockDirection } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength, MaxLength, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStockMovementDto {
  @IsEnum(StockDirection)
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
