import { useEffect, useState } from "react";
import { resolveMediaUrl } from "@/features/storage";

type Props = {
  mediaRef: string;
  alt: string;
  className?: string;
  onClick?: () => void;
};

/** Small thumbnail that resolves `storage:` refs and inline `data:` URLs. */
export function MediaThumb({ mediaRef, alt, className, onClick }: Props) {
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
    return (
      <span
        className={
          className ??
          "inline-flex size-11 items-center justify-center rounded-[6px] bg-[var(--pos-page)] text-[9px] text-[var(--pos-text-2)]"
        }
      >
        …
      </span>
    );
  }

  const img = (
    <img src={src} alt={alt} className={className ?? "size-11 object-cover"} />
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block overflow-hidden rounded-[6px]">
        {img}
      </button>
    );
  }

  return img;
}
