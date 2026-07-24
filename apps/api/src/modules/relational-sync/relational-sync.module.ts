import { Global, Module } from '@nestjs/common';
import { RelationalSyncService } from './relational-sync.service';

/**
 * Global so any feature service can inject RelationalSyncService to mirror its
 * JSON writes into the relational tables (Stage D1). PrismaService is global.
 */
@Global()
@Module({
  providers: [RelationalSyncService],
  exports: [RelationalSyncService],
})
export class RelationalSyncModule {}
