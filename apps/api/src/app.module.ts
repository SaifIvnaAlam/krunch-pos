import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { AuditModule } from './modules/audit/audit.module';
import { StaffModule } from './modules/staff/staff.module';
import { BranchesModule } from './modules/branches/branches.module';
import { OrdersModule } from './modules/orders/orders.module';
import { MenuModule } from './modules/menu/menu.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { KitchenModule } from './modules/kitchen/kitchen.module';
import { SyncModule } from './modules/sync/sync.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    RbacModule,
    AuditModule,
    StaffModule,
    BranchesModule,
    OrdersModule,
    MenuModule,
    InventoryModule,
    PaymentsModule,
    KitchenModule,
    SyncModule,
    ReportsModule,
  ],
})
export class AppModule {}
