import { useEffect, useState } from "react";
import { resolveMediaUrl } from "./resolveMediaUrl";

type Props = {
  mediaRef: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
};

export function StorageImage({
  mediaRef,
  alt,
  className,
  placeholderClassName,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSrc(null);
    void resolveMediaUrl(mediaRef)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaRef]);

  const placeholder =
    placeholderClassName ??
    "flex aspect-[4/3] items-center justify-center rounded-[8px] bg-[var(--pos-page)] text-[10px] text-[var(--pos-text-2)]";

  if (failed || !src) {
    return (
      <div className={placeholder}>
        {failed ? "Image unavailable" : "…"}
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" />;
}
