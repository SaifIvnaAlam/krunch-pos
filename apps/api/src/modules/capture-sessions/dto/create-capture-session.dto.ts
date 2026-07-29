import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateCaptureSessionDto {
  @ApiProperty({
    example: '2026-07-29',
    description: 'Daily entry calendar date — QR path becomes /capture/ddmmyyyy',
  })
  @IsString()
  @MaxLength(10)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateKey!: string;
}
