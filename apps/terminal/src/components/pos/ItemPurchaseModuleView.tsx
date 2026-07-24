import { useEffect, useState } from "react";
import { ExpensesListView } from "./ExpensesListView";
import { LedgerModuleView } from "./LedgerModuleView";
import { dispatchPosSelectLeaf } from "../../lib/posNavEvents";

/** Top-level Item Purchases area. Suppliers live here as a tab (create + summary). */
export const ITEM_PURCHASE_LEAF_IDS = new Set(["ip-home"]);

type ItemPurchaseTab = "purchases" | "suppliers";

const TABS: { value: ItemPurchaseTab; label: string }[] = [
  { value: "purchases", label: "Purchases" },
  { value: "suppliers", label: "Suppliers" },
];

/** Tab the module should open on next mount (set by cross-module deep links). */
let pendingTab: ItemPurchaseTab | null = null;

/** Navigate to Item Purchases and land on the Suppliers tab (create + summary). */
export function openItemPurchaseSuppliers(): void {
  pendingTab = "suppliers";
  dispatchPosSelectLeaf("ip-home");
}

export function ItemPurchaseModuleView() {
  const [tab, setTab] = useState<ItemPurchaseTab>(pendingTab ?? "purchases");

  useEffect(() => {
    pendingTab = null;
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div
        role="tablist"
        aria-label="Item purchase sections"
        className="mx-3 mt-2 flex shrink-0 gap-1 rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-1"
      >
        {TABS.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.value)}
              className={[
                "h-8 flex-1 cursor-pointer rounded-[8px] px-3 text-[12px] font-medium transition-colors sm:flex-none sm:px-4",
                active
                  ? "bg-[var(--pos-card)] font-semibold text-[var(--pos-text-1)] shadow-sm"
                  : "text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]",
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {tab === "purchases" ? (
          <ExpensesListView lockedKind="item_purchase" />
        ) : (
          <LedgerModuleView leafId="lm-suppliers" />
        )}
      </div>
    </div>
  );
}
