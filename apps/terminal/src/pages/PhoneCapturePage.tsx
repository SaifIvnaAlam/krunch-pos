import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getCaptureSession,
  presignCaptureUpload,
  registerCaptureItem,
  type CaptureSessionItem,
} from "@/features/capture";
import {
  ATTACHMENT_IMAGE_MAX_BYTES,
  attachmentUploadBlockedMessage,
  compressImageFile,
  fromMediaRef,
} from "@/features/storage";
import { ApiRequestError } from "@/features/api-client/errors";
import { getMediaPublicUrl } from "@/shared/config/env";

type LocalUpload = {
  key: string;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  error?: string;
  mediaRef?: string;
};

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  // iOS camera / Photos often omit MIME type.
  if (!file.type && file.size > 0) return true;
  return /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/i.test(file.name);
}

export function PhoneCapturePage() {
  const { token = "" } = useParams<{ token: string }>();
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [remoteItems, setRemoteItems] = useState<CaptureSessionItem[]>([]);
  const [localUploads, setLocalUploads] = useState<LocalUpload[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);

  const refreshSession = useCallback(async () => {
    if (!token) return;
    try {
      const view = await getCaptureSession(token);
      setRemoteItems(view.items);
      setSessionError(null);
    } catch (e) {
      const msg =
        e instanceof ApiRequestError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not load capture session.";
      setSessionError(msg);
    }
  }, [token]);

  useEffect(() => {
    void refreshSession();
    const id = window.setInterval(() => void refreshSession(), 4000);
    return () => window.clearInterval(id);
  }, [refreshSession]);

  async function uploadFiles(files: readonly File[]) {
    if (!token) return;
    if (uploadingRef.current) {
      setLocalUploads((prev) => [
        ...prev,
        {
          key: `${Date.now()}-busy`,
          previewUrl: "",
          status: "error",
          error: "Still uploading — wait a moment, then try again.",
        },
      ]);
      return;
    }
    // Snapshot already — never pass a live FileList (clearing <input> empties it on iOS).
    const list = files.filter((f) => f.size > 0);
    if (list.length === 0) {
      setLocalUploads((prev) => [
        ...prev,
        {
          key: `${Date.now()}-empty`,
          previewUrl: "",
          status: "error",
          error: "No photo received. Try again or use From gallery.",
        },
      ]);
      return;
    }
    uploadingRef.current = true;
    try {
      for (const file of list) {
        if (!isImageFile(file)) {
          setLocalUploads((prev) => [
            ...prev,
            {
              key: `${Date.now()}-${file.name}-err`,
              previewUrl: "",
              status: "error",
              error: "Only images can be uploaded from the phone.",
            },
          ]);
          continue;
        }
        const blocked = attachmentUploadBlockedMessage(file);
        if (blocked) {
          setLocalUploads((prev) => [
            ...prev,
            {
              key: `${Date.now()}-${file.name}-err`,
              previewUrl: "",
              status: "error",
              error: blocked,
            },
          ]);
          continue;
        }

        const previewUrl = URL.createObjectURL(file);
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setLocalUploads((prev) => [
          ...prev,
          { key, previewUrl, status: "uploading" },
        ]);

        try {
          let body: File = file;
          try {
            body = await compressImageFile(file, {
              maxBytes: ATTACHMENT_IMAGE_MAX_BYTES,
            });
          } catch {
            body = file;
          }
          const contentType =
            body.type && body.type.startsWith("image/")
              ? body.type
              : "image/jpeg";
          const signed = await presignCaptureUpload(token, contentType);
          const put = await fetch(signed.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body,
          });
          if (!put.ok) {
            throw new Error(`Upload failed (${put.status}). Check storage CORS.`);
          }
          await registerCaptureItem(token, signed.mediaRef);
          setLocalUploads((prev) =>
            prev.map((u) =>
              u.key === key
                ? { ...u, status: "done", mediaRef: signed.mediaRef }
                : u,
            ),
          );
          requestAnimationFrame(() => URL.revokeObjectURL(previewUrl));
          await refreshSession();
        } catch (e) {
          URL.revokeObjectURL(previewUrl);
          const message =
            e instanceof ApiRequestError
              ? e.message
              : e instanceof Error
                ? e.message
                : "Upload failed.";
          setLocalUploads((prev) =>
            prev.map((u) =>
              u.key === key ? { ...u, status: "error", error: message } : u,
            ),
          );
        }
      }
    } finally {
      uploadingRef.current = false;
    }
  }

  const pendingLocals = localUploads.filter((u) => u.status === "uploading");
  const errorLocals = localUploads.filter((u) => u.status === "error");

  return (
    <div
      className="min-h-[100dvh] bg-[var(--pos-page,#f4f4f5)] text-[var(--pos-text-1,#18181b)]"
      style={{ fontSize: 18, WebkitTextSizeAdjust: "100%" }}
    >
      <header className="sticky top-0 z-10 border-b border-black/10 bg-white/95 px-5 py-5 backdrop-blur">
        <h1
          className="m-0 font-semibold tracking-tight"
          style={{ fontSize: 32, lineHeight: 1.2 }}
        >
          Receipt photos
        </h1>
        <p className="m-0 mt-2 text-zinc-500" style={{ fontSize: 18 }}>
          Take or pick photos — they appear on the Daily Entry PC.
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-5 py-5 pb-10">
        {sessionError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-red-800"
            style={{ fontSize: 18 }}
          >
            {sessionError}
          </div>
        ) : (
          <p className="m-0 text-zinc-500" style={{ fontSize: 18 }}>
            {remoteItems.length > 0
              ? `${remoteItems.length} sent`
              : "Ready"}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            disabled={Boolean(sessionError)}
            onClick={() => cameraInputRef.current?.click()}
            className="flex items-center justify-center rounded-xl bg-zinc-900 font-semibold text-white disabled:opacity-40"
            style={{ minHeight: 72, fontSize: 22 }}
          >
            Take photo
          </button>
          <button
            type="button"
            disabled={Boolean(sessionError)}
            onClick={() => galleryInputRef.current?.click()}
            className="flex items-center justify-center rounded-xl border border-zinc-300 bg-white font-semibold disabled:opacity-40"
            style={{ minHeight: 72, fontSize: 22 }}
          >
            From gallery
          </button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            // Copy before reset — iOS clears the live FileList when value is wiped.
            const picked = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (picked.length > 0) void uploadFiles(picked);
          }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            const picked = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (picked.length > 0) void uploadFiles(picked);
          }}
        />

        {(pendingLocals.length > 0 ||
          remoteItems.length > 0 ||
          errorLocals.length > 0) && (
          <div className="grid grid-cols-3 gap-2">
            {pendingLocals.map((u) => (
              <div
                key={u.key}
                className="relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100"
              >
                {u.previewUrl ? (
                  <img
                    src={u.previewUrl}
                    alt=""
                    className="size-full object-cover opacity-70"
                  />
                ) : null}
                <span
                  className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-1.5 text-center text-white"
                  style={{ fontSize: 14 }}
                >
                  Uploading…
                </span>
              </div>
            ))}
            {remoteItems.map((item) => {
              const mediaId = fromMediaRef(item.mediaRef);
              const src = mediaId ? getMediaPublicUrl(mediaId) : "";
              return (
                <div
                  key={item.id}
                  className="relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100"
                >
                  {src ? (
                    <img src={src} alt="" className="size-full object-cover" />
                  ) : null}
                  <span
                    className="absolute inset-x-0 bottom-0 bg-emerald-700/80 px-1 py-1.5 text-center text-white"
                    style={{ fontSize: 14 }}
                  >
                    Sent
                  </span>
                </div>
              );
            })}
            {errorLocals.map((u) => (
              <div
                key={u.key}
                className="relative aspect-square overflow-hidden rounded-lg border border-red-200 bg-red-50"
              >
                {u.previewUrl ? (
                  <img
                    src={u.previewUrl}
                    alt=""
                    className="size-full object-cover opacity-50"
                  />
                ) : (
                  <span
                    className="flex size-full items-center justify-center p-2 text-center text-red-700"
                    style={{ fontSize: 14 }}
                  >
                    {u.error ?? "Failed"}
                  </span>
                )}
                {u.previewUrl ? (
                  <span
                    className="absolute inset-x-0 bottom-0 bg-red-700/85 px-1 py-1.5 text-center text-white"
                    style={{ fontSize: 14 }}
                  >
                    {u.error ?? "Failed"}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {remoteItems.length === 0 &&
          pendingLocals.length === 0 &&
          errorLocals.length === 0 &&
          !sessionError && (
            <p
              className="m-0 text-center text-zinc-500"
              style={{ fontSize: 18 }}
            >
              No photos yet. Use the buttons above — you can send many.
            </p>
          )}
      </main>
    </div>
  );
}
