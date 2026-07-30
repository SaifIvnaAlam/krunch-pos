import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Prisma } from '@prisma/client';
import { Readable } from 'stream';
import {
  DAILY_ENTRY_MEDIA_SCOPES,
  collectDailyEntryAttachmentRefs,
  mediaIdsFromAttachmentRefs,
} from '../../common/daily-entry-attachments';
import {
  assertBranchStorageKey,
  isMediaRef,
  mediaIdFromRef,
  normalizeStorageObjectKey,
} from '../../common/storage-key';
import { buildMediaObjectKey } from '../../common/media-key';
import { generateMediaId } from '../../common/media-id';
import { PrismaService } from '../../prisma/prisma.service';

export interface PresignedUpload {
  uploadUrl: string;
  key: string;
  bucket: string;
  expiresIn: number;
}

export interface PresignedDownload {
  downloadUrl: string;
  key: string;
  bucket: string;
  expiresIn: number;
}

export interface PresignedMediaUpload {
  uploadUrl: string;
  mediaId: string;
  publicUrl: string;
  key: string;
  bucket: string;
  expiresIn: number;
}

export interface StoredObjectBody {
  body: Readable;
  contentType: string;
  contentLength?: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private presignClient: S3Client | null = null;
  private bucket = '';
  private defaultExpiresIn = 900;
  private internalEndpoint = '';
  private publicEndpoint = '';
  private mediaPublicBaseUrl = '';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const endpoint = this.config.get<string>('S3_ENDPOINT', '').trim();
    const accessKey = this.config.get<string>('S3_ACCESS_KEY', '').trim();
    const secretKey = this.config.get<string>('S3_SECRET_KEY', '').trim();
    this.bucket = this.config.get<string>('S3_BUCKET', 'krunch-pos').trim();
    this.defaultExpiresIn = this.config.get<number>(
      'S3_PRESIGN_EXPIRY_SECONDS',
      900,
    );
    this.internalEndpoint = endpoint;
    this.publicEndpoint =
      this.config.get<string>('S3_PUBLIC_ENDPOINT', '').trim() || endpoint;
    this.mediaPublicBaseUrl =
      this.config.get<string>('MEDIA_PUBLIC_BASE_URL', '').trim() ||
      `${this.publicEndpoint.replace(/\/+$/, '')}/media`;

    if (!endpoint || !accessKey || !secretKey) {
      this.logger.warn(
        'S3 storage not configured (set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY)',
      );
      return;
    }

    const clientConfig = {
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle:
        this.config.get<string>('S3_FORCE_PATH_STYLE', 'true') === 'true',
    };

    this.client = new S3Client({ ...clientConfig, endpoint });
    this.presignClient =
      this.publicEndpoint !== endpoint
        ? new S3Client({ ...clientConfig, endpoint: this.publicEndpoint })
        : this.client;

    this.logger.log(
      `Object storage ready (bucket: ${this.bucket}, internal: ${this.internalEndpoint}, public: ${this.publicEndpoint})`,
    );
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async checkBucket(): Promise<'up' | 'down'> {
    if (!this.client) return 'down';
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return 'up';
    } catch {
      return 'down';
    }
  }

  branchObjectKey(branchId: string, objectPath: string): string {
    const normalized = objectPath.replace(/^\/+/, '').replace(/\.\./g, '');
    if (!normalized) {
      throw new ServiceUnavailableException('Object path is required');
    }
    return `branches/${branchId}/${normalized}`;
  }

  resolveObjectKey(rawKey: string): string {
    return normalizeStorageObjectKey(rawKey);
  }

  assertBranchCanAccess(branchId: string, key: string): void {
    try {
      assertBranchStorageKey(branchId, key);
    } catch {
      throw new ForbiddenException('Invalid storage key for this branch');
    }
  }

  mediaPublicUrl(mediaId: string): string {
    return `${this.mediaPublicBaseUrl.replace(/\/+$/, '')}/${mediaId}`;
  }

  async presignMediaUpload(
    branchId: string,
    contentType: string,
    scope: string,
    expiresIn = this.defaultExpiresIn,
  ): Promise<PresignedMediaUpload> {
    const mediaId = await this.createMediaAssetRecord(
      branchId,
      contentType,
      scope,
    );
    const key = buildMediaObjectKey(branchId, mediaId, contentType);

    const { uploadUrl, bucket } = await this.presignUpload(
      key,
      contentType,
      expiresIn,
    );

    return {
      uploadUrl,
      mediaId,
      publicUrl: this.mediaPublicUrl(mediaId),
      key,
      bucket,
      expiresIn,
    };
  }

  private async createMediaAssetRecord(
    branchId: string,
    contentType: string,
    scope: string,
  ): Promise<string> {
    const maxAttempts = 8;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const mediaId = generateMediaId();
      const key = buildMediaObjectKey(branchId, mediaId, contentType);
      assertBranchStorageKey(branchId, key);

      try {
        await this.prisma.mediaAsset.create({
          data: {
            id: mediaId,
            branchId,
            objectKey: key,
            contentType,
            scope,
          },
        });
        return mediaId;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < maxAttempts - 1
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ServiceUnavailableException(
      'Could not allocate a unique media id',
    );
  }

  async deleteObject(key: string): Promise<void> {
    const client = this.requireClient();
    await client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  /**
   * Delete `receipts` / `void-attachments` MediaAssets (and S3 objects) that are
   * not referenced by any persisted daily entry. `protectMediaIds` keeps tray /
   * in-progress capture refs alive until the session closes.
   */
  async purgeOrphanDailyEntryMedia(opts?: {
    branchId?: string;
    protectMediaIds?: readonly string[];
  }): Promise<number> {
    const branchId = opts?.branchId?.trim() || undefined;
    const protect = new Set(opts?.protectMediaIds ?? []);

    const entries = await this.prisma.dailyEntry.findMany({
      where: branchId ? { branchId } : undefined,
      select: {
        voidSaleAttachmentDataUrls: true,
        expenseLineRows: { select: { receiptDataUrls: true } },
      },
    });

    const referenced = new Set<string>();
    for (const entry of entries) {
      const refs = collectDailyEntryAttachmentRefs({
        voidSaleAttachmentDataUrls: entry.voidSaleAttachmentDataUrls,
        expenseLines: entry.expenseLineRows,
      });
      for (const id of mediaIdsFromAttachmentRefs(refs)) {
        referenced.add(id);
      }
    }

    const orphans = await this.prisma.mediaAsset.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        scope: { in: [...DAILY_ENTRY_MEDIA_SCOPES] },
        ...(referenced.size > 0 || protect.size > 0
          ? {
              id: {
                notIn: [...new Set([...referenced, ...protect])],
              },
            }
          : {}),
      },
      select: { id: true, branchId: true },
    });

    let deleted = 0;
    for (const asset of orphans) {
      if (protect.has(asset.id) || referenced.has(asset.id)) continue;
      try {
        await this.deletePersistedRef(asset.branchId, `media:${asset.id}`);
        deleted += 1;
      } catch (error) {
        this.logger.warn(
          `Orphan media purge failed for ${asset.id}: ${error}`,
        );
      }
    }
    if (deleted > 0) {
      this.logger.log(
        `Purged ${deleted} orphan daily-entry media asset(s)` +
          (branchId ? ` for branch ${branchId}` : ''),
      );
    }
    return deleted;
  }

  /** Remove a persisted `media:` or `storage:` ref from object storage (and MediaAsset when applicable). */
  async deletePersistedRef(branchId: string, ref: string): Promise<void> {
    const trimmed = ref.trim();
    if (!trimmed.startsWith('media:') && !trimmed.startsWith('storage:')) {
      return;
    }

    if (isMediaRef(trimmed)) {
      const mediaId = mediaIdFromRef(trimmed);
      if (!mediaId) return;

      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: mediaId },
      });
      if (!asset) return;
      if (asset.branchId !== branchId) {
        throw new ForbiddenException('Invalid storage ref for this branch');
      }

      try {
        await this.deleteObject(asset.objectKey);
      } catch (error) {
        this.logger.warn(
          `S3 delete failed for media ${mediaId} (${asset.objectKey}): ${error}`,
        );
      }

      await this.prisma.mediaAsset.delete({ where: { id: mediaId } }).catch(() => {});
      return;
    }

    const key = normalizeStorageObjectKey(trimmed);
    assertBranchStorageKey(branchId, key);
    await this.deleteObject(key);
  }

  async getObject(key: string): Promise<StoredObjectBody> {
    const client = this.requireClient();
    const response = await client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!response.Body) {
      throw new ServiceUnavailableException('Object body missing');
    }
    return {
      body: response.Body as Readable,
      contentType: response.ContentType ?? 'application/octet-stream',
      contentLength: response.ContentLength,
    };
  }

  async presignUpload(
    key: string,
    contentType: string,
    expiresIn = this.defaultExpiresIn,
  ): Promise<PresignedUpload> {
    const client = this.requirePresignClient();
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn });
    return {
      uploadUrl,
      key,
      bucket: this.bucket,
      expiresIn,
    };
  }

  async presignDownload(
    key: string,
    expiresIn = this.defaultExpiresIn,
  ): Promise<PresignedDownload> {
    const client = this.requirePresignClient();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const downloadUrl = await getSignedUrl(client, command, { expiresIn });
    return {
      downloadUrl,
      key,
      bucket: this.bucket,
      expiresIn,
    };
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Object storage is not configured on this server',
      );
    }
    return this.client;
  }

  private requirePresignClient(): S3Client {
    if (!this.presignClient) {
      throw new ServiceUnavailableException(
        'Object storage is not configured on this server',
      );
    }
    return this.presignClient;
  }
}
