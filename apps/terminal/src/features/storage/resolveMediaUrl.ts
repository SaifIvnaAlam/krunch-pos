import { isInlineDataRef, fromStorageRef } from "./storageRef";
import { presignDownload } from "./storageApi";

type CacheEntry = { url: string; expiresAt: number };

const urlCache = new Map<string, CacheEntry>();

function cacheGet(key: string): string | null {
  const hit = urlCache.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    urlCache.delete(key);
    return null;
  }
  return hit.url;
}

function cacheSet(key: string, url: string, expiresInSeconds: number): void {
  urlCache.set(key, {
    url,
    expiresAt: Date.now() + Math.max(30, expiresInSeconds - 60) * 1000,
  });
}

/** Resolve `data:…`, `storage:…`, or plain https URLs for display / download. */
export async function resolveMediaUrl(ref: string): Promise<string> {
  if (!ref) return "";
  if (isInlineDataRef(ref) || ref.startsWith("http://") || ref.startsWith("https://")) {
    return ref;
  }
  const key = fromStorageRef(ref);
  if (!key) return ref;

  const cached = cacheGet(key);
  if (cached) return cached;

  const { downloadUrl, expiresIn } = await presignDownload(key);
  cacheSet(key, downloadUrl, expiresIn);
  return downloadUrl;
}
