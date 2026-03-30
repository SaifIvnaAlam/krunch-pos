import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class OverrideDto {
  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  managerPin!: string;

  @ApiProperty({ example: 'orders:void' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  action!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiProperty({ description: 'Manager staff ID' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  staffId!: string;
}
