import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { CaptureSessionsService } from './capture-sessions.service';
import { CapturePresignDto } from './dto/capture-presign.dto';
import { CreateCaptureSessionDto } from './dto/create-capture-session.dto';
import { RegisterCaptureItemDto } from './dto/register-capture-item.dto';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Capture sessions')
@Controller('capture-sessions')
export class CaptureSessionsController {
  constructor(private readonly captureSessions: CaptureSessionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('daily_entry:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a phone-capture session (QR token)' })
  create(@Body() dto: CreateCaptureSessionDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.captureSessions.create(
      user.branchId,
      user.staffId,
      dto.dateKey,
    );
  }

  @Get(':token')
  @ApiOperation({ summary: 'Get capture session status + items (public token)' })
  get(@Param('token') token: string) {
    return this.captureSessions.getPublic(token);
  }

  @Post(':token/presign')
  @ApiOperation({ summary: 'Presign an image upload for this capture session' })
  presign(@Param('token') token: string, @Body() dto: CapturePresignDto) {
    return this.captureSessions.presign(token, dto.contentType);
  }

  @Post(':token/items')
  @ApiOperation({ summary: 'Register an uploaded media ref on the session' })
  registerItem(
    @Param('token') token: string,
    @Body() dto: RegisterCaptureItemDto,
  ) {
    return this.captureSessions.registerItem(token, dto.mediaRef);
  }

  @Delete(':token/items/:itemId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Remove a tray item. Purges storage unless keepMedia=1 (assigned to a form row).',
  })
  removeItem(
    @Param('token') token: string,
    @Param('itemId') itemId: string,
    @Query('keepMedia') keepMedia?: string,
  ) {
    const keep =
      keepMedia === '1' || keepMedia === 'true' || keepMedia === 'yes';
    return this.captureSessions.removeItem(token, itemId, { keepMedia: keep });
  }

  @Delete(':token')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('daily_entry:write')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close session and purge unclaimed media' })
  close(@Param('token') token: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.captureSessions.close(token, user.branchId);
  }
}
