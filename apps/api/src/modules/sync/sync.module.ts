import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SyncGateway } from './sync.gateway';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthModule],
  providers: [SyncGateway, SyncService],
  exports: [SyncService],
})
export class SyncModule {}
