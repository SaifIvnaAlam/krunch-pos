import { ATTACHMENT_IMAGE_MAX_BYTES, compressImageFile } from "./compressImage";
import { presignMediaUpload } from "./storageApi";
import { toMediaRef } from "./storageRef";

export type UploadScope =
  | "menu"
  | "receipts"
  | "ledger"
  | "void-attachments"
  | "misc";

const ATTACHMENT_SCOPES = new Set<UploadScope>([
  "receipts",
  "ledger",
  "void-attachments",
  "misc",
]);

/**
 * Compress (images only), presign, PUT to MinIO. Returns a `media:…` ref for persistence.
 */
export async function uploadFileToStorage(
  file: File,
  scope: UploadScope,
  _label?: string,
): Promise<string> {
  let body: File = file;
  const isImage =
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|heic|heif|webp|bmp|tiff?)$/i.test(file.name);
  if (isImage && file.type !== "image/gif" && !/\.gif$/i.test(file.name)) {
    try {
      const compressOpts =
        scope === "menu"
          ? { maxWidth: 800, maxHeight: 800, quality: 0.78, mimeType: "image/webp" as const }
          : ATTACHMENT_SCOPES.has(scope)
            ? { maxBytes: ATTACHMENT_IMAGE_MAX_BYTES }
            : undefined;
      body = await compressImageFile(file, compressOpts);
    } catch {
      // HEIC / exotic formats may fail canvas decode — upload original bytes.
      body = file;
    }
  }

  const { uploadUrl, mediaId } = await presignMediaUpload(
    scope,
    body.type || "application/octet-stream",
  );

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": body.type || "application/octet-stream" },
    body,
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status}). Check storage connectivity.`);
  }

  return toMediaRef(mediaId);
}
