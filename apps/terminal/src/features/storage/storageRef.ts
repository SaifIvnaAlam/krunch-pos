/** Stored in DB / JSON instead of inline base64. */
export const STORAGE_REF_PREFIX = "storage:";
export const MEDIA_REF_PREFIX = "media:";

export function toStorageRef(objectKey: string): string {
  return `${STORAGE_REF_PREFIX}${objectKey}`;
}

export function toMediaRef(mediaId: string): string {
  return `${MEDIA_REF_PREFIX}${mediaId}`;
}

export function fromStorageRef(value: string): string | null {
  if (!value.startsWith(STORAGE_REF_PREFIX)) return null;
  const key = value.slice(STORAGE_REF_PREFIX.length);
  return key.length > 0 ? key : null;
}

export function fromMediaRef(value: string): string | null {
  if (!value.startsWith(MEDIA_REF_PREFIX)) return null;
  const id = value.slice(MEDIA_REF_PREFIX.length);
  return id.length > 0 ? id : null;
}

export function isStorageRef(value: string): boolean {
  return value.startsWith(STORAGE_REF_PREFIX);
}

export function isMediaRef(value: string): boolean {
  return value.startsWith(MEDIA_REF_PREFIX);
}

export function isPersistedMediaRef(value: string): boolean {
  return isStorageRef(value) || isMediaRef(value);
}

export function isInlineDataRef(value: string): boolean {
  return value.startsWith("data:");
}
