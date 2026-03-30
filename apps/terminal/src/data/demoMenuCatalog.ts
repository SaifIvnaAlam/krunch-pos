/** Demo catalog: items with variant groups (options) and add-ons (sub-options). */

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

export const DEMO_CATEGORIES: CatalogCategory[] = [
  {
    id: "rice-biryani",
    name: "Rice & biryani",
    items: [
      {
        id: "cb-1",
        name: "Chicken biryani",
        priceCents: 1299,
        soldToday: 34,
        variantGroups: [
          {
            id: "portion",
            name: "Portion",
            required: true,
            choices: [
              { id: "reg", name: "Regular", priceDeltaCents: 0 },
              { id: "large", name: "Large", priceDeltaCents: 350 },
            ],
          },
          {
            id: "spice",
            name: "Spice level",
            required: true,
            choices: [
              { id: "mild", name: "Mild", priceDeltaCents: 0 },
              { id: "med", name: "Medium", priceDeltaCents: 0 },
              { id: "hot", name: "Hot", priceDeltaCents: 0 },
            ],
          },
        ],
        addons: [
          {
            id: "a-boil",
            name: "Boiled egg",
            priceCents: 150,
            parentGroupId: "portion",
          },
          {
            id: "a-salad",
            name: "Extra raita",
            priceCents: 120,
            parentGroupId: "portion",
          },
          {
            id: "a-papad",
            name: "Papad",
            priceCents: 80,
            parentGroupId: "spice",
          },
        ],
      },
      {
        id: "cb-2",
        name: "Beef tehari",
        priceCents: 1199,
        soldToday: 12,
        variantGroups: [
          {
            id: "portion",
            name: "Portion",
            required: true,
            choices: [
              { id: "reg", name: "Regular", priceDeltaCents: 0 },
              { id: "large", name: "Large", priceDeltaCents: 300 },
            ],
          },
        ],
        addons: [
          {
            id: "a-egg",
            name: "Fried egg",
            priceCents: 150,
            parentGroupId: "portion",
          },
          {
            id: "a-chili",
            name: "Green chili pickle",
            priceCents: 60,
            parentGroupId: "portion",
          },
        ],
      },
    ],
  },
  {
    id: "curry",
    name: "Curry & sides",
    items: [
      {
        id: "cv-1",
        name: "Mutton rezala",
        priceCents: 1499,
        soldToday: 18,
        variantGroups: [
          {
            id: "rice",
            name: "Carb",
            required: true,
            choices: [
              { id: "plain", name: "Plain rice", priceDeltaCents: 0 },
              { id: "polao", name: "Polao", priceDeltaCents: 200 },
              { id: "naan", name: "Butter naan", priceDeltaCents: 250 },
            ],
          },
        ],
        addons: [
          {
            id: "a-salad2",
            name: "House salad",
            priceCents: 199,
            parentGroupId: "rice",
          },
          {
            id: "a-dal",
            name: "Dal fry (small)",
            priceCents: 249,
            parentGroupId: "rice",
          },
        ],
      },
      {
        id: "cv-2",
        name: "Daal makhani",
        priceCents: 799,
        soldToday: 22,
        variantGroups: [
          {
            id: "size",
            name: "Bowl size",
            required: true,
            choices: [
              { id: "half", name: "Half", priceDeltaCents: -200 },
              { id: "full", name: "Full", priceDeltaCents: 0 },
            ],
          },
        ],
        addons: [
          {
            id: "a-ghee",
            name: "Extra ghee",
            priceCents: 100,
            parentGroupId: "size",
          },
        ],
      },
    ],
  },
  {
    id: "beverages",
    name: "Beverages",
    items: [
      {
        id: "be-1",
        name: "Mango lassi",
        priceCents: 450,
        soldToday: 41,
        variantGroups: [
          {
            id: "sweet",
            name: "Sweetness",
            required: true,
            choices: [
              { id: "std", name: "Standard", priceDeltaCents: 0 },
              { id: "less", name: "Less sugar", priceDeltaCents: 0 },
            ],
          },
          {
            id: "ice",
            name: "Ice",
            required: true,
            choices: [
              { id: "normal", name: "Normal", priceDeltaCents: 0 },
              { id: "noice", name: "No ice", priceDeltaCents: 0 },
            ],
          },
        ],
        addons: [
          {
            id: "a-mint",
            name: "Mint shot",
            priceCents: 50,
            parentGroupId: "sweet",
          },
        ],
      },
      {
        id: "be-2",
        name: "Masala cha",
        priceCents: 199,
        soldToday: 56,
        variantGroups: [],
        addons: [
          { id: "a-ginger", name: "Extra ginger", priceCents: 0 },
          { id: "a-elachi", name: "Cardamom", priceCents: 0 },
        ],
      },
    ],
  },
  {
    id: "desserts",
    name: "Desserts",
    items: [
      {
        id: "ds-1",
        name: "Rasmalai (2 pcs)",
        priceCents: 550,
        soldToday: 15,
        variantGroups: [
          {
            id: "syrup",
            name: "Syrup",
            required: true,
            choices: [
              { id: "light", name: "Light", priceDeltaCents: 0 },
              { id: "heavy", name: "Extra syrup", priceDeltaCents: 0 },
            ],
          },
        ],
        addons: [
          {
            id: "a-pista",
            name: "Pistachio topping",
            priceCents: 120,
            parentGroupId: "syrup",
          },
        ],
      },
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

