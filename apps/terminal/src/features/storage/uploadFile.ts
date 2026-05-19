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

function mimeForUpload(file: File): string {
  if (file.type) return file.type;
  if (/\.pdf$/i.test(file.name)) return "application/pdf";
  if (isHeicFile(file)) return "image/heic";
  if (/\.(jpe?g)$/i.test(file.name)) return "image/jpeg";
  if (/\.png$/i.test(file.name)) return "image/png";
  return "application/octet-stream";
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
      body = await compressImageFile(file);
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

  const contentType = mimeForUpload(body);
  const { uploadUrl, key } = await presignUpload(path, contentType);

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!put.ok) {
    const hint =
      put.status === 403
        ? "Storage denied (check sign-in and permissions)."
        : "Check that MinIO is reachable and CORS is enabled.";
    throw new Error(`Upload failed (HTTP ${put.status}). ${hint}`);
  }

  return toStorageRef(key);
}
