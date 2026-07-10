import { useCallback, useEffect, useState } from "react";
import { invalidateDailyEntryMapCache, loadDailyEntryMap } from "./dailyEntryRepository";
import { DAILY_ENTRY_STORAGE_UPDATE_EVENT } from "./localDailyEntryStorage";
import type { DailyEntryMap } from "./types";

export function useDailyEntryMap() {
  const [map, setMap] = useState<DailyEntryMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      invalidateDailyEntryMapCache();
      const next = await loadDailyEntryMap({ force: true });
      setMap(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load daily entries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onExternalUpdate = () => {
      void refresh();
    };
    window.addEventListener(DAILY_ENTRY_STORAGE_UPDATE_EVENT, onExternalUpdate);
    return () => {
      window.removeEventListener(DAILY_ENTRY_STORAGE_UPDATE_EVENT, onExternalUpdate);
    };
  }, [refresh]);

  return { map, loading, error, refresh };
}
