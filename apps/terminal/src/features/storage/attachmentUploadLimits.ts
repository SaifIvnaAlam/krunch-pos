/** PDFs are stored as-is — cap original size before upload. */
const MAX_PDF_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Images are compressed client-side; this blocks only pathological inputs. */
const MAX_RAW_IMAGE_BYTES = 50 * 1024 * 1024;

function isPdfAttachmentFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isImageAttachmentFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/i.test(file.name);
}

/** `null` when upload may proceed (images are compressed in `uploadFileToStorage`). */
export function attachmentUploadBlockedMessage(file: File): string | null {
  if (isPdfAttachmentFile(file)) {
    if (file.size > MAX_PDF_ATTACHMENT_BYTES) {
      return `PDF files must be under ${Math.round(MAX_PDF_ATTACHMENT_BYTES / (1024 * 1024))} MB.`;
    }
    return null;
  }
  if (isImageAttachmentFile(file) && file.size > MAX_RAW_IMAGE_BYTES) {
    return `This image is too large to process (over ${Math.round(MAX_RAW_IMAGE_BYTES / (1024 * 1024))} MB).`;
  }
  return null;
}
