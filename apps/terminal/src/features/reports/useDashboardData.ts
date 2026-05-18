import { useCallback, useEffect, useState } from "react";
import { useDailyEntryMap } from "@/features/daily-entry";
import { fetchItemPerformance, fetchSalesReport } from "./reportsApi";

function weekRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function useDashboardData() {
  const { map: dailyMap, loading: dailyLoading } = useDailyEntryMap();
  const [sales, setSales] = useState<Awaited<ReturnType<typeof fetchSalesReport>> | null>(
    null,
  );
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchItemPerformance>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const range = weekRange();
      const [salesPayload, itemRows] = await Promise.all([
        fetchSalesReport(range.startDate, range.endDate),
        fetchItemPerformance(range.startDate, range.endDate),
      ]);
      setSales(salesPayload);
      setItems(itemRows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dailyEntryCount = Object.keys(dailyMap).length;

  return {
    sales,
    items,
    dailyEntryCount,
    loading: loading || dailyLoading,
    error,
    refresh,
  };
}
