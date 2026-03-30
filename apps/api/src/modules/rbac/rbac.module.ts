import { Module } from '@nestjs/common';
import { RbacGuard } from './rbac.guard';
import { RbacService } from './rbac.service';

@Module({
  providers: [RbacGuard, RbacService],
  exports: [RbacGuard, RbacService],
})
export class RbacModule {}
