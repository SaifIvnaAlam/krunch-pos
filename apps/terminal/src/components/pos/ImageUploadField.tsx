import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { StorageImage } from "@/features/storage/StorageImage";
import { isStorageRef } from "@/features/storage/storageRef";

type Props = {
  label?: string;
  accept?: string;
  mediaRef: string | null;
  onMediaRefChange: (next: string | null) => void;
  onUpload: (file: File) => Promise<string>;
  disabled?: boolean;
};

export function ImageUploadField({
  label = "Photo",
  accept = "image/*",
  mediaRef,
  onMediaRefChange,
  onUpload,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (file: File | undefined) => {
    if (!file || disabled) return;
    setUploading(true);
    setError(null);
    try {
      const ref = await onUpload(file);
      onMediaRefChange(ref);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <p className="text-[12px] font-medium text-[var(--pos-text-1)]">{label}</p>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {mediaRef && (isStorageRef(mediaRef) || mediaRef.startsWith("data:")) ? (
          <div className="relative w-[120px] shrink-0">
            <StorageImage
              mediaRef={mediaRef}
              alt=""
              className="aspect-[4/3] w-full rounded-[8px] object-cover"
            />
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => onMediaRefChange(null)}
              className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] text-[var(--pos-text-2)]"
              aria-label="Remove image"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : null}
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="flex h-[72px] min-w-[120px] flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-[var(--pos-border-medium)] px-3 text-[11px] text-[var(--pos-text-2)] hover:border-[var(--pos-text-2)]"
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <ImagePlus className="size-5" aria-hidden />
          )}
          {uploading ? "Uploading…" : mediaRef ? "Replace" : "Add photo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
      </div>
      <p className="mt-1 text-[10px] text-[var(--pos-text-2)]">
        Images are compressed before upload to save storage.
      </p>
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
