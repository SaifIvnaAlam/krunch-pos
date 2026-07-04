import { randomBytes } from 'crypto';

/** URL-safe, unambiguous chars (no 0/O, 1/l/I). */
const MEDIA_ID_ALPHABET =
  '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';

export const MEDIA_ID_LENGTH = 8;

/** Short public media code, e.g. `a3Kx9mP2`. */
export function generateMediaId(): string {
  const bytes = randomBytes(MEDIA_ID_LENGTH);
  let id = '';
  for (let i = 0; i < MEDIA_ID_LENGTH; i++) {
    id += MEDIA_ID_ALPHABET[bytes[i]! % MEDIA_ID_ALPHABET.length];
  }
  return id;
}

export function isMediaIdFormat(value: string): boolean {
  if (value.length !== MEDIA_ID_LENGTH) return false;
  return [...value].every((ch) => MEDIA_ID_ALPHABET.includes(ch));
}
