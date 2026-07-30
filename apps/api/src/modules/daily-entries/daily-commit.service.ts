import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RelationalSyncService } from '../relational-sync/relational-sync.service';
import { LedgerService } from '../ledger/ledger.service';
import { PayrollService } from '../payroll/payroll.service';
import { DailyEntriesService, DailyEntryDto } from './daily-entries.service';
import { CommitDailyEntryDto } from './dto/commit-daily-entry.dto';

// The combined write touches every module; give it the largest budget (matches
// the ledger workspace tx, which is the heaviest single leg).
const TX_OPTS = { timeout: 120000, maxWait: 20000 } as const;

/**
 * I3 — atomic cross-module daily commit. Replaces the legacy frontend-orchestrated
 * sequence of three independent PUTs (payroll → ledger → daily), which could
 * orphan data if any step failed mid-sequence. Here the salary bundle, ledger
 * workspace, and daily entry — relational projections only — plus a single
 * payables reprojection all commit or roll back together.
 */
@Injectable()
export class DailyCommitService {
  private readonly logger = new Logger(DailyCommitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly relationalSync: RelationalSyncService,
    private readonly ledger: LedgerService,
    private readonly payroll: PayrollService,
    private readonly dailyEntries: DailyEntriesService,
  ) {}

  async commit(
    branchId: string,
    staffId: string,
    dto: CommitDailyEntryDto,
  ): Promise<DailyEntryDto> {
    // S3 side-effects (attachment cleanup) + lock guard run before the tx.
    await this.dailyEntries.prepareUpsert(branchId, dto.entry);

    const savedDate = await this.prisma.$transaction(async (tx) => {
      // Ledger first: the daily lines' ledgerEntryId / purchaseOrderId FKs are
      // validated against the rows this write creates.
      if (dto.ledger) {
        await this.ledger.writeWithinTx(tx, branchId, dto.ledger, {
          deferPayables: true,
        });
      }
      // Salary next: staff payouts the daily lines reference.
      if (dto.salary) {
        await this.payroll.writeWithinTx(tx, branchId, dto.salary, {
          deferPayables: true,
        });
      }
      // Daily entry last, once its cross-module targets exist.
      const row = await this.dailyEntries.upsertWithinTx(
        tx,
        branchId,
        staffId,
        dto.entry,
        { deferPayables: true },
      );
      // One payables reprojection over the fully-written relational state.
      await this.relationalSync.syncPayables(branchId, tx);
      return row.date;
    }, TX_OPTS);

    const result = await this.dailyEntries.getByDate(branchId, savedDate);
    if (!result) {
      // Should be impossible: the row was just committed in this request.
      throw new Error('Daily entry vanished immediately after commit.');
    }
    return result;
  }
}
