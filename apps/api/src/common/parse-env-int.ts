import { ConfigService } from '@nestjs/config';

/** Env vars are strings; jsonwebtoken `expiresIn` must be a number (seconds), not `"900"`. */
export function parseEnvSeconds(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = config.get<string>(key);
  if (raw == null || raw.trim() === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
