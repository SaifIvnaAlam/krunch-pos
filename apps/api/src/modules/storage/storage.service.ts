import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  assertBranchStorageKey,
  normalizeStorageObjectKey,
} from '../../common/storage-key';

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

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private bucket = '';
  private defaultExpiresIn = 900;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const endpoint = this.config.get<string>('S3_ENDPOINT', '').trim();
    const accessKey = this.config.get<string>('S3_ACCESS_KEY', '').trim();
    const secretKey = this.config.get<string>('S3_SECRET_KEY', '').trim();
    this.bucket = this.config.get<string>('S3_BUCKET', 'krunch-pos').trim();
    this.defaultExpiresIn = this.config.get<number>(
      'S3_PRESIGN_EXPIRY_SECONDS',
      900,
    );

    if (!endpoint || !accessKey || !secretKey) {
      this.logger.warn(
        'S3 storage not configured (set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY)',
      );
      return;
    }

    this.client = new S3Client({
      endpoint,
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: this.config.get<string>('S3_FORCE_PATH_STYLE', 'true') === 'true',
    });

    this.logger.log(`Object storage ready (bucket: ${this.bucket})`);
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

  async presignUpload(
    key: string,
    contentType: string,
    expiresIn = this.defaultExpiresIn,
  ): Promise<PresignedUpload> {
    const client = this.requireClient();
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
    const client = this.requireClient();
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
}
