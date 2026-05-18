import { useCallback, useEffect, useState } from "react";
import { apiMenuItemsToCategories } from "./mappers";
import { fetchMenuFromApi } from "./menuApi";
import type { CatalogCategory } from "./types";

export function useMenuCatalog() {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchMenuFromApi();
      setCategories(apiMenuItemsToCategories(rows));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load menu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { categories, setCategories, loading, error, refresh };
}
