import { useCallback, useEffect, useState } from "react";
import { apiOrderToUiRow } from "./mappers";
import { fetchOrdersFromApi } from "./ordersApi";
import type { UiOrderRow } from "./types";

export function useOrders() {
  const [rows, setRows] = useState<UiOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const orders = await fetchOrdersFromApi();
      setRows(orders.map(apiOrderToUiRow));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}
