import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { StorageModule } from '../storage/storage.module';
import { CaptureSessionsController } from './capture-sessions.controller';
import { CaptureSessionsService } from './capture-sessions.service';

@Module({
  imports: [RbacModule, StorageModule],
  controllers: [CaptureSessionsController],
  providers: [CaptureSessionsService],
  exports: [CaptureSessionsService],
})
export class CaptureSessionsModule {}
