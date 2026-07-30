import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateExpenseCategoryDto {
  @ApiProperty({ example: 'Staff Transport' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}
