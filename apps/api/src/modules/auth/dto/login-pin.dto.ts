import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class LoginPinDto {
  @ApiProperty({ example: 'default-owner' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  staffId!: string;

  @ApiProperty({ example: '1234' })
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  pin!: string;

  @ApiProperty({ example: 'terminal-001' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  terminalId!: string;

  @ApiProperty({ example: 'branch-001' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  branchId!: string;
}
