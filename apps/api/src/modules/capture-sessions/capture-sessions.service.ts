import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  collectDailyEntryAttachmentRefs,
  mediaIdsFromAttachmentRefs,
} from '../../common/daily-entry-attachments';
import { mediaIdFromRef } from '../../common/storage-key';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { StorageService } from '../storage/storage.service';

const MAX_ITEMS = 40;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 60;

export type CaptureSessionItem = {
  id: string;
  mediaRef: string;
  createdAt: string;
};

type CaptureSessionRecord = {
  branchId: string;
  staffId: string;
  dateKey: string;
  items: CaptureSessionItem[];
  /** Assigned onto the open form; kept until save or session close. */
  retainedRefs?: string[];
};

/** `YYYY-MM-DD` → `ddmmyyyy` (e.g. 2026-07-29 → 29072026). */
export function dateKeyToCaptureSlug(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!m) {
    throw new BadRequestException('dateKey must be YYYY-MM-DD.');
  }
  const [, y, mo, d] = m;
  return `${d}${mo}${y}`;
}

export function isCaptureSlug(token: string): boolean {
  return /^\d{8}$/.test(token.trim());
}

@Injectable()
export class CaptureSessionsService implements OnModuleInit {
  private readonly logger = new Logger(CaptureSessionsService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const n = await this.purgeOrphanDailyMedia();
      if (n > 0) {
        this.logger.log(`Startup orphan media purge removed ${n} asset(s)`);
      }
    } catch (error) {
      this.logger.warn(`Startup orphan media purge failed: ${error}`);
    }
  }

  private redisKey(token: string): string {
    return `capture:${token.trim()}`;
  }

  private assertSlug(token: string): string {
    const slug = token.trim();
    if (!isCaptureSlug(slug)) {
      throw new NotFoundException('Capture session not found.');
    }
    return slug;
  }

  private normalizeSession(raw: CaptureSessionRecord): CaptureSessionRecord {
    return {
      ...raw,
      items: Array.isArray(raw.items) ? raw.items : [],
      retainedRefs: Array.isArray(raw.retainedRefs) ? raw.retainedRefs : [],
    };
  }

  private async load(token: string): Promise<CaptureSessionRecord> {
    const slug = this.assertSlug(token);
    const raw = await this.redis.get(this.redisKey(slug));
    if (!raw) {
      throw new NotFoundException(
        'Capture session not found. Open Attachment QR on the PC for this date first.',
      );
    }
    try {
      return this.normalizeSession(JSON.parse(raw) as CaptureSessionRecord);
    } catch {
      throw new NotFoundException('Capture session not found.');
    }
  }

  private async save(
    token: string,
    session: CaptureSessionRecord,
  ): Promise<void> {
    // No TTL — session stays until the PC closes it.
    await this.redis.set(
      this.redisKey(token),
      JSON.stringify(this.normalizeSession(session)),
    );
  }

  private async deleteRefs(
    branchId: string,
    refs: readonly string[],
  ): Promise<void> {
    for (const ref of refs) {
      try {
        await this.storage.deletePersistedRef(branchId, ref);
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  /** Media still allowed outside a saved daily entry (open capture trays). */
  private async protectedMediaIds(branchId?: string): Promise<string[]> {
    const keys = await this.redis.keys('capture:*');
    const ids: string[] = [];
    for (const key of keys) {
      if (key.startsWith('capture_rl:')) continue;
      const raw = await this.redis.get(key);
      if (!raw) continue;
      try {
        const session = this.normalizeSession(
          JSON.parse(raw) as CaptureSessionRecord,
        );
        if (branchId && session.branchId !== branchId) continue;
        for (const item of session.items) {
          const id = mediaIdFromRef(item.mediaRef);
          if (id) ids.push(id);
        }
        for (const ref of session.retainedRefs ?? []) {
          const id = mediaIdFromRef(ref);
          if (id) ids.push(id);
        }
      } catch {
        // skip corrupt
      }
    }
    return ids;
  }

  /**
   * Remove receipts / void-attachments that are not on any daily entry and not
   * held by an open capture session (or an explicit protect list, e.g. the
   * refs about to be written on save).
   */
  async purgeOrphanDailyMedia(
    branchId?: string,
    extraProtectMediaIds: readonly string[] = [],
  ): Promise<number> {
    const protectMediaIds = [
      ...(await this.protectedMediaIds(branchId)),
      ...extraProtectMediaIds,
    ];
    return this.storage.purgeOrphanDailyEntryMedia({
      branchId,
      protectMediaIds,
    });
  }

  private async assertRateLimit(token: string): Promise<void> {
    const key = `capture_rl:${token}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
    if (count > RATE_LIMIT_MAX) {
      throw new HttpException(
        'Too many capture requests. Try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Open or reuse the date-keyed session (`/capture/ddmmyyyy`).
   * Does not wipe existing tray items.
   */
  async create(
    branchId: string,
    staffId: string,
    dateKey: string,
  ): Promise<{ token: string }> {
    const token = dateKeyToCaptureSlug(dateKey);
    const raw = await this.redis.get(this.redisKey(token));
    if (raw) {
      try {
        const existing = this.normalizeSession(
          JSON.parse(raw) as CaptureSessionRecord,
        );
        if (existing.branchId === branchId) {
          existing.staffId = staffId;
          existing.dateKey = dateKey.trim();
          await this.save(token, existing);
          return { token };
        }
        await this.deleteRefs(
          existing.branchId,
          [
            ...existing.items.map((i) => i.mediaRef),
            ...(existing.retainedRefs ?? []),
          ],
        );
      } catch {
        // replace corrupt value
      }
    }

    const session: CaptureSessionRecord = {
      branchId,
      staffId,
      dateKey: dateKey.trim(),
      items: [],
      retainedRefs: [],
    };
    await this.save(token, session);
    return { token };
  }

  async getPublic(token: string): Promise<{ items: CaptureSessionItem[] }> {
    const session = await this.load(token);
    return { items: session.items };
  }

  async presign(
    token: string,
    contentType: string,
  ): Promise<{
    uploadUrl: string;
    mediaId: string;
    publicUrl: string;
    mediaRef: string;
    expiresIn: number;
  }> {
    await this.assertRateLimit(token);
    const session = await this.load(token);
    if (session.items.length >= MAX_ITEMS) {
      throw new UnprocessableEntityException(
        `At most ${MAX_ITEMS} photos per capture session.`,
      );
    }
    const ct = contentType.trim().toLowerCase();
    if (!ct.startsWith('image/')) {
      throw new UnprocessableEntityException('Only image uploads are allowed.');
    }
    const signed = await this.storage.presignMediaUpload(
      session.branchId,
      contentType.trim(),
      'receipts',
    );
    return {
      uploadUrl: signed.uploadUrl,
      mediaId: signed.mediaId,
      publicUrl: signed.publicUrl,
      mediaRef: `media:${signed.mediaId}`,
      expiresIn: signed.expiresIn,
    };
  }

  async registerItem(
    token: string,
    mediaRef: string,
  ): Promise<CaptureSessionItem> {
    await this.assertRateLimit(token);
    const session = await this.load(token);
    if (session.items.length >= MAX_ITEMS) {
      throw new UnprocessableEntityException(
        `At most ${MAX_ITEMS} photos per capture session.`,
      );
    }
    const mediaId = mediaIdFromRef(mediaRef);
    if (!mediaId) {
      throw new UnprocessableEntityException('Invalid media ref.');
    }
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
    });
    if (!asset || asset.branchId !== session.branchId) {
      throw new UnprocessableEntityException('Media does not belong to this session.');
    }
    if (session.items.some((i) => i.mediaRef === mediaRef.trim())) {
      const existing = session.items.find((i) => i.mediaRef === mediaRef.trim())!;
      return existing;
    }
    const item: CaptureSessionItem = {
      id: randomUUID(),
      mediaRef: mediaRef.trim(),
      createdAt: new Date().toISOString(),
    };
    session.items.push(item);
    await this.save(token, session);
    return item;
  }

  async removeItem(
    token: string,
    itemId: string,
    opts: { keepMedia: boolean; branchId?: string },
  ): Promise<{ ok: true }> {
    const session = await this.load(token);
    if (opts.branchId && session.branchId !== opts.branchId) {
      throw new NotFoundException('Capture session not found.');
    }
    const idx = session.items.findIndex((i) => i.id === itemId);
    if (idx < 0) {
      throw new NotFoundException('Capture item not found.');
    }
    const removed = session.items[idx]!;
    session.items.splice(idx, 1);
    if (opts.keepMedia) {
      const retained = new Set(session.retainedRefs ?? []);
      retained.add(removed.mediaRef);
      session.retainedRefs = [...retained];
    }
    await this.save(token, session);
    if (!opts.keepMedia) {
      await this.deleteRefs(session.branchId, [removed.mediaRef]);
    }
    return { ok: true as const };
  }

  async close(token: string, branchId: string): Promise<{ ok: true }> {
    const slug = this.assertSlug(token);
    const raw = await this.redis.get(this.redisKey(slug));
    if (!raw) {
      await this.purgeOrphanDailyMedia(branchId);
      return { ok: true as const };
    }
    let session: CaptureSessionRecord;
    try {
      session = this.normalizeSession(JSON.parse(raw) as CaptureSessionRecord);
    } catch {
      await this.redis.del(this.redisKey(slug));
      await this.purgeOrphanDailyMedia(branchId);
      return { ok: true as const };
    }
    if (session.branchId !== branchId) {
      throw new NotFoundException('Capture session not found.');
    }

    // Drop tray + form-retained refs that never landed on a saved daily entry.
    const candidateRefs = [
      ...session.items.map((i) => i.mediaRef),
      ...(session.retainedRefs ?? []),
    ];
    await this.redis.del(this.redisKey(slug));

    const entries = await this.prisma.dailyEntry.findMany({
      where: { branchId },
      select: {
        voidSaleAttachmentDataUrls: true,
        expenseLineRows: { select: { receiptDataUrls: true } },
      },
    });
    const savedIds = new Set<string>();
    for (const entry of entries) {
      for (const id of mediaIdsFromAttachmentRefs(
        collectDailyEntryAttachmentRefs({
          voidSaleAttachmentDataUrls: entry.voidSaleAttachmentDataUrls,
          expenseLines: entry.expenseLineRows,
        }),
      )) {
        savedIds.add(id);
      }
    }

    const toDelete = candidateRefs.filter((ref) => {
      const id = mediaIdFromRef(ref);
      return id != null && !savedIds.has(id);
    });
    await this.deleteRefs(branchId, toDelete);
    await this.purgeOrphanDailyMedia(branchId);
    return { ok: true as const };
  }
}
