import { useCallback, useEffect, useState } from "react";
import { loadDailyEntryMap } from "./dailyEntryRepository";
import type { DailyEntryMap } from "./types";

export function useDailyEntryMap() {
  const [map, setMap] = useState<DailyEntryMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadDailyEntryMap();
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

  return { map, loading, error, refresh };
}
