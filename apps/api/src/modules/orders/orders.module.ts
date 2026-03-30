import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RbacModule } from '../rbac/rbac.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RbacModule, AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
