import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertDailyEntryDto {
  @ApiProperty({ example: '2026-04-19' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  openingBalance!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  cashSale!: number;

  @ApiProperty({ description: 'Gross bank sales before service charge' })
  @IsNumber()
  @Min(0)
  bankSale!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  bkashSale!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  nagadSale?: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  pathaoSale!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  foodiSale!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  foodpandaSale!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  voidSale?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  voidSaleRemarks?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  voidSaleAttachmentDataUrls?: string[];

  @ApiProperty()
  @IsNumber()
  @Min(0)
  expenses!: number;

  @ApiPropertyOptional({
    description: 'Expenses paid by withdrawing from the bank account',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  bankWithdrawn?: number;

  @ApiPropertyOptional()
  @IsOptional()
  expenseLines?: unknown[];

  @ApiProperty()
  @IsNumber()
  remainingBalance!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  enteredBy?: string;
}
