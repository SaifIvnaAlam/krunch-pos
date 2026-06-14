import { IsObject, IsString, Matches } from 'class-validator';

export class UpsertSalaryWorkspaceDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  selectedMonthKey!: string;

  @IsObject()
  months!: Record<string, unknown>;
}
