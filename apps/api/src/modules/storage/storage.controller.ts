import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { DeleteStorageRefDto } from './dto/delete-storage-ref.dto';
import { PresignDownloadDto } from './dto/presign-download.dto';
import { PresignMediaUploadDto } from './dto/presign-media-upload.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { StorageService } from './storage.service';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Storage')
@Controller('storage')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('presign-upload')
  @RequirePermission('storage:write')
  @ApiOperation({ summary: 'Get a presigned URL to upload a file (PUT to MinIO/S3)' })
  presignUpload(@Body() dto: PresignUploadDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    const key = this.storage.branchObjectKey(user.branchId, dto.path);
    return this.storage.presignUpload(key, dto.contentType, dto.expiresIn);
  }

  @Post('presign-media-upload')
  @RequirePermission('storage:write')
  @ApiOperation({
    summary:
      'Presign upload for a new media asset (stable public URL at /media/{id})',
  })
  presignMediaUpload(@Body() dto: PresignMediaUploadDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.storage.presignMediaUpload(
      user.branchId,
      dto.contentType,
      dto.scope,
      dto.expiresIn,
    );
  }

  @Post('delete-ref')
  @RequirePermission('storage:write')
  @ApiOperation({ summary: 'Delete an uploaded file by `media:` or `storage:` ref' })
  async deleteRef(@Body() dto: DeleteStorageRefDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    await this.storage.deletePersistedRef(user.branchId, dto.ref);
    return { ok: true as const };
  }

  @Post('presign-download')
  @RequirePermission('storage:read')
  @ApiOperation({ summary: 'Get a presigned URL to download a file' })
  presignDownload(@Body() dto: PresignDownloadDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    const key = this.storage.resolveObjectKey(dto.key);
    this.storage.assertBranchCanAccess(user.branchId, key);
    return this.storage.presignDownload(key, dto.expiresIn);
  }
}
