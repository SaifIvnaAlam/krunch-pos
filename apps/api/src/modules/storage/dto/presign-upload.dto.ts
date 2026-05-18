import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PresignUploadDto {
  @ApiProperty({ example: 'menu/burger.png' })
  @IsString()
  @MaxLength(512)
  path!: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  @MaxLength(128)
  contentType!: string;

  @ApiProperty({ required: false, description: 'Seconds until URL expires (max 3600)' })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  expiresIn?: number;
}
