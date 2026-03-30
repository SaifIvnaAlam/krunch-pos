import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class LoginEmailDto {
  @ApiProperty({ example: 'owner@universalpos.local' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password!: string;

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
