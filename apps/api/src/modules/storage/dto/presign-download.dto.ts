import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PresignDownloadDto {
  @ApiProperty({ example: 'branches/{branchId}/menu/burger.png' })
  @IsString()
  @MaxLength(1024)
  key!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  expiresIn?: number;
}
