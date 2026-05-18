import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { StorageService } from '../storage/storage.service';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  redis: 'up' | 'down';
  storage: 'up' | 'down' | 'disabled';
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional() private readonly storage?: StorageService,
  ) {}

  async getLiveness(): Promise<{ status: 'ok'; timestamp: string }> {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  async getReadiness(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    let database: 'up' | 'down' = 'down';
    let redis: 'up' | 'down' = 'down';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    try {
      await this.redis.set('__health_check__', '1', 5);
      const v = await this.redis.get('__health_check__');
      redis = v === '1' ? 'up' : 'down';
    } catch {
      redis = 'down';
    }

    let storage: HealthStatus['storage'] = 'disabled';
    if (this.storage?.isConfigured()) {
      storage = (await this.storage.checkBucket()) === 'up' ? 'up' : 'down';
    }

    const coreUp = database === 'up' && redis === 'up';
    const storageOk = storage === 'up' || storage === 'disabled';
    const status = coreUp && storageOk ? 'ok' : 'degraded';

    return { status, database, redis, storage, timestamp };
  }
}
