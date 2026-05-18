import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { DailyEntriesController } from './daily-entries.controller';
import { DailyEntriesService } from './daily-entries.service';

@Module({
  imports: [RbacModule],
  controllers: [DailyEntriesController],
  providers: [DailyEntriesService],
  exports: [DailyEntriesService],
})
export class DailyEntriesModule {}
