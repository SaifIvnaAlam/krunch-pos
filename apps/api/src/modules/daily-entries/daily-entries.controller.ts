import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { DailyEntriesService } from './daily-entries.service';
import { LockDailyEntryDto } from './dto/lock-daily-entry.dto';
import { UnlockDailyEntryDto } from './dto/unlock-daily-entry.dto';
import { UpsertDailyEntryDto } from './dto/upsert-daily-entry.dto';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Daily entries')
@Controller('daily-entries')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class DailyEntriesController {
  constructor(private readonly dailyEntries: DailyEntriesService) {}

  @Get()
  @RequirePermission('daily_entry:read')
  @ApiOperation({ summary: 'List daily entries for the signed-in branch' })
  list(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.dailyEntries.listForBranch(user.branchId);
  }

  @Get(':date')
  @RequirePermission('daily_entry:read')
  @ApiOperation({ summary: 'Get daily entry by calendar date (YYYY-MM-DD)' })
  getByDate(@Param('date') date: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.dailyEntries.getByDate(user.branchId, date);
  }

  @Put(':date')
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Create or update daily entry for a date' })
  upsert(
    @Param('date') date: string,
    @Body() dto: UpsertDailyEntryDto,
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.dailyEntries.upsert(user.branchId, user.staffId, {
      ...dto,
      date,
    });
  }

  @Post(':date/lock')
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Lock daily entry — prevents further edits or deletion' })
  lock(
    @Param('date') date: string,
    @Body() dto: LockDailyEntryDto,
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.dailyEntries.lock(user.branchId, user.staffId, date, dto.lockedBy);
  }

  @Post(':date/unlock')
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Unlock daily entry — allows edits and deletion again' })
  unlock(
    @Param('date') date: string,
    @Body() _dto: UnlockDailyEntryDto,
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.dailyEntries.unlock(user.branchId, date);
  }

  @Delete(':date')
  @RequirePermission('daily_entry:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete daily entry for a date' })
  async remove(@Param('date') date: string, @Req() req: Request): Promise<void> {
    const user = req.user as JwtPayload;
    await this.dailyEntries.remove(user.branchId, date);
  }
}
