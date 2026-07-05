import { IsArray } from 'class-validator';

export class UpsertEmployeeDirectoryDto {
  @IsArray()
  employees!: unknown[];
}
