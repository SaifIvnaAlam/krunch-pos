import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, Matches } from 'class-validator';

export class RegisterCaptureItemDto {
  @ApiProperty({ example: 'media:a3Kx9mP2' })
  @IsString()
  @MaxLength(128)
  @Matches(/^media:[A-Za-z0-9_-]+$/)
  mediaRef!: string;
}
