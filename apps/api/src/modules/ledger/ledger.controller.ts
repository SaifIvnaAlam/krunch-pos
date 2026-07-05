import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { UpsertLedgerWorkspaceDto } from './dto/upsert-ledger-workspace.dto';
import { LedgerService } from './ledger.service';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Ledger')
@Controller('ledger')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('workspace')
  @RequirePermission('daily_entry:read')
  @ApiOperation({ summary: 'Get cashbooks workspace for the signed-in branch' })
  getWorkspace(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.ledger.getForBranch(user.branchId);
  }

  @Put('workspace')
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Save cashbooks workspace for the signed-in branch' })
  upsertWorkspace(@Req() req: Request, @Body() dto: UpsertLedgerWorkspaceDto) {
    const user = req.user as JwtPayload;
    return this.ledger.upsertForBranch(user.branchId, dto);
  }
}
