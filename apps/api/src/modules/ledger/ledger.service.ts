import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RelationalSyncService } from '../relational-sync/relational-sync.service';
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

// Ledger projections can be large.
const TX_OPTS = { timeout: 120000, maxWait: 20000 } as const;

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationalSync: RelationalSyncService,
  ) {}

  async getForBranch(branchId: string): Promise<LedgerWorkspaceDto> {
    return this.assembleFromRelational(branchId);
  }

  private async assembleFromRelational(
    branchId: string,
  ): Promise<LedgerWorkspaceDto> {
    const [suppliers, entries, purchases, returns] = await Promise.all([
      this.prisma.supplier.findMany({
        where: { branchId },
        orderBy: [{ sortIndex: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.ledgerEntry.findMany({
        where: { branchId },
        orderBy: [{ sortIndex: 'asc' }, { date: 'asc' }],
        include: {
          items: { orderBy: { sortIndex: 'asc' } },
          attachments: { orderBy: { sortIndex: 'asc' } },
        },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { branchId },
        orderBy: { sortIndex: 'asc' },
        include: { items: { orderBy: { sortIndex: 'asc' } } },
      }),
      this.prisma.purchaseReturn.findMany({
        where: { branchId },
        orderBy: { sortIndex: 'asc' },
        include: { lines: { orderBy: { sortIndex: 'asc' } } },
      }),
    ]);

    if (
      suppliers.length === 0 &&
      entries.length === 0 &&
      purchases.length === 0 &&
      returns.length === 0
    ) {
      return { ...EMPTY };
    }

    const dates: Date[] = [
      ...suppliers.map((s) => s.updatedAt),
      ...entries.map((e) => e.updatedAt),
      ...purchases.map((p) => p.updatedAt),
      ...returns.map((r) => r.updatedAt),
    ];
    const updatedAt = dates.reduce((max, d) => (d > max ? d : max), new Date(0));

    const supplierDtos = suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      bookPurpose: s.bookPurpose,
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email,
      address: s.address,
      notes: s.notes,
    }));

    const ledgerDtos = entries.map((e) => ({
      id: e.id,
      supplierId: e.supplierId,
      date: e.date,
      type: e.type,
      ref: e.ref,
      memo: e.memo,
      amountCents: e.amountMinor,
      ...(e.items.length
        ? {
            items: e.items.map((it) => ({
              id: it.sourceId,
              name: it.name,
              qty: Number(it.qty),
              unit: it.unit,
              rateCents: it.rateMinor,
              totalCents: it.totalMinor,
            })),
          }
        : {}),
      ...(e.attachments.length
        ? {
            attachments: e.attachments.map((a) => ({
              fileName: a.fileName,
              mimeType: a.mimeType,
              dataUrl: a.dataUrl,
            })),
          }
        : {}),
      ...(e.isLocked ? { isLocked: true } : {}),
      ...(e.lockedAt ? { lockedAt: e.lockedAt.toISOString() } : {}),
    }));

    // Re-merge purchases + returns into the single moves[] array by sortIndex.
    const purchaseMoves = purchases.map((p) => ({
      sortIndex: p.sortIndex,
      move: {
        kind: 'purchase' as const,
        id: p.id,
        ref: p.ref,
        supplierId: p.supplierId,
        date: p.date,
        status: p.status,
        amountCents: p.amountMinor,
        note: p.note,
        ...(p.items.length
          ? {
              items: p.items.map((it) => ({
                id: it.sourceId,
                name: it.name,
                qty: Number(it.qty),
                unit: it.unit,
                rateCents: it.rateMinor,
                totalCents: it.totalMinor,
              })),
            }
          : {}),
      },
    }));
    const returnMoves = returns.map((r) => ({
      sortIndex: r.sortIndex,
      move: {
        kind: 'return' as const,
        id: r.id,
        ref: r.ref,
        supplierId: r.supplierId,
        linkedPurchaseId: r.linkedPurchaseId ?? '',
        date: r.date,
        reason: r.reason,
        status: r.status,
        lines: r.lines.map((l) => ({
          id: l.sourceId,
          description: l.description,
          qty: Number(l.qty),
          unit: l.unit,
          creditCents: l.creditMinor,
        })),
      },
    }));
    const moves = [...purchaseMoves, ...returnMoves]
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((m) => m.move);

    return {
      suppliers: supplierDtos,
      moves,
      ledger: ledgerDtos,
      updatedAt: updatedAt.toISOString(),
    };
  }

  async upsertForBranch(
    branchId: string,
    dto: UpsertLedgerWorkspaceDto,
  ): Promise<LedgerWorkspaceDto> {
    await this.prisma.$transaction(
      (tx) => this.writeWithinTx(tx, branchId, dto),
      TX_OPTS,
    );
    return this.getForBranch(branchId);
  }

  /**
   * Persist ledger workspace into relational tables inside a caller-provided
   * transaction. Used by `upsertForBranch` and the atomic daily commit (I3).
   * Pass `deferPayables` when the caller re-projects payables once at the end.
   */
  async writeWithinTx(
    tx: Prisma.TransactionClient,
    branchId: string,
    dto: UpsertLedgerWorkspaceDto,
    opts?: { deferPayables?: boolean },
  ): Promise<void> {
    await this.relationalSync.syncLedgerWorkspace(
      branchId,
      { suppliers: dto.suppliers, moves: dto.moves, ledger: dto.ledger },
      tx,
      opts,
    );
  }
}
