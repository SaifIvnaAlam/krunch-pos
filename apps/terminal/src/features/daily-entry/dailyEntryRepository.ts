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

export async function loadDailyEntryMap(): Promise<DailyEntryMap> {
  const rows = await fetchDailyEntriesFromApi();
  return rowsToMap(rows);
}

export async function saveDailyEntry(row: DailyEntryRow): Promise<PersistResult> {
  try {
    await upsertDailyEntryOnApi(row);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save daily entry.";
    return { ok: false, message };
  }
}

export async function deleteDailyEntry(date: string): Promise<PersistResult> {
  try {
    await deleteDailyEntryOnApi(date);
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
    await lockDailyEntryOnApi(date, lockedBy);
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
    await unlockDailyEntryOnApi(date, unlockedBy);
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not unlock daily entry.";
    return { ok: false, message };
  }
}
