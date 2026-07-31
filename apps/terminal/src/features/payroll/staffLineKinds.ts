/** Staff disbursement type on daily entry — regular payout or advance salary. */
export type StaffLineKind = "payout" | "advance";

export const STAFF_LINE_KIND: StaffLineKind = "payout";
export const STAFF_ADVANCE_LINE_KIND: StaffLineKind = "advance";

const PAYOUT_LEGACY_KINDS = new Set([
  "payout",
  "salary",
  "service_charge",
  "bonus",
  "overtime",
]);

/** Normalize legacy category values from older saved rows. */
export function normalizeStaffLineKind(raw: string | undefined): StaffLineKind {
  if (raw === STAFF_ADVANCE_LINE_KIND) return STAFF_ADVANCE_LINE_KIND;
  if (raw && PAYOUT_LEGACY_KINDS.has(raw)) return STAFF_LINE_KIND;
  return STAFF_LINE_KIND;
}

export function staffLineKindLabel(kind?: string): string {
  return normalizeStaffLineKind(kind) === STAFF_ADVANCE_LINE_KIND ? "Advance" : "Payout";
}
