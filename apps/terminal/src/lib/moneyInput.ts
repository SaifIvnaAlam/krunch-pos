/** Parses a decimal money string from an input; invalid → 0; negatives → 0. */
export function parseNonNegativeAmount(raw: string): number {
  const n = Number.parseFloat(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

/** Strips `-` so amount fields cannot accept negative values while typing or pasting. */
export function sanitizeNonNegativeDecimalInput(raw: string): string {
  return raw.replace(/-/g, "");
}
