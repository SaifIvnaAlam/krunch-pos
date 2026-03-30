import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class LoginGoogleDto {
  @ApiProperty({
    description: 'Google ID token (credential) from Sign-In',
    minLength: 10,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(8192)
  idToken!: string;

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
