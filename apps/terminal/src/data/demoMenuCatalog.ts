/** Demo catalog: items with variant groups (options) and add-ons (sub-options). */
/** Prices are BDT; `priceCents` = whole taka × 100 (e.g. 245 ৳ → 24500). */

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
  /** When set, UI nests this sub-option under that variant group (option). */
  parentGroupId?: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  priceCents: number;
  soldToday: number;
  variantGroups: MenuVariantGroup[];
  addons: MenuAddon[];
};

export type CatalogCategory = {
  id: string;
  name: string;
  items: CatalogItem[];
};

function bdt(bdtAmount: number): number {
  return Math.round(bdtAmount * 100);
}

function item(
  id: string,
  name: string,
  bdtAmount: number,
  soldToday = 0,
): CatalogItem {
  return {
    id,
    name,
    priceCents: bdt(bdtAmount),
    soldToday,
    variantGroups: [],
    addons: [],
  };
}

/** Unpriced lines in your paste — set amounts in Food management (shows ৳0.00 until then). */
const TBD = 0;

export const DEMO_CATEGORIES: CatalogCategory[] = [
  {
    id: "appetizer",
    name: "Appetizer",
    items: [
      item("app-muston-fries", "Muston fries", 395, 6),
      item("app-cheesy-bites", "Cheesy bites", 565, 2),
      item("app-salt-pepper-squid", "Salt & pepper squid", 585, 2),
      item("app-cheesy-poutine", "Cheesy poutine", 499, 2),
      item("app-chicken-tender-filets", "Chicken tender filets", 445, 5),
      item("app-mozzarella-sticks", "Mozzarella sticks", 645, 3),
      item("app-golden-shrimp", "Golden shrimp", 655, 3),
      item("app-spicy-garlic-wings", "Spicy garlic wings", 445, 8),
    ],
  },
  {
    id: "premium-cuts",
    name: "Premium cuts",
    items: [
      item("pc-porter-house", "Premium porter house (600gm)", 5125, 1),
      item("pc-tomahawk", "Premium tomahawk (600gm)", 3450, 1),
      item("pc-tbone", "Premium cut T-bone (350gm)", 2695, 2),
      item("pc-rib-eye", "Premium cut rib eye (300gm)", 2595, 2),
      item("pc-tenderloin", "Premium cut tenderloin (300gm)", 2895, 2),
      item("pc-sirloin", "Premium cut sirloin (300gm)", 2445, 2),
      item("pc-spare-ribs", "Premium cut spare ribs (800gm)", 3085, 1),
      item("pc-back-ribs", "Premium cut back ribs (500gm)", 2300, 2),
      item("pc-lamb-rack", "Premium lamb wild lamb rack", 2495, 1),
      item("pc-lamb-shank", "Premium lamb wild lamb shank", 1995, 2),
    ],
  },
  {
    id: "econo-cuts",
    name: "Econo cuts",
    items: [
      item("ec-mushroom-flank", "Mushroom flank (200gm)", 1195, 0),
      item("ec-pepper-flank", "Pepper flank (200gm)", 1195, 0),
      item("ec-cheese-flank", "Cheese flank (200gm)", 1295, 0),
      item("ec-spicy-garlic-wings", "Spicy garlic wings", 445, 8),
    ],
  },
  {
    id: "special-chicken",
    name: "Special chicken",
    items: [
      item("sc-smoked-moroccan", "Smoked Moroccan chicken", 595, 0),
      item("sc-smoked-cheesy", "Smoked cheesy chicken", 695, 0),
      item("sc-mushroom", "Mushroom chicken", 595, 0),
      item("sc-mexican", "Mexican chicken", 595, 0),
    ],
  },
  {
    id: "premium-platter",
    name: "Premium platter",
    items: [
      item("pp-steakhouse-supreme", "Steakhouse supreme", 2485, 0),
      item("pp-meaty-supreme", "Meaty supreme", 5690, 0),
      item("pp-grill-heritage", "Grill heritage", 1885, 0),
      item("pp-rosted-striplion", "Rosted striplion", 3695, 0),
      item("pp-coastal-sizzle", "Coastal sizzle", 2895, 0),
      item("pp-carnivorous-feast", "Carnivorous feast", 4895, 0),
      item("pp-tribal-feast", "Tribal feast", 4595, 0),
      item("pp-big-bone-theory", "Big bone theory (1800gm)", 4195, 0),
      item("pp-marrow-challenge", "Marrow challenge", 4995, 0),
    ],
  },
  {
    id: "soup",
    name: "Soup",
    items: [
      item("sp-creamy-mushroom", "Creamy mushroom soup", 500, 0),
      item("sp-ribs-beacon", "Ribs beacon soup", 538, 0),
    ],
  },
  {
    id: "pasta",
    name: "Pasta",
    items: [
      item("pa-steak", "Steak pasta", 661, 0),
      item("pa-chicken", "Chicken pasta", 571, 0),
    ],
  },
  {
    id: "mocktails",
    name: "Mocktails",
    items: [
      item("mk-monsoon-bliss", "Monsoon bliss", 285, 0),
      item("mk-apple-mint-orchard", "Apple mint orchard", 266, 0),
      item("mk-blue-spark", "Blue spark", 266, 0),
      item("mk-sunset-vibes", "Sunset vibes", 285, 0),
      item("mk-minted-majesty", "Minted majesty", 266, 0),
      item("mk-blue-horizon", "Blue horizon", 266, 0),
      item("mk-red-dragon", "Red dragon", 285, 0),
      item("mk-island-escape", "Island escape", 266, 0),
      item("mk-tropic-twist", "Tropic twist", 266, 0),
      item("mk-green-paradise", "Green paradise", 285, 0),
    ],
  },
  {
    id: "smoothie",
    name: "Smoothie",
    items: [
      item("sm-tropic-delight", "Tropic delight", 280, 0),
      item("sm-berry-wave", "Berry wave", 280, 0),
      item("sm-choco-dream", "Choco dream", 280, 0),
      item("sm-mango-tango", "Mango tango", 280, 0),
      item("sm-redberry-crush", "Redberry crush", 280, 0),
      item("sm-ocean-breeze", "Ocean breeze", 280, 0),
    ],
  },
  {
    id: "sides",
    name: "Sides",
    items: [
      item("sd-mexican-rice", "Mexican rice", TBD, 0),
      item("sd-garlic-rice", "Garlic rice", TBD, 0),
      item("sd-sauteed-vegetable", "Sauteed vegetable", TBD, 0),
      item("sd-sauteed-mushroom", "Sauteed mushroom", TBD, 0),
      item("sd-mash-potato", "Mash potato", TBD, 0),
      item("sd-mac-cheese", "Mac & cheese", TBD, 0),
      item("sd-baked-beans", "Baked beans", TBD, 0),
      item("sd-cheesy-corn", "Cheesy corn", TBD, 0),
      item("sd-wedges", "Wedges", TBD, 0),
      item("sd-coleslaw", "Coleslaw", TBD, 0),
    ],
  },
  {
    id: "sauce",
    name: "Sauce",
    items: [
      item("sau-bbq", "Home made BBQ", TBD, 0),
      item("sau-mushroom", "Mushroom sauce", TBD, 0),
      item("sau-hollandaise", "Hollandaise", TBD, 0),
      item("sau-cheese", "Cheese sauce", TBD, 0),
      item("sau-roast-beacon", "Roast beacon", TBD, 0),
      item("sau-honey-master", "Honey master", TBD, 0),
      item("sau-hot-chilli", "Hot chilli", TBD, 0),
    ],
  },
];

/** Build structured display for cart / receipts from saved config. */
export type OrderLineConfig = {
  variantChoiceIds: Record<string, string>;
  addonIds: string[];
};

export function defaultOrderLineConfig(item: CatalogItem): OrderLineConfig {
  const variantChoiceIds: Record<string, string> = {};
  for (const g of item.variantGroups) {
    variantChoiceIds[g.id] = g.choices[0]?.id ?? "";
  }
  return { variantChoiceIds, addonIds: [] };
}

/** Unit price for one line (base + variant deltas + selected add-ons). */
export function computeLineUnitPrice(
  item: CatalogItem,
  cfg: OrderLineConfig,
): number {
  let cents = item.priceCents;
  for (const g of item.variantGroups) {
    const cid = cfg.variantChoiceIds[g.id];
    const ch = g.choices.find((c) => c.id === cid);
    if (ch) cents += ch.priceDeltaCents;
  }
  for (const aid of cfg.addonIds) {
    const a = item.addons.find((x) => x.id === aid);
    if (a) cents += a.priceCents;
  }
  return cents;
}

export function findCatalogItemById(id: string): CatalogItem | undefined {
  for (const cat of DEMO_CATEGORIES) {
    const found = cat.items.find((x) => x.id === id);
    if (found) return found;
  }
  return undefined;
}

export function buildOrderLineDisplay(item: CatalogItem, cfg: OrderLineConfig) {
  const optionRows = item.variantGroups.map((g) => {
    const cid = cfg.variantChoiceIds[g.id];
    const ch = g.choices.find((c) => c.id === cid);
    return { groupName: g.name, choiceName: ch?.name ?? "—" };
  });
  const variantSummary = optionRows.map((r) => r.choiceName).join(" · ");
  const suboptionRows = cfg.addonIds.map((id) => {
    const a = item.addons.find((x) => x.id === id);
    if (!a) {
      return {
        name: id,
        priceCents: 0,
        parentOptionLabel: undefined as string | undefined,
      };
    }
    const parentOptionLabel = a.parentGroupId
      ? item.variantGroups.find((g) => g.id === a.parentGroupId)?.name
      : undefined;
    return { name: a.name, priceCents: a.priceCents, parentOptionLabel };
  });
  return { optionRows, suboptionRows, variantSummary };
}

