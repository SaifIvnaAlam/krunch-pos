import { IsNumber, IsOptional, IsString, Min, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStockItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unit!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  parLevel!: number;

  @IsOptional()
  @IsString()
  lastCountedAt?: string;

  /** First stock-in line when adding a new SKU (e.g. opening balance). Omit or zero to start at 0. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  openingQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  openingReason?: string;
}
