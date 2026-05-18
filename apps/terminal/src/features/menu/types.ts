export type MenuChoice = {
  id: string;
  name: string;
  priceDeltaCents: number;
};

export type MenuVariantGroup = {
  id: string;
  name: string;
  required: boolean;
  choices: MenuChoice[];
};

export type MenuAddon = {
  id: string;
  name: string;
  priceCents: number;
  parentGroupId?: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  priceCents: number;
  soldToday: number;
  variantGroups: MenuVariantGroup[];
  addons: MenuAddon[];
  isAvailable?: boolean;
  is86d?: boolean;
  /** `storage:…` ref or legacy inline data URL */
  imageRef?: string | null;
};

export type CatalogCategory = {
  id: string;
  name: string;
  items: CatalogItem[];
};

export type OrderLineConfig = {
  variantChoiceIds: Record<string, string>;
  addonIds: string[];
};

export type ApiMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: string | number;
  category: string;
  isAvailable: boolean;
  is86d: boolean;
  imageKey: string | null;
  modifiers: unknown;
};
