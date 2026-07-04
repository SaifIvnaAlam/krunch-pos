export function extensionForContentType(contentType: string): string {
  const normalized = contentType.trim().toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'application/pdf': 'pdf',
  };
  return map[normalized] ?? 'bin';
}

export function buildMediaObjectKey(
  branchId: string,
  mediaId: string,
  contentType: string,
): string {
  const ext = extensionForContentType(contentType);
  return `branches/${branchId}/media/${mediaId}.${ext}`;
}
