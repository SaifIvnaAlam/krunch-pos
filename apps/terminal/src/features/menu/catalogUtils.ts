import type { CatalogItem, OrderLineConfig } from "./types";

export function defaultOrderLineConfig(item: CatalogItem): OrderLineConfig {
  const variantChoiceIds: Record<string, string> = {};
  for (const g of item.variantGroups) {
    variantChoiceIds[g.id] = g.choices[0]?.id ?? "";
  }
  return { variantChoiceIds, addonIds: [] };
}

export function computeLineUnitPrice(item: CatalogItem, cfg: OrderLineConfig): number {
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
