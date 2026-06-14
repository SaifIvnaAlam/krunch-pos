import { IsArray } from 'class-validator';

export class UpsertLedgerWorkspaceDto {
  @IsArray()
  suppliers!: unknown[];

  @IsArray()
  moves!: unknown[];

  @IsArray()
  ledger!: unknown[];
}
