/** Normalize one employee roster JSON object before persisting or returning. */
export function normalizeEmployeeRecord(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  const email =
    typeof o.email === 'string' ? o.email.trim().toLowerCase() : '';
  return { ...o, email };
}

export function normalizeEmployeeDirectory(raw: unknown[]): unknown[] {
  return raw.map(normalizeEmployeeRecord);
}
