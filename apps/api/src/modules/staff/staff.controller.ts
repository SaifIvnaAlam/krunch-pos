import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { Request } from 'express';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Staff')
@Controller('staff')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current staff profile + permissions' })
  async getMe(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.staffService.getMe(user.staffId);
  }

  @Get()
  @RequirePermission('staff:read')
  @ApiOperation({ summary: 'List staff (branch-scoped)' })
  async listStaff(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.staffService.listStaff(user.branchId);
  }

  @Post()
  @RequirePermission('staff:create')
  @ApiOperation({ summary: 'Create staff member' })
  @ApiResponse({ status: 201, description: 'Staff created' })
  async createStaff(@Body() dto: { name: string; email?: string; pin: string; nfcCardUid?: string; primaryBranchId?: string }, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.staffService.createStaff(dto, user.staffId, user.branchId, user.terminalId);
  }

  @Get(':id')
  @RequirePermission('staff:read')
  @ApiOperation({ summary: 'Get staff profile' })
  async getStaff(@Param('id') id: string) {
    return this.staffService.getStaff(id);
  }

  @Patch(':id')
  @RequirePermission('staff:edit')
  @ApiOperation({ summary: 'Update staff' })
  async updateStaff(
    @Param('id') id: string,
    @Body() dto: { name?: string; email?: string; pin?: string; nfcCardUid?: string; isActive?: boolean },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.staffService.updateStaff(id, dto, user.staffId, user.branchId, user.terminalId);
  }

  @Post(':id/roles')
  @RequirePermission('staff:assign_role')
  @ApiOperation({ summary: 'Assign role to staff' })
  async assignRole(
    @Param('id') id: string,
    @Body() dto: { roleId: string; branchId?: string; validFrom?: string; validUntil?: string },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.staffService.assignRole(id, dto, user.staffId, user.branchId, user.terminalId);
  }

  @Delete(':id/roles/:rid')
  @RequirePermission('staff:assign_role')
  @ApiOperation({ summary: 'Remove role from staff' })
  async removeRole(@Param('id') id: string, @Param('rid') rid: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    await this.staffService.removeRole(id, rid, user.staffId, user.branchId, user.terminalId);
    return { message: 'Role removed' };
  }

  @Post(':id/elevate')
  @RequirePermission('staff:assign_role')
  @ApiOperation({ summary: 'Temporary permission elevation' })
  async elevate(
    @Param('id') id: string,
    @Body() dto: { permissions: string[]; branchId: string; validFrom: string; validUntil: string },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.staffService.elevatePermissions(id, dto, user.staffId, user.branchId, user.terminalId);
  }
}
