import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UpsertLedgerWorkspaceDto } from '../../ledger/dto/upsert-ledger-workspace.dto';
import { UpsertSalaryWorkspaceDto } from '../../payroll/dto/upsert-salary-workspace.dto';
import { UpsertDailyEntryDto } from './upsert-daily-entry.dto';

/**
 * Atomic cross-module daily save (I3). The frontend sends the daily entry row
 * plus (optionally) the full ledger workspace and salary bundle it derived, and
 * the server commits all three relational projections + a single payables
 * reprojection in ONE transaction. All succeed or all roll back.
 */
export class CommitDailyEntryDto {
  @ApiProperty({ type: UpsertDailyEntryDto })
  @ValidateNested()
  @Type(() => UpsertDailyEntryDto)
  entry!: UpsertDailyEntryDto;

  @ApiPropertyOptional({ type: UpsertLedgerWorkspaceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertLedgerWorkspaceDto)
  ledger?: UpsertLedgerWorkspaceDto;

  @ApiPropertyOptional({ type: UpsertSalaryWorkspaceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertSalaryWorkspaceDto)
  salary?: UpsertSalaryWorkspaceDto;
}
