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

export function seedInventoryStore(): InventoryStore {
  const items: StockItemMeta[] = [
    {
      id: "stk-1",
      sku: "PR-001",
      name: "White onion",
      category: "Produce",
      unit: "kg",
      parLevel: 8,
      lastCounted: "2026-04-07",
    },
    {
      id: "stk-2",
      sku: "PR-002",
      name: "Roma tomatoes",
      category: "Produce",
      unit: "kg",
      parLevel: 6,
      lastCounted: "2026-04-08",
    },
    {
      id: "stk-3",
      sku: "DY-100",
      name: "Heavy cream",
      category: "Dairy",
      unit: "L",
      parLevel: 4,
      lastCounted: "2026-04-06",
    },
    {
      id: "stk-4",
      sku: "DR-220",
      name: "Arborio rice",
      category: "Dry goods",
      unit: "kg",
      parLevel: 10,
      lastCounted: "2026-04-05",
    },
    {
      id: "stk-5",
      sku: "PR-030",
      name: "Beef tenderloin",
      category: "Protein",
      unit: "kg",
      parLevel: 4,
      lastCounted: "2026-04-08",
    },
    {
      id: "stk-6",
      sku: "BV-012",
      name: "Sparkling water",
      category: "Beverages",
      unit: "cs",
      parLevel: 8,
      lastCounted: "2026-04-07",
    },
  ];

  const movements: LedgerMovement[] = [
    {
      id: "mov-stk1-open",
      stockItemId: "stk-1",
      direction: "IN",
      quantity: 12,
      date: "2026-04-07",
      note: "Opening balance",
    },
    {
      id: "mov-stk1-market",
      stockItemId: "stk-1",
      direction: "IN",
      quantity: 10,
      date: "2026-04-08",
      note: "Morning market run",
    },
    {
      id: "mov-stk2-open",
      stockItemId: "stk-2",
      direction: "IN",
      quantity: 5,
      date: "2026-04-08",
      note: "Opening balance",
    },
    {
      id: "mov-stk2-waste",
      stockItemId: "stk-2",
      direction: "OUT",
      quantity: 2,
      date: "2026-04-08",
      note: "Prep trim / spoilage",
    },
    {
      id: "mov-stk3-open",
      stockItemId: "stk-3",
      direction: "IN",
      quantity: 8,
      date: "2026-04-06",
      note: "Opening balance",
    },
    {
      id: "mov-stk4-open",
      stockItemId: "stk-4",
      direction: "IN",
      quantity: 20,
      date: "2026-04-05",
      note: "Opening balance",
    },
    {
      id: "mov-stk4-audit",
      stockItemId: "stk-4",
      direction: "OUT",
      quantity: 1,
      date: "2026-04-07",
      note: "Count correction after audit",
    },
    {
      id: "mov-stk6-open",
      stockItemId: "stk-6",
      direction: "IN",
      quantity: 14,
      date: "2026-04-07",
      note: "Opening balance",
    },
  ];

  return { items, movements };
}
