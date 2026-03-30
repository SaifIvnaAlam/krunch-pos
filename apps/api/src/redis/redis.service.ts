import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

/**
 * Redis-backed KV with optional in-memory fallback when REDIS_DISABLED=true
 * (useful for local dev without a Redis server).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly memoryDisabled: boolean;
  private client: Redis | null = null;
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.get<string>('REDIS_DISABLED', 'false');
    this.memoryDisabled = String(raw).toLowerCase() === 'true';
  }

  async onModuleInit(): Promise<void> {
    if (this.memoryDisabled) {
      this.logger.warn('REDIS_DISABLED=true — using in-memory store (not for production)');
      return;
    }

    this.client = new Redis(
      this.configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
      {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number): number | null => {
          if (times > 3) return null;
          return Math.min(times * 200, 2000);
        },
      },
    );

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });
    this.client.on('error', (err: Error) => {
      this.logger.error('Redis connection error', err.message);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }

  private purgeExpired(key: string): void {
    const row = this.memory.get(key);
    if (!row?.expiresAt) return;
    if (Date.now() >= row.expiresAt) {
      this.memory.delete(key);
    }
  }

  private memoryGet(key: string): string | null {
    this.purgeExpired(key);
    const row = this.memory.get(key);
    if (!row) return null;
    if (row.expiresAt && Date.now() >= row.expiresAt) {
      this.memory.delete(key);
      return null;
    }
    return row.value;
  }

  async get(key: string): Promise<string | null> {
    if (this.memoryDisabled) return this.memoryGet(key);
    return this.client!.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.memoryDisabled) {
      const expiresAt =
        ttlSeconds != null ? Date.now() + ttlSeconds * 1000 : null;
      this.memory.set(key, { value, expiresAt });
      return;
    }
    if (ttlSeconds) {
      await this.client!.setex(key, ttlSeconds, value);
    } else {
      await this.client!.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (this.memoryDisabled) {
      this.memory.delete(key);
      return;
    }
    await this.client!.del(key);
  }

  async exists(key: string): Promise<boolean> {
    if (this.memoryDisabled) {
      this.purgeExpired(key);
      const row = this.memory.get(key);
      if (!row) return false;
      if (row.expiresAt && Date.now() >= row.expiresAt) {
        this.memory.delete(key);
        return false;
      }
      return true;
    }
    const result = await this.client!.exists(key);
    return result === 1;
  }

  async incr(key: string): Promise<number> {
    if (this.memoryDisabled) {
      this.purgeExpired(key);
      const cur = this.memoryGet(key);
      const next = (cur ? parseInt(cur, 10) : 0) + 1;
      const row = this.memory.get(key);
      const expiresAt = row?.expiresAt ?? null;
      this.memory.set(key, { value: String(next), expiresAt });
      return next;
    }
    return this.client!.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (this.memoryDisabled) {
      const row = this.memory.get(key);
      if (!row) return;
      this.memory.set(key, {
        value: row.value,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return;
    }
    await this.client!.expire(key, ttlSeconds);
  }

  /** @deprecated Prefer typed helpers above; exposed for advanced use. */
  getClient(): Redis {
    if (this.memoryDisabled || !this.client) {
      throw new Error('Redis client not available (REDIS_DISABLED or not connected)');
    }
    return this.client;
  }
}
