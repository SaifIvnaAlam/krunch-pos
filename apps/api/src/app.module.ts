import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { AuditModule } from './modules/audit/audit.module';
import { StaffModule } from './modules/staff/staff.module';
import { DailyEntriesModule } from './modules/daily-entries/daily-entries.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { StorageModule } from './modules/storage/storage.module';
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
    DailyEntriesModule,
    LedgerModule,
    PayrollModule,
    EmployeesModule,
    StorageModule,
  ],
})
export class AppModule {}
