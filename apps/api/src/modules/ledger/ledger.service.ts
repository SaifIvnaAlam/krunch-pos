import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertLedgerWorkspaceDto } from './dto/upsert-ledger-workspace.dto';

export type LedgerWorkspaceDto = {
  suppliers: unknown[];
  moves: unknown[];
  ledger: unknown[];
  updatedAt: string;
};

const EMPTY: LedgerWorkspaceDto = {
  suppliers: [],
  moves: [],
  ledger: [],
  updatedAt: new Date(0).toISOString(),
};

function asJsonArray(value: Prisma.JsonValue | null | undefined): unknown[] {
  return Array.isArray(value) ? value : [];
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async getForBranch(branchId: string): Promise<LedgerWorkspaceDto> {
    const row = await this.prisma.branchLedgerWorkspace.findUnique({
      where: { branchId },
    });
    if (!row) return { ...EMPTY };
    return {
      suppliers: asJsonArray(row.suppliers),
      moves: asJsonArray(row.moves),
      ledger: asJsonArray(row.ledger),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async upsertForBranch(
    branchId: string,
    dto: UpsertLedgerWorkspaceDto,
  ): Promise<LedgerWorkspaceDto> {
    const row = await this.prisma.branchLedgerWorkspace.upsert({
      where: { branchId },
      update: {
        suppliers: dto.suppliers as Prisma.InputJsonValue,
        moves: dto.moves as Prisma.InputJsonValue,
        ledger: dto.ledger as Prisma.InputJsonValue,
      },
      create: {
        branchId,
        suppliers: dto.suppliers as Prisma.InputJsonValue,
        moves: dto.moves as Prisma.InputJsonValue,
        ledger: dto.ledger as Prisma.InputJsonValue,
      },
    });
    return {
      suppliers: asJsonArray(row.suppliers),
      moves: asJsonArray(row.moves),
      ledger: asJsonArray(row.ledger),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
