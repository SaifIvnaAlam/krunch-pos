/** Strip optional `storage:` prefix from client refs before persisting or signing. */
export function normalizeStorageObjectKey(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('storage:')) {
    return trimmed.slice('storage:'.length);
  }
  return trimmed;
}

export function assertBranchStorageKey(branchId: string, key: string): void {
  const prefix = `branches/${branchId}/`;
  if (!key.startsWith(prefix) || key.includes('..')) {
    throw new Error('Storage key is outside this branch');
  }
}
