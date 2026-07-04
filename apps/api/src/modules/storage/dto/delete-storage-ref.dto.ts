import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class DeleteStorageRefDto {
  @ApiProperty({ example: 'media:a3Kx9mP2' })
  @IsString()
  @MaxLength(512)
  ref!: string;
}
