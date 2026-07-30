import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CapturePresignDto {
  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MaxLength(128)
  contentType!: string;
}
