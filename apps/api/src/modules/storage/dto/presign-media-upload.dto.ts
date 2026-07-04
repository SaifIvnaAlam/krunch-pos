import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PresignMediaUploadDto {
  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MaxLength(128)
  contentType!: string;

  @ApiProperty({
    example: 'receipts',
    description: 'Upload scope (receipts, menu, ledger, void-attachments, misc)',
  })
  @IsString()
  @MaxLength(64)
  scope!: string;

  @ApiProperty({ required: false, description: 'Seconds until URL expires (max 3600)' })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  expiresIn?: number;
}
