import { useCallback, useEffect, useState } from "react";
import type { InventoryStore, LedgerMovement, StockItemMeta } from "@/lib/inventoryLedger";
import {
  fetchStockItemsFromApi,
  fetchStockMovementsFromApi,
  type ApiStockItem,
} from "./inventoryApi";

function mapStockItem(row: ApiStockItem): StockItemMeta {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    parLevel: row.parLevel,
    lastCounted: row.lastCountedAt?.slice(0, 10) ?? "",
  };
}

function mapMovement(
  row: Awaited<ReturnType<typeof fetchStockMovementsFromApi>>[number],
): LedgerMovement {
  return {
    id: row.id,
    stockItemId: row.stockItemId,
    direction: row.direction,
    quantity: row.quantity,
    date: row.occurredAt.slice(0, 10),
    note: row.note ?? "",
  };
}

export function useStockInventory() {
  const [store, setStore] = useState<InventoryStore>({ items: [], movements: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchStockItemsFromApi();
      const movements: LedgerMovement[] = [];
      for (const item of items) {
        const lines = await fetchStockMovementsFromApi(item.id);
        movements.push(...lines.map(mapMovement));
      }
      setStore({
        items: items.map(mapStockItem),
        movements,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { store, setStore, loading, error, refresh };
}
