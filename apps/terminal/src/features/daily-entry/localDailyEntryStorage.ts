import type { DailyEntryMap, DailyEntryRow, PersistResult } from "./types";

export const DAILY_ENTRY_STORAGE_KEY = "upos.dailyEntryRows.v1";
export const DAILY_ENTRY_STORAGE_UPDATE_EVENT = "krunch-daily-entry-updated";

function coerceDailyEntryRow(row: DailyEntryRow): DailyEntryRow {
  return {
    ...row,
    nagadSale: row.nagadSale ?? 0,
  };
}

export function readLocalDailyEntryMap(): DailyEntryMap {
  try {
    const raw = localStorage.getItem(DAILY_ENTRY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DailyEntryMap;
    if (!parsed || typeof parsed !== "object") return {};
    const out: DailyEntryMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v === "object") {
        out[k] = coerceDailyEntryRow(v as DailyEntryRow);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function writeLocalDailyEntryMap(rows: DailyEntryMap): PersistResult {
  try {
    localStorage.setItem(DAILY_ENTRY_STORAGE_KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent(DAILY_ENTRY_STORAGE_UPDATE_EVENT));
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof DOMException && e.name === "QuotaExceededError"
        ? "Storage full — clear browser data or export entries."
        : "Could not save — check browser storage permissions.";
    return { ok: false, message };
  }
}
