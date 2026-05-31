import { compressImageFile } from "./compressImage";
import { requireAccessToken } from "@/features/api-client/auth";
import { getApiBaseUrl } from "@/shared/config/env";
import { ApiRequestError } from "@/features/api-client/errors";
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

  const token = requireAccessToken();
  const form = new FormData();
  form.append("path", path);
  form.append("file", body, `${base}.${ext}`);

  const response = await fetch(`${getApiBaseUrl()}/storage/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const text = await response.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const rawMessage =
      typeof data === "object" && data !== null && "message" in data
        ? (data as { message: unknown }).message
        : undefined;
    const msg = Array.isArray(rawMessage)
      ? rawMessage.join(", ")
      : typeof rawMessage === "string"
        ? rawMessage
        : `HTTP ${response.status}`;
    throw new ApiRequestError(msg, response.status, data);
  }

  const payload = data as { key?: string };
  if (!payload?.key) {
    throw new Error("Upload succeeded but no storage key was returned.");
  }

  return toStorageRef(payload.key);
}
