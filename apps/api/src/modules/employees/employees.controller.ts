import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { UpsertEmployeeDirectoryDto } from './dto/upsert-employee-directory.dto';
import { EmployeesService } from './employees.service';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Employees')
@Controller('employees')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get('directory')
  @RequirePermission('daily_entry:read')
  @ApiOperation({ summary: 'Load staff roster for the signed-in branch' })
  getDirectory(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.employees.getForBranch(user.branchId);
  }

  @Put('directory')
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Save staff roster for the signed-in branch' })
  upsertDirectory(@Req() req: Request, @Body() dto: UpsertEmployeeDirectoryDto) {
    const user = req.user as JwtPayload;
    return this.employees.upsertForBranch(user.branchId, dto);
  }
}
