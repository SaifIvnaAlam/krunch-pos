import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RelationalSyncModule } from './modules/relational-sync/relational-sync.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { AuditModule } from './modules/audit/audit.module';
import { StaffModule } from './modules/staff/staff.module';
import { DailyEntriesModule } from './modules/daily-entries/daily-entries.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { ExpenseCategoriesModule } from './modules/expense-categories/expense-categories.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ExpenseReportsModule } from './modules/expense-reports/expense-reports.module';
import { StorageModule } from './modules/storage/storage.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    RelationalSyncModule,
    HealthModule,
    AuthModule,
    RbacModule,
    AuditModule,
    StaffModule,
    DailyEntriesModule,
    LedgerModule,
    PayrollModule,
    EmployeesModule,
    ExpenseCategoriesModule,
    ExpensesModule,
    PaymentsModule,
    ExpenseReportsModule,
    StorageModule,
  ],
})
export class AppModule {}
