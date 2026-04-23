import { collectAllLeafIds } from "./data/posNav";

/** Persisted sidebar section inside the POS shell (localStorage). */
export const POS_LAST_LEAF_STORAGE_KEY = "remi-pos-last-leaf";

/** First visit (no valid stored section): daily entry form. */
export const POS_DEFAULT_LEAF_ID = "exp-daily";

/** Routes not listed in the sidebar but still reachable (e.g. `pos-select-leaf`). */
const EXTRA_RESTORE_LEAF_IDS = new Set([
  "dashboard",
  "menu",
  "mo-list",
  "mo-online",
  "reservations",
  "exp-list",
  "menu-mgmt",
  "fd-cat",
  "fd-items",
  "fd-addon",
  "fd-menu",
]);

const validLeafIds = new Set<string>([
  ...collectAllLeafIds(),
  ...EXTRA_RESTORE_LEAF_IDS,
]);

export function isKnownLeafId(id: string): boolean {
  return validLeafIds.has(id);
}

const LEGACY_LEAF_ID_MAP: Record<string, string> = {
  "pu-list": "pu-ledger",
  /** Old single Reports leaf → expense reports under Reports branch. */
  reports: "rep-expenses",
};

export function readStoredLastLeafId(): string | null {
  try {
    const raw = localStorage.getItem(POS_LAST_LEAF_STORAGE_KEY);
    if (!raw) return null;
    const v = LEGACY_LEAF_ID_MAP[raw] ?? raw;
    return isKnownLeafId(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeStoredLastLeafId(leafId: string): void {
  if (!isKnownLeafId(leafId)) return;
  try {
    localStorage.setItem(POS_LAST_LEAF_STORAGE_KEY, leafId);
  } catch {
    /* ignore */
  }
}

export function resolveInitialLeafId(): string {
  return readStoredLastLeafId() ?? POS_DEFAULT_LEAF_ID;
}
