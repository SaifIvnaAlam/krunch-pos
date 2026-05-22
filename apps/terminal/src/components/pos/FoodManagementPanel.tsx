import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { ImageUploadField } from "./ImageUploadField";
import {
  catalogItemToModifiers,
  createMenuItemOnApi,
  updateMenuItemOnApi,
} from "@/features/menu";
import { fromStorageRef, uploadFileToStorage } from "@/features/storage";
import { isDemoDataMode } from "@/shared/config/env";
import type { CatalogCategory, CatalogItem } from "@/features/menu";

type Props = {
  categories: CatalogCategory[];
  setCategories: Dispatch<SetStateAction<CatalogCategory[]>>;
  onMenuRefresh?: () => Promise<void>;
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

const inputClass =
  "h-9 min-w-0 flex-1 rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 text-[13px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none";
const selectClass =
  "h-9 min-w-0 rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 text-[13px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none";
const btnClass =
  "h-9 shrink-0 rounded-[8px] bg-[var(--pos-primary-bg)] px-3 text-[12px] font-medium text-[var(--pos-primary-fg)] disabled:opacity-50";

export function FoodManagementPanel({
  categories,
  setCategories,
  onMenuRefresh,
}: Props) {
  const [categoryName, setCategoryName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState(categories[0]?.id ?? "");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [extraName, setExtraName] = useState("");
  const [extraPrice, setExtraPrice] = useState("");
  const [itemSaveError, setItemSaveError] = useState<string | null>(null);
  const [itemSaving, setItemSaving] = useState(false);
  const [photoSaveError, setPhotoSaveError] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);

  useEffect(() => {
    if (!itemCategoryId && categories[0]) setItemCategoryId(categories[0].id);
  }, [categories, itemCategoryId]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId),
    [categories, selectedCategoryId],
  );
  const selectedItem = useMemo(
    () => selectedCategory?.items.find((i) => i.id === selectedItemId),
    [selectedCategory, selectedItemId],
  );

  const totalItems = useMemo(
    () => categories.reduce((n, c) => n + c.items.length, 0),
    [categories],
  );

  const createCategory = () => {
    if (!categoryName.trim()) return;
    const id = uniqueId(categoryName);
    setCategories((prev) => [...prev, { id, name: categoryName.trim(), items: [] }]);
    setCategoryName("");
    setItemCategoryId(id);
  };

  const createItem = () => {
    void (async () => {
      const priceCents = Math.round(Number(itemPrice) * 100);
      if (!itemName.trim() || !itemCategoryId || Number.isNaN(priceCents)) return;
      const catName =
        categories.find((c) => c.id === itemCategoryId)?.name ?? "Uncategorized";
      const displayName = itemName.trim();
      const draftItem: CatalogItem = {
        id: uniqueId(itemName),
        name: displayName,
        priceCents: Math.max(0, priceCents),
        soldToday: 0,
        variantGroups: [],
        addons: [],
      };

      if (!isDemoDataMode()) {
        setItemSaving(true);
        setItemSaveError(null);
        try {
          await createMenuItemOnApi({
            name: displayName,
            price: Math.max(0, priceCents) / 100,
            category: catName,
            modifiers: catalogItemToModifiers(draftItem),
          });
          await onMenuRefresh?.();
        } catch (e) {
          setItemSaveError(e instanceof Error ? e.message : "Could not save item.");
          setItemSaving(false);
          return;
        }
        setItemSaving(false);
      } else {
        setCategories((prev) =>
          prev.map((c) =>
            c.id === itemCategoryId ? { ...c, items: [...c.items, draftItem] } : c,
          ),
        );
        setSelectedCategoryId(itemCategoryId);
        setSelectedItemId(draftItem.id);
      }

      setItemName("");
      setItemPrice("");
    })();
  };

  const selectItem = (categoryId: string, itemId: string) => {
    setSelectedCategoryId(categoryId);
    setSelectedItemId(itemId);
    setPhotoSaveError(null);
  };

  const updateSelectedItemPhoto = (ref: string | null) => {
    if (!selectedCategory || !selectedItem) return;
    void (async () => {
      setPhotoSaving(true);
      setPhotoSaveError(null);
      try {
        if (!isDemoDataMode()) {
          const imageKey = ref ? (fromStorageRef(ref) ?? undefined) : null;
          await updateMenuItemOnApi(selectedItem.id, { imageKey: imageKey ?? null });
          await onMenuRefresh?.();
        } else {
          setCategories((prev) =>
            prev.map((c) =>
              c.id !== selectedCategory.id
                ? c
                : {
                    ...c,
                    items: c.items.map((i) =>
                      i.id === selectedItem.id ? { ...i, imageRef: ref } : i,
                    ),
                  },
            ),
          );
        }
      } catch (e) {
        setPhotoSaveError(e instanceof Error ? e.message : "Could not update photo.");
      } finally {
        setPhotoSaving(false);
      }
    })();
  };

  const addExtra = () => {
    const price = Math.round(Number(extraPrice) * 100);
    if (!selectedCategory || !selectedItem || !extraName.trim() || Number.isNaN(price)) return;
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
                          id: uniqueId(extraName),
                          name: extraName.trim(),
                          priceCents: Math.max(0, price),
                        },
                      ],
                    },
              ),
            },
      ),
    );
    setExtraName("");
    setExtraPrice("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-1">
      <h1 className="text-[15px] font-semibold text-[var(--pos-text-1)]">Menu</h1>

      <div className="flex flex-col gap-2 rounded-[10px] border border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-card)] p-3">
        <div className="flex gap-2">
          <input
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createCategory()}
            placeholder="New category"
            className={inputClass}
          />
          <button type="button" onClick={createCategory} className={btnClass}>
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={itemCategoryId}
            onChange={(e) => setItemCategoryId(e.target.value)}
            className={`${selectClass} max-w-[140px]`}
            disabled={categories.length === 0}
          >
            {categories.length === 0 ? (
              <option value="">No category</option>
            ) : (
              categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="Item name"
            className={inputClass}
          />
          <input
            value={itemPrice}
            onChange={(e) => setItemPrice(e.target.value)}
            placeholder="Price"
            inputMode="decimal"
            className={`${inputClass} max-w-[88px]`}
          />
          <button
            type="button"
            onClick={createItem}
            disabled={itemSaving || categories.length === 0}
            className={btnClass}
          >
            {itemSaving ? "…" : "Add item"}
          </button>
        </div>
        {itemSaveError ? <p className="text-[12px] text-red-600">{itemSaveError}</p> : null}
      </div>

      <div className="min-h-0 flex-1 rounded-[10px] border border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-card)]">
        {categories.length === 0 ? (
          <p className="p-4 text-[13px] text-[var(--pos-text-2)]">Add a category, then items.</p>
        ) : totalItems === 0 ? (
          <p className="p-4 text-[13px] text-[var(--pos-text-2)]">No items yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--pos-border-hairline)]">
            {categories.map((cat) => (
              <li key={cat.id}>
                <p className="bg-[var(--pos-page)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)]">
                  {cat.name}
                </p>
                {cat.items.length === 0 ? (
                  <p className="px-3 py-2 text-[12px] text-[var(--pos-text-2)]">No items</p>
                ) : (
                  <ul>
                    {cat.items.map((item) => {
                      const selected =
                        selectedCategoryId === cat.id && selectedItemId === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => selectItem(cat.id, item.id)}
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-[var(--pos-nav-hover)]/40 ${
                              selected ? "bg-[var(--pos-nav-hover)]/60" : ""
                            }`}
                          >
                            <span className="min-w-0 truncate text-[var(--pos-text-1)]">
                              {item.name}
                            </span>
                            <span className="shrink-0 font-mono tabular-nums text-[var(--pos-text-2)]">
                              ৳{formatMoney(item.priceCents)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedItem ? (
        <div className="rounded-[10px] border border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-card)] p-3">
          <p className="truncate text-[13px] font-medium text-[var(--pos-text-1)]">
            {selectedItem.name}
          </p>
          <div className="mt-2">
            <ImageUploadField
              label="Photo"
              mediaRef={selectedItem.imageRef ?? null}
              onMediaRefChange={updateSelectedItemPhoto}
              disabled={photoSaving}
              onUpload={(file) => uploadFileToStorage(file, "menu", selectedItem.name)}
            />
            {photoSaveError ? (
              <p className="mt-1 text-[12px] text-red-600">{photoSaveError}</p>
            ) : null}
          </div>
          {selectedItem.addons.length > 0 ? (
            <ul className="mt-3 space-y-1 text-[12px] text-[var(--pos-text-2)]">
              {selectedItem.addons.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span>{a.name}</span>
                  <span className="font-mono tabular-nums">+৳{formatMoney(a.priceCents)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex gap-2">
            <input
              value={extraName}
              onChange={(e) => setExtraName(e.target.value)}
              placeholder="Extra name"
              className={inputClass}
            />
            <input
              value={extraPrice}
              onChange={(e) => setExtraPrice(e.target.value)}
              placeholder="Price"
              inputMode="decimal"
              className={`${inputClass} max-w-[72px]`}
            />
            <button type="button" onClick={addExtra} className={btnClass}>
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
