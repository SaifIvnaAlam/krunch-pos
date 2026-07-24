import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ExpenseItemDto {
  @ApiPropertyOptional({ example: 'Rice 50kg' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  qty?: number;

  @ApiPropertyOptional({ example: 'bag' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @ApiPropertyOptional({ example: 2500, description: 'Whole-currency rate per unit' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @ApiProperty({ example: 5000, description: 'Whole-currency line total' })
  @IsNumber()
  @Min(0)
  total!: number;
}
