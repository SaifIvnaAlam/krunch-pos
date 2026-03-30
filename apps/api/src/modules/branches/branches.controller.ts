import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
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

@ApiTags('Branches')
@Controller('branches')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @RequirePermission('system:config')
  @ApiOperation({ summary: 'List all branches' })
  async listBranches() {
    return this.branchesService.listBranches();
  }

  @Post()
  @RequirePermission('system:config')
  @ApiOperation({ summary: 'Create branch' })
  async createBranch(
    @Body() dto: { name: string; address?: string; timezone?: string },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.branchesService.createBranch(dto, user.staffId, user.terminalId);
  }

  @Get(':id')
  @RequirePermission('system:config')
  @ApiOperation({ summary: 'Get branch details' })
  async getBranch(@Param('id') id: string) {
    return this.branchesService.getBranch(id);
  }

  @Patch(':id')
  @RequirePermission('system:config')
  @ApiOperation({ summary: 'Update branch' })
  async updateBranch(
    @Param('id') id: string,
    @Body() dto: { name?: string; address?: string; timezone?: string; isActive?: boolean },
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.branchesService.updateBranch(id, dto, user.staffId, user.terminalId);
  }
}
