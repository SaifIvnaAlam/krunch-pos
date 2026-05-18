import {
  deleteDailyEntryOnApi,
  fetchDailyEntriesFromApi,
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
