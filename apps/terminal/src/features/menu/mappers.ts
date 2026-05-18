import { toStorageRef } from "@/features/storage";
import type {
  ApiMenuItem,
  CatalogCategory,
  CatalogItem,
  MenuAddon,
  MenuVariantGroup,
} from "./types";

function parseModifiers(raw: unknown): {
  variantGroups: MenuVariantGroup[];
  addons: MenuAddon[];
} {
  if (!raw || typeof raw !== "object") {
    return { variantGroups: [], addons: [] };
  }
  const m = raw as Record<string, unknown>;
  const variantGroups = Array.isArray(m.variantGroups)
    ? (m.variantGroups as MenuVariantGroup[])
    : [];
  const addons = Array.isArray(m.addons) ? (m.addons as MenuAddon[]) : [];
  return { variantGroups, addons };
}

function categoryId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "uncategorized";
}

export function apiMenuItemsToCategories(items: ApiMenuItem[]): CatalogCategory[] {
  const byCategory = new Map<string, CatalogItem[]>();

  for (const row of items) {
    const priceNum =
      typeof row.price === "string" ? Number.parseFloat(row.price) : row.price;
    const { variantGroups, addons } = parseModifiers(row.modifiers);
    const catalogItem: CatalogItem = {
      id: row.id,
      name: row.name,
      priceCents: Math.round((Number.isFinite(priceNum) ? priceNum : 0) * 100),
      soldToday: 0,
      variantGroups,
      addons,
      isAvailable: row.isAvailable,
      is86d: row.is86d,
      imageRef: row.imageKey
        ? row.imageKey.startsWith("storage:")
          ? row.imageKey
          : toStorageRef(row.imageKey)
        : null,
    };
    const list = byCategory.get(row.category) ?? [];
    list.push(catalogItem);
    byCategory.set(row.category, list);
  }

  return Array.from(byCategory.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, categoryItems]) => ({
      id: categoryId(name),
      name,
      items: categoryItems.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export function findCatalogItemById(
  categories: CatalogCategory[],
  id: string,
): CatalogItem | undefined {
  for (const cat of categories) {
    const found = cat.items.find((x) => x.id === id);
    if (found) return found;
  }
  return undefined;
}

export function catalogItemToModifiers(item: CatalogItem): Record<string, unknown> {
  return {
    variantGroups: item.variantGroups,
    addons: item.addons,
  };
}
