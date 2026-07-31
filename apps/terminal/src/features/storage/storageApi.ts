import { apiFetch } from "@/features/api-client/http";
import { requireAccessToken } from "@/features/api-client/auth";

export type PresignedDownload = {
  downloadUrl: string;
  key: string;
  bucket: string;
  expiresIn: number;
};

export type PresignedMediaUpload = {
  uploadUrl: string;
  mediaId: string;
  publicUrl: string;
  key: string;
  bucket: string;
  expiresIn: number;
};

export async function presignMediaUpload(
  scope: string,
  contentType: string,
  expiresIn?: number,
): Promise<PresignedMediaUpload> {
  const token = requireAccessToken();
  return apiFetch<PresignedMediaUpload>("/storage/presign-media-upload", {
    method: "POST",
    token,
    body: JSON.stringify({ scope, contentType, expiresIn }),
  });
}

export async function presignDownload(
  key: string,
  expiresIn?: number,
): Promise<PresignedDownload> {
  const token = requireAccessToken();
  return apiFetch<PresignedDownload>("/storage/presign-download", {
    method: "POST",
    token,
    body: JSON.stringify({ key, expiresIn }),
  });
}

/** Delete a `media:` or `storage:` object from branch storage (no-op for inline/data URLs). */
export async function deleteStoredMediaRef(ref: string): Promise<void> {
  const trimmed = ref.trim();
  if (!trimmed.startsWith("media:") && !trimmed.startsWith("storage:")) {
    return;
  }
  const token = requireAccessToken();
  await apiFetch<{ ok: true }>("/storage/delete-ref", {
    method: "POST",
    token,
    body: JSON.stringify({ ref: trimmed }),
  });
}

/** Fire-and-forget storage cleanup when the user removes an attachment in the UI. */
export function purgeStoredMediaRef(ref: string): void {
  void deleteStoredMediaRef(ref).catch(() => {});
}
