import {
  deleteDailyEntryOnApi,
  fetchDailyEntriesFromApi,
  lockDailyEntryOnApi,
  unlockDailyEntryOnApi,
  upsertDailyEntryOnApi,
} from "./dailyEntryApi";
import type { DailyEntryMap, DailyEntryRow, PersistResult } from "./types";

export function rowsToMap(rows: DailyEntryRow[]): DailyEntryMap {
  const map: DailyEntryMap = {};
  for (const row of rows) {
    map[row.date] = row;
  }
  return map;
}

let cachedMap: DailyEntryMap | null = null;
let loadPromise: Promise<DailyEntryMap> | null = null;

export function getCachedDailyEntryMap(): DailyEntryMap | null {
  return cachedMap;
}

export function invalidateDailyEntryMapCache(): void {
  cachedMap = null;
  loadPromise = null;
}

export function patchDailyEntryMapCache(row: DailyEntryRow): void {
  cachedMap = { ...(cachedMap ?? {}), [row.date]: row };
}

function removeDailyEntryFromCache(date: string): void {
  if (!cachedMap) return;
  const next = { ...cachedMap };
  delete next[date];
  cachedMap = next;
}

export async function loadDailyEntryMap(options?: { force?: boolean }): Promise<DailyEntryMap> {
  if (!options?.force && cachedMap) return cachedMap;
  if (!options?.force && loadPromise) return loadPromise;

  loadPromise = (async () => {
    const rows = await fetchDailyEntriesFromApi();
    cachedMap = rowsToMap(rows);
    return cachedMap;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

export async function saveDailyEntry(row: DailyEntryRow): Promise<PersistResult> {
  try {
    const saved = await upsertDailyEntryOnApi(row);
    patchDailyEntryMapCache(saved);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save daily entry.";
    return { ok: false, message };
  }
}

export async function deleteDailyEntry(date: string): Promise<PersistResult> {
  try {
    await deleteDailyEntryOnApi(date);
    removeDailyEntryFromCache(date);
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not delete daily entry.";
    return { ok: false, message };
  }
}

export async function lockDailyEntry(
  date: string,
  lockedBy?: string,
): Promise<PersistResult> {
  try {
    const row = await lockDailyEntryOnApi(date, lockedBy);
    patchDailyEntryMapCache(row);
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not lock daily entry.";
    return { ok: false, message };
  }
}

export async function unlockDailyEntry(
  date: string,
  unlockedBy?: string,
): Promise<PersistResult> {
  try {
    const row = await unlockDailyEntryOnApi(date, unlockedBy);
    patchDailyEntryMapCache(row);
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not unlock daily entry.";
    return { ok: false, message };
  }
}
