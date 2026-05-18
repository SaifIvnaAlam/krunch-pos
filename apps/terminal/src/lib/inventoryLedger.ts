/**
 * Client-side stock ledger: balance is always derived from IN/OUT movements.
 * Persisted to localStorage for the terminal demo; API uses the same model under /inventory/stock-items.
 */

export type StockDirection = "IN" | "OUT";

export type LedgerMovement = {
  id: string;
  stockItemId: string;
  direction: StockDirection;
  /** Always positive */
  quantity: number;
  date: string;
  note: string;
};

export type StockItemMeta = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  parLevel: number;
  lastCounted: string;
};

export type InventoryStore = {
  items: StockItemMeta[];
  movements: LedgerMovement[];
};

const STORAGE_KEY = "krunch-pos.inventory.v1";

export function loadInventoryStore(): InventoryStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InventoryStore;
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.movements)) return null;
    const movements = parsed.movements.map((m) => {
      const legacy = m as LedgerMovement & { reason?: string };
      return {
        id: legacy.id,
        stockItemId: legacy.stockItemId,
        direction: legacy.direction,
        quantity: legacy.quantity,
        date: legacy.date,
        note: legacy.note ?? legacy.reason ?? "",
      };
    });
    return { items: parsed.items, movements };
  } catch {
    return null;
  }
}

export function saveInventoryStore(store: InventoryStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function balanceForItem(movements: LedgerMovement[], itemId: string): number {
  let sum = 0;
  for (const m of movements) {
    if (m.stockItemId !== itemId) continue;
    const q = m.quantity;
    sum += m.direction === "IN" ? q : -q;
  }
  return sum;
}

/** @deprecated Use API via `useStockInventory`. Returns an empty store. */
export function seedInventoryStore(): InventoryStore {
  return { items: [], movements: [] };
}
