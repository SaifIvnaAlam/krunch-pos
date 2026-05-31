import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LookupRestaurantsDto {
  @ApiProperty({ example: 'owner@restaurant.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
