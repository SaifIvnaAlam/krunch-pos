/** Strip optional `storage:` / `media:` prefix from client refs before persisting or signing. */
export function normalizeStorageObjectKey(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('storage:')) {
    return trimmed.slice('storage:'.length);
  }
  return trimmed;
}

export function isMediaRef(input: string): boolean {
  return input.trim().startsWith('media:');
}

export function mediaIdFromRef(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('media:')) return null;
  const id = trimmed.slice('media:'.length);
  return id.length > 0 ? id : null;
}

/** Persisted image ref for menu items and attachments (`media:` or legacy `storage:` / object key). */
export function normalizeImageKey(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('media:')) return trimmed;
  return normalizeStorageObjectKey(trimmed);
}

export function assertBranchStorageKey(branchId: string, key: string): void {
  const prefix = `branches/${branchId}/`;
  if (!key.startsWith(prefix) || key.includes('..')) {
    throw new Error('Storage key is outside this branch');
  }
}
