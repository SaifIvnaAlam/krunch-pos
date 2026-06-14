import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { apiMenuItemsToCategories, mergeMenuCategories } from "./mappers";
import { fetchMenuFromApi } from "./menuApi";
import { readPendingMenuCategories } from "./menuCategoryStorage";
import type { CatalogCategory } from "./types";

export function useMenuCatalog() {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchMenuFromApi();
      const fromApi = apiMenuItemsToCategories(rows);
      setCategories(mergeMenuCategories(fromApi, readPendingMenuCategories()));
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

  const setCategoriesMerged = useCallback(
    (updater: SetStateAction<CatalogCategory[]>) => {
      setCategories((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        return mergeMenuCategories(next, readPendingMenuCategories());
      });
    },
    [],
  );

  return { categories, setCategories: setCategoriesMerged, loading, error, refresh };
}
