import { isMediaRef, mediaIdFromRef, normalizeStorageObjectKey } from './storage-key';

export function isPersistedStorageRef(ref: string): boolean {
  const trimmed = ref.trim();
  return trimmed.startsWith('media:') || trimmed.startsWith('storage:');
}

/** Collect `media:` / `storage:` refs from a daily entry row or DTO payload. */
export function collectDailyEntryAttachmentRefs(row: {
  voidSaleAttachmentDataUrls?: unknown;
  expenseLines?: unknown;
}): string[] {
  const refs: string[] = [];

  if (Array.isArray(row.voidSaleAttachmentDataUrls)) {
    for (const value of row.voidSaleAttachmentDataUrls) {
      if (typeof value === 'string' && isPersistedStorageRef(value)) {
        refs.push(value.trim());
      }
    }
  }

  if (Array.isArray(row.expenseLines)) {
    for (const line of row.expenseLines) {
      if (!line || typeof line !== 'object') continue;
      const receipts = (line as { receiptDataUrls?: unknown }).receiptDataUrls;
      if (!Array.isArray(receipts)) continue;
      for (const value of receipts) {
        if (typeof value === 'string' && isPersistedStorageRef(value)) {
          refs.push(value.trim());
        }
      }
    }
  }

  return refs;
}

export function attachmentRefsDropped(
  previousRefs: readonly string[],
  nextRefs: readonly string[],
): string[] {
  const nextSet = new Set(nextRefs);
  return previousRefs.filter((ref) => !nextSet.has(ref));
}

export { isMediaRef, mediaIdFromRef, normalizeStorageObjectKey };
