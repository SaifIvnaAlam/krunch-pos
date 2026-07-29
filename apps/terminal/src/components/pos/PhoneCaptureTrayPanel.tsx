import { QrCode, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import {
  createCaptureSession,
  getCaptureSession,
  removeCaptureItem,
  type CaptureSessionItem,
} from "@/features/capture";
import { MediaThumb } from "./MediaThumb";
import { ApiRequestError } from "@/features/api-client/errors";
import { getPhoneCaptureUrl } from "@/shared/config/env";

/** HTML5 DnD MIME for tray photos and already-assigned attachments. */
export const CAPTURE_DND_MIME = "application/x-krunch-capture-item";

export type AttachmentDragSource =
  | { kind: "expense"; lineId: string; purchaseVendor?: string }
  | { kind: "void" };

export type CaptureDragPayload = {
  mediaRef: string;
  /** Present when dragging from the Attachment Tray. */
  itemId?: string;
  /** Present when re-dragging an attachment already on a row. */
  from?: AttachmentDragSource;
};

export function parseCaptureDragPayload(
  data: DataTransfer | null,
): CaptureDragPayload | null {
  if (!data) return null;
  const raw = data.getData(CAPTURE_DND_MIME) || data.getData("text/plain");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CaptureDragPayload;
    if (!parsed || typeof parsed.mediaRef !== "string" || !parsed.mediaRef.trim()) {
      return null;
    }
    const mediaRef = parsed.mediaRef.trim();
    if (typeof parsed.itemId === "string" && parsed.itemId.trim()) {
      return { mediaRef, itemId: parsed.itemId.trim() };
    }
    const from = parsed.from;
    if (from?.kind === "void") {
      return { mediaRef, from: { kind: "void" } };
    }
    if (
      from?.kind === "expense" &&
      typeof from.lineId === "string" &&
      from.lineId.trim()
    ) {
      const purchaseVendor =
        typeof from.purchaseVendor === "string" && from.purchaseVendor.trim()
          ? from.purchaseVendor.trim()
          : undefined;
      return {
        mediaRef,
        from: {
          kind: "expense",
          lineId: from.lineId.trim(),
          ...(purchaseVendor ? { purchaseVendor } : {}),
        },
      };
    }
  } catch {
    // ignore
  }
  return null;
}

type Props = {
  dateKey: string;
  disabled?: boolean;
  /** Left side of the toolbar row (e.g. section title). */
  leading?: ReactNode;
  selectedItemId: string | null;
  onSelectItem: (itemId: string | null) => void;
  onItemsChange: (items: CaptureSessionItem[]) => void;
  sessionToken: string | null;
  onSessionTokenChange: (token: string | null) => void;
  /** True while a tray photo is being dragged (for row drop-target highlighting). */
  onDragActiveChange?: (active: boolean) => void;
};

export function PhoneCaptureTrayPanel({
  dateKey,
  disabled,
  leading,
  selectedItemId,
  onSelectItem,
  onItemsChange,
  sessionToken,
  onSessionTokenChange,
  onDragActiveChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [items, setItems] = useState<CaptureSessionItem[]>([]);

  useEffect(() => {
    onItemsChange(items);
  }, [items, onItemsChange]);

  useEffect(() => {
    if (!sessionToken) {
      setQrDataUrl(null);
      return;
    }
    const url = getPhoneCaptureUrl(sessionToken);
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: "M",
    }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const view = await getCaptureSession(sessionToken);
        if (cancelled) return;
        setItems(view.items);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiRequestError && (e.status === 410 || e.status === 404)) {
          setError("Session not found. Tap Attachment QR again.");
          onSessionTokenChange(null);
          setItems([]);
          return;
        }
        // Keep polling through transient errors.
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sessionToken, onSessionTokenChange]);

  async function startSession() {
    if (disabled || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Reuse date slug (`/capture/ddmmyyyy`) — do not purge tray items.
      const created = await createCaptureSession(dateKey);
      onSessionTokenChange(created.token);
      setOpen(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not start phone capture.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open || disabled) return;
    let cancelled = false;
    void createCaptureSession(dateKey)
      .then((created) => {
        if (!cancelled) onSessionTokenChange(created.token);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dateKey, open, disabled, onSessionTokenChange]);

  async function handleClose() {
    if (busy) return;
    // Hide the panel only — keep the capture session (and tray media) until
    // Daily Entry unmounts / navigates away, which closes + purges orphans.
    setOpen(false);
    setError(null);
    onSelectItem(null);
  }

  async function dismissItem(itemId: string) {
    if (!sessionToken) return;
    try {
      await removeCaptureItem(sessionToken, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      if (selectedItemId === itemId) onSelectItem(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove photo.");
    }
  }

  const trayCount = items.length;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {leading ?? <span />}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => {
              if (open && sessionToken) {
                setOpen(false);
                return;
              }
              if (sessionToken) {
                setOpen(true);
                return;
              }
              void startSession();
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-2.5 text-[11px] font-semibold text-[var(--pos-text-1)] transition-colors hover:border-[var(--pos-sb-base)] hover:bg-[var(--pos-nav-hover)] disabled:opacity-50"
          >
            <QrCode className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
            Attachment QR
            {trayCount > 0 ? (
              <span className="rounded-full bg-[var(--pos-sb-base)] px-1.5 text-[10px] font-bold text-white">
                {trayCount}
              </span>
            ) : null}
          </button>
          {sessionToken && open ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleClose()}
                className="h-8 rounded-[7px] border border-solid [border-color:var(--pos-divider)] px-2 text-[11px] font-medium text-[var(--pos-text-2)] hover:text-red-700 disabled:opacity-50"
              >
                Close
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="m-0 text-[11px] text-red-700">
          {error}
        </p>
      ) : null}

      {open && sessionToken ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-2.5 sm:flex-row sm:items-start">
          <div className="flex shrink-0 flex-col items-center gap-1">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR code to open phone capture"
                className="size-[140px] rounded-[8px] bg-white p-1"
              />
            ) : (
              <div className="flex size-[140px] items-center justify-center rounded-[8px] bg-[var(--pos-card)] text-[11px] text-[var(--pos-text-2)]">
                Generating…
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="m-0 mb-1.5 text-[11px] font-semibold text-[var(--pos-text-1)]">
              Attachment Tray
            </p>
            {items.length === 0 ? (
              <p className="m-0 text-[12px] text-[var(--pos-text-2)]">
                Waiting for photos from your phone…
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {items.map((item) => {
                  const selected = selectedItemId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`relative inline-flex ${selected ? "ring-2 ring-[var(--pos-sb-base)] ring-offset-1" : ""}`}
                    >
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          const payload: CaptureDragPayload = {
                            itemId: item.id,
                            mediaRef: item.mediaRef,
                          };
                          const json = JSON.stringify(payload);
                          e.dataTransfer.setData(CAPTURE_DND_MIME, json);
                          e.dataTransfer.setData("text/plain", json);
                          e.dataTransfer.effectAllowed = "copy";
                          onSelectItem(item.id);
                          onDragActiveChange?.(true);
                        }}
                        onDragEnd={() => onDragActiveChange?.(false)}
                        onClick={() =>
                          onSelectItem(selected ? null : item.id)
                        }
                        className="block overflow-hidden rounded-[6px] border border-solid [border-color:var(--pos-divider)]"
                        title="Drag onto an expense or supplier row"
                        aria-label="Staging photo — drag or select to assign"
                        aria-pressed={selected}
                      >
                        <MediaThumb
                          mediaRef={item.mediaRef}
                          alt="Captured receipt"
                          className="size-14 object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        className="absolute -right-0.5 -top-0.5 z-[1] flex size-4 items-center justify-center rounded-full border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]"
                        aria-label="Discard photo"
                        onClick={(e) => {
                          e.stopPropagation();
                          void dismissItem(item.id);
                        }}
                      >
                        <X className="size-2.5" strokeWidth={2.5} aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {!open && trayCount > 0 ? (
        <div className="flex flex-wrap gap-1.5 rounded-[8px] border border-dashed [border-color:var(--pos-divider)] p-2">
          <p className="m-0 w-full text-[10px] text-[var(--pos-text-2)]">
            {trayCount} photo{trayCount === 1 ? "" : "s"} waiting — open
            Attachment QR to assign
          </p>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              draggable
              onDragStart={(e) => {
                const payload: CaptureDragPayload = {
                  itemId: item.id,
                  mediaRef: item.mediaRef,
                };
                const json = JSON.stringify(payload);
                e.dataTransfer.setData(CAPTURE_DND_MIME, json);
                e.dataTransfer.setData("text/plain", json);
                e.dataTransfer.effectAllowed = "copy";
                onSelectItem(item.id);
                onDragActiveChange?.(true);
              }}
              onDragEnd={() => onDragActiveChange?.(false)}
              onClick={() =>
                onSelectItem(selectedItemId === item.id ? null : item.id)
              }
              className={`overflow-hidden rounded-[6px] border border-solid [border-color:var(--pos-divider)] ${
                selectedItemId === item.id
                  ? "ring-2 ring-[var(--pos-sb-base)]"
                  : ""
              }`}
            >
              <MediaThumb
                mediaRef={item.mediaRef}
                alt="Captured receipt"
                className="size-11 object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
