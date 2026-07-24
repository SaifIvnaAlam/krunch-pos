import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { ExpenseReportsService } from './expense-reports.service';
import { ReportQueryDto } from './dto/report-query.dto';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Expense reports')
@Controller('expense-reports')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class ExpenseReportsController {
  constructor(private readonly reports: ExpenseReportsService) {}

  @Get('summary')
  @RequirePermission('daily_entry:read')
  @ApiOperation({
    summary: 'Payables dashboard: Total / Paid / Due, by category and month (incl. salary)',
  })
  summary(@Query() query: ReportQueryDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.reports.summary(user.branchId, query);
  }
}
