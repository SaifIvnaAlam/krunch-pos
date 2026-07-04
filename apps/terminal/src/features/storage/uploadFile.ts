import { compressImageFile } from "./compressImage";
import { presignMediaUpload } from "./storageApi";
import { toMediaRef } from "./storageRef";

export type UploadScope =
  | "menu"
  | "receipts"
  | "ledger"
  | "void-attachments"
  | "misc";

function isHeicFile(file: File): boolean {
  return (
    /\.(heic|heif)$/i.test(file.name) ||
    file.type === "image/heic" ||
    file.type === "image/heif"
  );
}

/**
 * Compress (images only), presign, PUT to MinIO. Returns a `media:…` ref for persistence.
 */
export async function uploadFileToStorage(
  file: File,
  scope: UploadScope,
  _label?: string,
): Promise<string> {
  let body: File = file;
  if (
    file.type.startsWith("image/") &&
    file.type !== "image/gif" &&
    !isHeicFile(file)
  ) {
    try {
      const menuOpts =
        scope === "menu"
          ? { maxWidth: 800, maxHeight: 800, quality: 0.78, mimeType: "image/webp" as const }
          : undefined;
      body = await compressImageFile(file, menuOpts);
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
