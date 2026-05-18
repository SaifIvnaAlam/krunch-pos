import { useEffect, useState } from "react";
import { fromStorageRef, resolveMediaUrl } from "@/features/storage";

function isPdfMediaRef(ref: string): boolean {
  if (ref.startsWith("data:application/pdf")) return true;
  const key = fromStorageRef(ref);
  return key != null && key.toLowerCase().endsWith(".pdf");
}

export function ReceiptPreviewBody({ mediaRef }: { mediaRef: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveMediaUrl(mediaRef).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaRef]);

  if (!src) {
    return <p className="text-[13px] text-white/70">Loading preview…</p>;
  }

  if (isPdfMediaRef(mediaRef)) {
    return (
      <iframe
        title="Attachment preview"
        src={src}
        className="h-[min(90dvh,900px)] w-full max-w-3xl rounded-md bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <img
      src={src}
      alt="Receipt"
      className="max-h-[min(90dvh,900px)] max-w-full object-contain shadow-lg"
      onClick={(e) => e.stopPropagation()}
    />
  );
}
