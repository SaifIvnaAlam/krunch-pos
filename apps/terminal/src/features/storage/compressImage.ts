export type CompressImageOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: "image/jpeg" | "image/webp";
  /** When set, re-encode until output is at or below this size (bytes). */
  maxBytes?: number;
};

/** Target cap for receipt / ledger / void attachment images. */
export const ATTACHMENT_IMAGE_MAX_BYTES = 100_000;

const DEFAULTS: Required<Omit<CompressImageOptions, "maxBytes">> = {
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 0.82,
  mimeType: "image/jpeg",
};

const SMALL_JPEG_SKIP_BYTES = 120_000;
const MIN_QUALITY = 0.48;
const MIN_MAX_EDGE = 480;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image."));
    };
    img.src = url;
  });
}

function scaleDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  let w = width;
  let h = height;
  if (w <= maxWidth && h <= maxHeight) return { width: w, height: h };
  const ratio = Math.min(maxWidth / w, maxHeight / h);
  w = Math.max(1, Math.round(w * ratio));
  h = Math.max(1, Math.round(h * ratio));
  return { width: w, height: h };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not compress image."))),
      mimeType,
      quality,
    );
  });
}

function outputFileName(source: File, mimeType: string): string {
  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  const base =
    source.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 48) ||
    "image";
  return `${base}.${ext}`;
}

/**
 * Resize and re-encode photos as JPEG/WebP to keep object storage lean.
 * With `maxBytes`, lowers quality and dimensions until the output fits.
 */
export async function compressImageFile(
  file: File,
  options: CompressImageOptions = {},
): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  const { maxBytes, ...rest } = options;
  const opts = { ...DEFAULTS, ...rest };

  if (maxBytes != null && file.size <= maxBytes) {
    return file;
  }
  if (maxBytes == null && file.type === "image/jpeg" && file.size < SMALL_JPEG_SKIP_BYTES) {
    return file;
  }

  const img = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not compress image.");

  let maxEdge = Math.min(opts.maxWidth, opts.maxHeight);
  let quality = opts.quality;
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 16; attempt++) {
    const { width, height } = scaleDimensions(
      img.naturalWidth,
      img.naturalHeight,
      maxEdge,
      maxEdge,
    );
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    blob = await canvasToBlob(canvas, opts.mimeType, quality);

    if (maxBytes == null || blob.size <= maxBytes) {
      break;
    }

    if (quality > MIN_QUALITY + 0.06) {
      quality = Math.max(MIN_QUALITY, quality - 0.07);
      continue;
    }

    if (maxEdge > MIN_MAX_EDGE) {
      maxEdge = Math.max(MIN_MAX_EDGE, Math.round(maxEdge * 0.85));
      quality = opts.quality;
      continue;
    }

    break;
  }

  if (!blob) throw new Error("Could not compress image.");

  return new File([blob], outputFileName(file, opts.mimeType), { type: opts.mimeType });
}
