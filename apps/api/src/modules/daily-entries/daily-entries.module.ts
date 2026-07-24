import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { StorageModule } from '../storage/storage.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PayrollModule } from '../payroll/payroll.module';
import { DailyEntriesController } from './daily-entries.controller';
import { DailyEntriesService } from './daily-entries.service';
import { DailyCommitService } from './daily-commit.service';

@Module({
  imports: [RbacModule, StorageModule, LedgerModule, PayrollModule],
  controllers: [DailyEntriesController],
  providers: [DailyEntriesService, DailyCommitService],
  exports: [DailyEntriesService],
})
export class DailyEntriesModule {}
