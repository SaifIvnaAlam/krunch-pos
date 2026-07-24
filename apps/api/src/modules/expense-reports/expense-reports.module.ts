import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ExpenseReportsController } from './expense-reports.controller';
import { ExpenseReportsService } from './expense-reports.service';

@Module({
  imports: [RbacModule],
  controllers: [ExpenseReportsController],
  providers: [ExpenseReportsService],
  exports: [ExpenseReportsService],
})
export class ExpenseReportsModule {}
