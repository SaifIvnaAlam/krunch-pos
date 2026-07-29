import { isMediaRef, mediaIdFromRef, normalizeStorageObjectKey } from './storage-key';

/** Daily-entry upload scopes — orphans in these scopes are eligible for GC. */
export const DAILY_ENTRY_MEDIA_SCOPES = ['receipts', 'void-attachments'] as const;

export function isPersistedStorageRef(ref: string): boolean {
  const trimmed = ref.trim();
  return trimmed.startsWith('media:') || trimmed.startsWith('storage:');
}

function pushRef(refs: string[], value: unknown): void {
  if (typeof value === 'string' && isPersistedStorageRef(value)) {
    refs.push(value.trim());
  }
}

function pushRefsFromJsonArray(refs: string[], value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) pushRef(refs, item);
}

/** Collect `media:` / `storage:` refs from a daily entry row or DTO payload. */
export function collectDailyEntryAttachmentRefs(row: {
  voidSaleAttachmentDataUrls?: unknown;
  expenseLines?: unknown;
}): string[] {
  const refs: string[] = [];
  pushRefsFromJsonArray(refs, row.voidSaleAttachmentDataUrls);

  if (Array.isArray(row.expenseLines)) {
    for (const line of row.expenseLines) {
      if (!line || typeof line !== 'object') continue;
      pushRefsFromJsonArray(
        refs,
        (line as { receiptDataUrls?: unknown }).receiptDataUrls,
      );
    }
  }

  return refs;
}

/** Media ids referenced by persisted daily-entry attachment fields. */
export function mediaIdsFromAttachmentRefs(refs: readonly string[]): string[] {
  const ids: string[] = [];
  for (const ref of refs) {
    const id = mediaIdFromRef(ref);
    if (id) ids.push(id);
  }
  return ids;
}

export function attachmentRefsDropped(
  previousRefs: readonly string[],
  nextRefs: readonly string[],
): string[] {
  const nextSet = new Set(nextRefs);
  return previousRefs.filter((ref) => !nextSet.has(ref));
}

export { isMediaRef, mediaIdFromRef, normalizeStorageObjectKey };
