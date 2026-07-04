import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from './storage.service';

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Serve uploaded media by stable id (public, unguessable UUID)',
  })
  async serve(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) {
      throw new NotFoundException('Media not found');
    }

    const object = await this.storage.getObject(asset.objectKey);
    if (!object.body) {
      throw new NotFoundException('Media file missing');
    }

    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (object.contentLength != null) {
      res.setHeader('Content-Length', String(object.contentLength));
    }

    object.body.pipe(res);
  }
}
