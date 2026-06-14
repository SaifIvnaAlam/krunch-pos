import { compressImageFile } from "./compressImage";
import { presignUpload } from "./storageApi";
import { toStorageRef } from "./storageRef";

export type UploadScope =
  | "menu"
  | "receipts"
  | "ledger"
  | "void-attachments"
  | "misc";

function slugFileName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function isHeicFile(file: File): boolean {
  return (
    /\.(heic|heif)$/i.test(file.name) ||
    file.type === "image/heic" ||
    file.type === "image/heif"
  );
}

function extensionFor(file: File, compressed: boolean): string {
  if (compressed) {
    return file.type === "image/webp" ? "webp" : "jpg";
  }
  const fromName = file.name.match(/\.([a-z0-9]+)$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  return "bin";
}

/**
 * Compress (images only), presign, PUT to MinIO. Returns a `storage:…` ref for persistence.
 */
export async function uploadFileToStorage(
  file: File,
  scope: UploadScope,
  label?: string,
): Promise<string> {
  let body: File = file;
  let compressed = false;
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
      compressed = true;
    } catch {
      // HEIC / exotic formats may fail canvas decode — upload original bytes.
      body = file;
      compressed = false;
    }
  }

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const base = slugFileName(label ?? file.name) || "file";
  const ext = extensionFor(body, compressed);
  const path = `${scope}/${base}-${stamp}.${ext}`;

  const { uploadUrl, key } = await presignUpload(
    path,
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

  return toStorageRef(key);
}
