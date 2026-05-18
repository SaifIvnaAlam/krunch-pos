import { apiFetch } from "@/features/api-client/http";
import { requireAccessToken } from "@/features/api-client/auth";

export type PresignedUpload = {
  uploadUrl: string;
  key: string;
  bucket: string;
  expiresIn: number;
};

export type PresignedDownload = {
  downloadUrl: string;
  key: string;
  bucket: string;
  expiresIn: number;
};

export async function presignUpload(
  path: string,
  contentType: string,
  expiresIn?: number,
): Promise<PresignedUpload> {
  const token = requireAccessToken();
  return apiFetch<PresignedUpload>("/storage/presign-upload", {
    method: "POST",
    token,
    body: JSON.stringify({ path, contentType, expiresIn }),
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
