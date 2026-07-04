import { isInlineDataRef, fromMediaRef, fromStorageRef } from "./storageRef";
import { getMediaPublicUrl } from "@/shared/config/env";
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

/** Resolve `data:…`, `media:…`, `storage:…`, or plain https URLs for display / download. */
export async function resolveMediaUrl(ref: string): Promise<string> {
  if (!ref) return "";
  if (
    isInlineDataRef(ref) ||
    ref.startsWith("blob:") ||
    ref.startsWith("http://") ||
    ref.startsWith("https://")
  ) {
    return ref;
  }

  const mediaId = fromMediaRef(ref);
  if (mediaId) {
    return getMediaPublicUrl(mediaId);
  }

  const key = fromStorageRef(ref);
  if (!key) return ref;

  const cached = cacheGet(key);
  if (cached) return cached;

  const { downloadUrl, expiresIn } = await presignDownload(key);
  cacheSet(key, downloadUrl, expiresIn);
  return downloadUrl;
}
