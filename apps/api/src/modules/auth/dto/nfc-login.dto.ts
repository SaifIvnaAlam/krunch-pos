import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class NfcLoginDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  nfcCardUid!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  terminalId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  branchId!: string;
}
