import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { Request } from 'express';

interface JwtPayload { staffId: string; branchId: string; terminalId: string; roles: string[]; permissions: string[]; }

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  @RequirePermission('reports:branch')
  @ApiOperation({ summary: 'Daily sales summary' })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  async getSales(@Req() req: Request, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    const user = req.user as JwtPayload;
    return this.reportsService.getDailySales(user.branchId, { startDate, endDate });
  }

  @Get('items')
  @RequirePermission('reports:branch')
  @ApiOperation({ summary: 'Item performance' })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  async getItemPerformance(@Req() req: Request, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    const user = req.user as JwtPayload;
    return this.reportsService.getItemPerformance(user.branchId, { startDate, endDate });
  }

  @Get('staff')
  @RequirePermission('reports:branch')
  @ApiOperation({ summary: 'Server performance' })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  async getStaffPerformance(@Req() req: Request, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    const user = req.user as JwtPayload;
    return this.reportsService.getStaffPerformance(user.branchId, { startDate, endDate });
  }

  @Get('voids')
  @RequirePermission('reports:branch')
  @ApiOperation({ summary: 'Void and discount log' })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  async getVoidsAndDiscounts(@Req() req: Request, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    const user = req.user as JwtPayload;
    return this.reportsService.getVoidsAndDiscounts(user.branchId, { startDate, endDate });
  }
}
