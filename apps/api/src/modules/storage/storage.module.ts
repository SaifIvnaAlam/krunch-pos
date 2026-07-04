import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { MediaController } from './media.controller';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [RbacModule],
  controllers: [StorageController, MediaController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
