import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import type { CatalogCategory, CatalogItem, MenuVariantGroup } from "../../data/demoMenuCatalog";

export type AddonTemplate = {
  id: string;
  name: string;
  priceCents: number;
};

type Props = {
  categories: CatalogCategory[];
  setCategories: Dispatch<SetStateAction<CatalogCategory[]>>;
  addonTemplates: AddonTemplate[];
  setAddonTemplates: Dispatch<SetStateAction<AddonTemplate[]>>;
  initialLeaf: "fd-cat" | "fd-items" | "fd-addon" | "fd-menu";
};

function slug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(seed: string) {
  const core = slug(seed) || "item";
  return `${core}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatMoney(cents: number) {
  return (cents / 100).toFixed(2);
}

export function FoodManagementPanel({
  categories,
  setCategories,
  addonTemplates,
  setAddonTemplates,
  initialLeaf,
}: Props) {
  const [categoryName, setCategoryName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemPrice, setItemPrice] = useState("0");
  const [newItemCategory, setNewItemCategory] = useState(categories[0]?.id ?? "");
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id ?? "");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupRequired, setGroupRequired] = useState(true);
  const [choiceName, setChoiceName] = useState("");
  const [choiceDelta, setChoiceDelta] = useState("0");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [addonName, setAddonName] = useState("");
  const [addonPrice, setAddonPrice] = useState("0");
  const [addonParentGroupId, setAddonParentGroupId] = useState("");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId),
    [categories, selectedCategoryId],
  );
  const selectedItem: CatalogItem | undefined = useMemo(
    () => selectedCategory?.items.find((i) => i.id === selectedItemId),
    [selectedCategory, selectedItemId],
  );
  const selectedGroup: MenuVariantGroup | undefined = useMemo(
    () => selectedItem?.variantGroups.find((g) => g.id === selectedGroupId),
    [selectedItem, selectedGroupId],
  );

  const createCategory = () => {
    if (!categoryName.trim()) return;
    const id = uniqueId(categoryName);
    setCategories((prev) => [...prev, { id, name: categoryName.trim(), items: [] }]);
    setCategoryName("");
    setSelectedCategoryId(id);
    setNewItemCategory(id);
  };

  const createItem = () => {
    const priceCents = Math.round(Number(itemPrice) * 100);
    if (!itemName.trim() || !newItemCategory || Number.isNaN(priceCents)) return;
    const templateAddons = addonTemplates
      .filter((t) => selectedTemplateIds.includes(t.id))
      .map((t) => ({
        id: uniqueId(t.name),
        name: t.name,
        priceCents: t.priceCents,
      }));
    const nextItem: CatalogItem = {
      id: uniqueId(itemName),
      name: itemDescription.trim()
        ? `${itemName.trim()} (${itemDescription.trim()})`
        : itemName.trim(),
      priceCents: Math.max(0, priceCents),
      soldToday: 0,
      variantGroups: [],
      addons: templateAddons,
    };
    setCategories((prev) =>
      prev.map((c) => (c.id === newItemCategory ? { ...c, items: [...c.items, nextItem] } : c)),
    );
    setItemName("");
    setItemDescription("");
    setItemPrice("0");
    setSelectedTemplateIds([]);
    setSelectedCategoryId(newItemCategory);
    setSelectedItemId(nextItem.id);
  };

  const createGroup = () => {
    if (!selectedCategory || !selectedItem || !groupName.trim()) return;
    const nextGroup: MenuVariantGroup = {
      id: uniqueId(groupName),
      name: groupName.trim(),
      required: groupRequired,
      choices: [],
    };
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== selectedCategory.id
          ? c
          : {
              ...c,
              items: c.items.map((i) =>
                i.id === selectedItem.id
                  ? { ...i, variantGroups: [...i.variantGroups, nextGroup] }
                  : i,
              ),
            },
      ),
    );
    setGroupName("");
    setSelectedGroupId(nextGroup.id);
  };

  const createChoice = () => {
    const delta = Math.round(Number(choiceDelta) * 100);
    if (!selectedCategory || !selectedItem || !selectedGroup || !choiceName.trim() || Number.isNaN(delta)) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== selectedCategory.id
          ? c
          : {
              ...c,
              items: c.items.map((i) =>
                i.id !== selectedItem.id
                  ? i
                  : {
                      ...i,
                      variantGroups: i.variantGroups.map((g) =>
                        g.id !== selectedGroup.id
                          ? g
                          : {
                              ...g,
                              choices: [
                                ...g.choices,
                                {
                                  id: uniqueId(choiceName),
                                  name: choiceName.trim(),
                                  priceDeltaCents: delta,
                                },
                              ],
                            },
                      ),
                    },
              ),
            },
      ),
    );
    setChoiceName("");
    setChoiceDelta("0");
  };

  const createAddon = () => {
    const price = Math.round(Number(addonPrice) * 100);
    if (!selectedCategory || !selectedItem || !addonName.trim() || Number.isNaN(price)) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== selectedCategory.id
          ? c
          : {
              ...c,
              items: c.items.map((i) =>
                i.id !== selectedItem.id
                  ? i
                  : {
                      ...i,
                      addons: [
                        ...i.addons,
                        {
                          id: uniqueId(addonName),
                          name: addonName.trim(),
                          priceCents: price,
                          parentGroupId: addonParentGroupId || undefined,
                        },
                      ],
                    },
              ),
            },
      ),
    );
    setAddonName("");
    setAddonPrice("0");
    setAddonParentGroupId("");
  };

  const createAddonTemplate = () => {
    const price = Math.round(Number(addonPrice) * 100);
    if (!addonName.trim() || Number.isNaN(price)) return;
    setAddonTemplates((prev) => [
      ...prev,
      { id: uniqueId(addonName), name: addonName.trim(), priceCents: Math.max(0, price) },
    ]);
    setAddonName("");
    setAddonPrice("0");
  };

  const attachTemplateToItem = (templateId: string) => {
    const template = addonTemplates.find((t) => t.id === templateId);
    if (!template || !selectedCategory || !selectedItem) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== selectedCategory.id
          ? c
          : {
              ...c,
              items: c.items.map((i) =>
                i.id !== selectedItem.id
                  ? i
                  : {
                      ...i,
                      addons: [
                        ...i.addons,
                        {
                          id: uniqueId(template.name),
                          name: template.name,
                          priceCents: template.priceCents,
                        },
                      ],
                    },
              ),
            },
      ),
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
      <div>
        <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">
          {initialLeaf === "fd-menu"
            ? "Menu management"
            : initialLeaf === "fd-cat"
              ? "Category setup"
              : initialLeaf === "fd-items"
                ? "Item editor"
                : "Add-on library"}
        </h1>
      </div>

      {initialLeaf === "fd-cat" || initialLeaf === "fd-menu" ? (
        <section className="rounded-[12px] border border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-card)] p-4">
          <p className="text-[13px] font-medium text-[var(--pos-text-1)]">New category</p>
          <div className="mt-2 flex gap-2">
            <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Category name" className="h-10 flex-1 rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[13px]" />
            <button type="button" onClick={createCategory} className="h-10 rounded-[10px] bg-[var(--pos-primary-bg)] px-4 text-[12px] font-medium text-[var(--pos-primary-fg)]">Create</button>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-[12px] text-[var(--pos-text-2)]">Existing categories</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <span key={c.id} className="rounded-full border border-solid [border-color:var(--pos-border-medium)] px-3 py-1 text-[12px] text-[var(--pos-text-1)]">
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {initialLeaf === "fd-addon" ? (
        <section className="rounded-[12px] border border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-card)] p-4">
          <p className="text-[13px] font-medium text-[var(--pos-text-1)]">Add-on library</p>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            <input value={addonName} onChange={(e) => setAddonName(e.target.value)} placeholder="Add-on name" className="h-10 rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[13px]" />
            <input value={addonPrice} onChange={(e) => setAddonPrice(e.target.value)} placeholder="Price (e.g. 1.25)" className="h-10 rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[13px]" />
            <button type="button" onClick={createAddonTemplate} className="h-10 rounded-[10px] bg-[var(--pos-primary-bg)] px-4 text-[12px] font-medium text-[var(--pos-primary-fg)]">Save add-on</button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {addonTemplates.map((a) => (
              <div key={a.id} className="rounded-[10px] border border-solid [border-color:var(--pos-border-hairline)] p-3 text-[12px]">
                <p className="font-medium text-[var(--pos-text-1)]">{a.name}</p>
                <p className="font-mono text-[var(--pos-text-2)]">৳{formatMoney(a.priceCents)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {initialLeaf === "fd-items" || initialLeaf === "fd-menu" ? (
        <>
          <section className="rounded-[12px] border border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-card)] p-4">
            <p className="text-[13px] font-medium text-[var(--pos-text-1)]">Step 1: Basic item info</p>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <select value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)} className="h-10 rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[13px]">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Item name" className="h-10 rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[13px]" />
              <input value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} placeholder="Base price (e.g. 12.99)" className="h-10 rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[13px]" />
              <input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="Short note (optional)" className="h-10 rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[13px]" />
            </div>
            <p className="mt-3 text-[12px] text-[var(--pos-text-2)]">Pick from add-on library for this item</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {addonTemplates.map((a) => {
                const selected = selectedTemplateIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() =>
                      setSelectedTemplateIds((prev) =>
                        selected ? prev.filter((id) => id !== a.id) : [...prev, a.id],
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-[12px] ${
                      selected
                        ? "border-[var(--pos-text-1)] bg-[var(--pos-nav-hover)] text-[var(--pos-text-1)]"
                        : "border-[var(--pos-border-medium)] text-[var(--pos-text-2)]"
                    }`}
                  >
                    {a.name} (৳{formatMoney(a.priceCents)})
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={createItem} className="mt-3 h-10 rounded-[10px] bg-[var(--pos-primary-bg)] px-4 text-[12px] font-medium text-[var(--pos-primary-fg)]">Create item</button>
          </section>

          <section className="rounded-[12px] border border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-card)] p-4">
            <p className="text-[13px] font-medium text-[var(--pos-text-1)]">Step 2: Configure item modifiers and item-specific add-ons</p>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <select value={selectedCategoryId} onChange={(e) => { setSelectedCategoryId(e.target.value); setSelectedItemId(""); setSelectedGroupId(""); }} className="h-10 rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[13px]">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={selectedItemId} onChange={(e) => { setSelectedItemId(e.target.value); setSelectedGroupId(""); }} className="h-10 rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[13px]">
                <option value="">Select item</option>
                {selectedCategory?.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            {!selectedItem ? (
              <p className="mt-3 text-[12px] text-[var(--pos-text-2)]">Select an item to continue.</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-[10px] border border-solid [border-color:var(--pos-border-hairline)] p-3">
                  <p className="text-[12px] font-medium">Modifier group</p>
                  <div className="mt-2 flex gap-2">
                    <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Size" className="h-9 flex-1 rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px]" />
                    <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={groupRequired} onChange={(e) => setGroupRequired(e.target.checked)} />Required</label>
                    <button type="button" onClick={createGroup} className="h-9 rounded-[8px] bg-[var(--pos-primary-bg)] px-3 text-[11px] font-medium text-[var(--pos-primary-fg)]">Add</button>
                  </div>
                  <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} className="mt-2 h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px]">
                    <option value="">Select group</option>
                    {selectedItem.variantGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  {selectedGroup ? (
                    <div className="mt-2 flex gap-2">
                      <input value={choiceName} onChange={(e) => setChoiceName(e.target.value)} placeholder="Choice name" className="h-9 flex-1 rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px]" />
                      <input value={choiceDelta} onChange={(e) => setChoiceDelta(e.target.value)} placeholder="+/- price" className="h-9 w-24 rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px]" />
                      <button type="button" onClick={createChoice} className="h-9 rounded-[8px] bg-[var(--pos-primary-bg)] px-3 text-[11px] font-medium text-[var(--pos-primary-fg)]">Add choice</button>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[10px] border border-solid [border-color:var(--pos-border-hairline)] p-3">
                  <p className="text-[12px] font-medium">Item add-ons</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {addonTemplates.map((a) => (
                      <button key={a.id} type="button" onClick={() => attachTemplateToItem(a.id)} className="rounded-full border border-solid [border-color:var(--pos-border-medium)] px-2 py-1 text-[11px] text-[var(--pos-text-1)]">
                        + {a.name}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    <input value={addonName} onChange={(e) => setAddonName(e.target.value)} placeholder="Quick create add-on" className="h-9 rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px]" />
                    <input value={addonPrice} onChange={(e) => setAddonPrice(e.target.value)} placeholder="Price (e.g. 1.25)" className="h-9 rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px]" />
                    <select value={addonParentGroupId} onChange={(e) => setAddonParentGroupId(e.target.value)} className="h-9 rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px]">
                      <option value="">Whole item (not tied)</option>
                      {selectedItem.variantGroups.map((g) => <option key={g.id} value={g.id}>With {g.name}</option>)}
                    </select>
                    <button type="button" onClick={createAddon} className="h-9 rounded-[8px] bg-[var(--pos-primary-bg)] px-3 text-[11px] font-medium text-[var(--pos-primary-fg)]">Create add-on for this item</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
