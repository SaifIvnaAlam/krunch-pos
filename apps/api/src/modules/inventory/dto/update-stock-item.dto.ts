import { IsNumber, IsOptional, IsString, Min, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateStockItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  parLevel?: number;

  @IsOptional()
  @IsString()
  lastCountedAt?: string | null;
}
