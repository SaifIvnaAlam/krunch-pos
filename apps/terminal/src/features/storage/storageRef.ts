/** Stored in DB / JSON instead of inline base64. */
export const STORAGE_REF_PREFIX = "storage:";

export function toStorageRef(objectKey: string): string {
  return `${STORAGE_REF_PREFIX}${objectKey}`;
}

export function fromStorageRef(value: string): string | null {
  if (!value.startsWith(STORAGE_REF_PREFIX)) return null;
  const key = value.slice(STORAGE_REF_PREFIX.length);
  return key.length > 0 ? key : null;
}

export function isStorageRef(value: string): boolean {
  return value.startsWith(STORAGE_REF_PREFIX);
}

export function isInlineDataRef(value: string): boolean {
  return value.startsWith("data:");
}
