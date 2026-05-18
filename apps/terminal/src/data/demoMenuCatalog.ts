/**
 * @deprecated Import from `@/features/menu` instead.
 * Re-exports for legacy imports during migration.
 */
export type {
  CatalogCategory,
  CatalogItem,
  MenuAddon,
  MenuChoice,
  MenuVariantGroup,
  OrderLineConfig,
} from "@/features/menu";
export {
  buildOrderLineDisplay,
  computeLineUnitPrice,
  defaultOrderLineConfig,
  findCatalogItemById,
} from "@/features/menu";

/** Empty — menu loads from the API (`useMenuCatalog`). */
export const DEMO_CATEGORIES: import("@/features/menu").CatalogCategory[] = [];
