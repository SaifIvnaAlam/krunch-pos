import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

type VectorClock = Record<string, number>;

interface SyncOperation {
  branchId: string;
  terminalId: string;
  operation: string;
  payload: unknown;
  vectorClock: VectorClock;
  idempotencyKey: string;
  timestamp: number;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
    const merged: VectorClock = {};
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of allKeys) {
      merged[key] = Math.max(a[key] ?? 0, b[key] ?? 0);
    }
    return merged;
  }

  async processOperation(op: SyncOperation): Promise<{ accepted: boolean; vectorClock: VectorClock }> {
    const dedupKey = `sync:dedup:${op.idempotencyKey}`;
    const exists = await this.redis.exists(dedupKey);
    if (exists) {
      this.logger.debug(`Duplicate operation: ${op.idempotencyKey}`);
      const clockStr = await this.redis.get(`sync:clock:${op.branchId}`);
      const currentClock = clockStr ? JSON.parse(clockStr) as VectorClock : {};
      return { accepted: false, vectorClock: currentClock };
    }

    await this.redis.set(dedupKey, '1', 86400);

    const clockKey = `sync:clock:${op.branchId}`;
    const currentClockStr = await this.redis.get(clockKey);
    const currentClock = currentClockStr ? JSON.parse(currentClockStr) as VectorClock : {};

    const mergedClock = this.mergeVectorClocks(currentClock, op.vectorClock);
    mergedClock[op.terminalId] = (mergedClock[op.terminalId] ?? 0) + 1;

    await this.redis.set(clockKey, JSON.stringify(mergedClock));

    return { accepted: true, vectorClock: mergedClock };
  }

  async getBranchState(branchId: string): Promise<{
    vectorClock: VectorClock;
    orders: unknown[];
    menuItems: unknown[];
  }> {
    const clockStr = await this.redis.get(`sync:clock:${branchId}`);
    const vectorClock = clockStr ? JSON.parse(clockStr) as VectorClock : {};

    const [orders, menuItems] = await Promise.all([
      this.prisma.order.findMany({
        where: { branchId, status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY', 'HELD'] } },
        include: { items: true },
      }),
      this.prisma.menuItem.findMany({
        where: { branchId },
      }),
    ]);

    return { vectorClock, orders, menuItems };
  }
}
