import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { UpsertSalaryWorkspaceDto } from './dto/upsert-salary-workspace.dto';
import { PayrollService } from './payroll.service';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Payroll')
@Controller('payroll')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('workspace')
  @RequirePermission('daily_entry:read')
  @ApiOperation({ summary: 'Load monthly salary registers for the branch' })
  getWorkspace(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.payroll.getWorkspace(user.branchId);
  }

  @Put('workspace')
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Save salary workspace (monthly sheets, rows, payouts)' })
  upsertWorkspace(@Body() dto: UpsertSalaryWorkspaceDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.payroll.upsertWorkspace(user.branchId, dto);
  }
}
