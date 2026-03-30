import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Flame,
  Focus,
  Minus,
  PanelLeftOpen,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { useDevAuth } from "../context/DevAuthContext";
import { MENU_VIEW_IDS, findLeafMeta } from "../data/bhojonNav";
import {
  DEMO_CATEGORIES,
  buildOrderLineDisplay,
  computeLineUnitPrice,
  defaultOrderLineConfig,
  type CatalogItem,
  type OrderLineConfig,
} from "../data/demoMenuCatalog";
import { PosSidebar } from "../components/pos/PosBhojonSidebar";
import { DashboardView } from "../components/pos/DashboardView";
import { FloorView } from "../components/pos/FloorView";
import { OrdersManageView } from "../components/pos/OrdersManageView";
import { GenericModuleView } from "../components/pos/GenericModuleView";
import { ItemOptionsBody } from "../components/pos/ItemOptionsModal";
import {
  FoodManagementPanel,
  type AddonTemplate,
} from "../components/pos/FoodManagementPanel";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

const CATEGORY_STYLES = [
  { bg: "#ffd4c8", text: "#7a3520" },
  { bg: "#c8efe0", text: "#1a5c40" },
  { bg: "#ddd4f5", text: "#3d2875" },
  { bg: "#c8e4f5", text: "#1a4a6c" },
  { bg: "#fce5c8", text: "#7a4010" },
  { bg: "#f5d0dc", text: "#6c1a30" },
  { bg: "#d8edd0", text: "#2a5020" },
  { bg: "#f5f0c0", text: "#5c4c00" },
] as const;

const DEMO_TABLES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

type CartLine = {
  key: string;
  itemId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  variantSummary: string;
  optionRows: { groupName: string; choiceName: string }[];
  suboptionRows: {
    name: string;
    priceCents: number;
    parentOptionLabel?: string;
  }[];
  lineConfig: OrderLineConfig;
};

function newLineKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatMoney(cents: number) {
  return (cents / 100).toFixed(2);
}

type CatalogRow = CatalogItem & {
  categoryId: string;
  categoryName: string;
};

function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (el.isContentEditable) return true;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function cartLineFromItem(item: CatalogItem, qty: number): CartLine {
  const lineConfig = defaultOrderLineConfig(item);
  const unitPriceCents = computeLineUnitPrice(item, lineConfig);
  const { optionRows, suboptionRows, variantSummary } = buildOrderLineDisplay(
    item,
    lineConfig,
  );
  return {
    key: newLineKey(),
    itemId: item.id,
    name: item.name,
    qty,
    unitPriceCents,
    variantSummary,
    optionRows,
    suboptionRows,
    lineConfig,
  };
}

function lineWithConfig(
  line: CartLine,
  item: CatalogItem,
  lineConfig: OrderLineConfig,
): CartLine {
  const unitPriceCents = computeLineUnitPrice(item, lineConfig);
  const { optionRows, suboptionRows, variantSummary } = buildOrderLineDisplay(
    item,
    lineConfig,
  );
  return {
    ...line,
    lineConfig,
    unitPriceCents,
    variantSummary,
    optionRows,
    suboptionRows,
  };
}

export function PosTerminalPage() {
  const navigate = useNavigate();
  const { signOut } = useDevAuth();
  const [menuCategories, setMenuCategories] = useState(() =>
    DEMO_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.map((item) => ({
        ...item,
        variantGroups: item.variantGroups.map((group) => ({
          ...group,
          choices: group.choices.map((choice) => ({ ...choice })),
        })),
        addons: item.addons.map((addon) => ({ ...addon })),
      })),
    })),
  );
  const [addonTemplates, setAddonTemplates] = useState<AddonTemplate[]>(() => {
    const map = new Map<string, AddonTemplate>();
    for (const cat of DEMO_CATEGORIES) {
      for (const item of cat.items) {
        for (const addon of item.addons) {
          const key = `${addon.name.toLowerCase()}|${addon.priceCents}`;
          if (!map.has(key)) {
            map.set(key, {
              id: `${key}-${Math.random().toString(36).slice(2, 6)}`,
              name: addon.name,
              priceCents: addon.priceCents,
            });
          }
        }
      }
    }
    return Array.from(map.values());
  });
  const orderedMenuCategories = useMemo(
    () => [...menuCategories].sort((a, b) => a.name.localeCompare(b.name)),
    [menuCategories],
  );
  const [activeLeafId, setActiveLeafId] = useState("menu");
  const [activeCategory, setActiveCategory] = useState(
    orderedMenuCategories[0]?.id ?? "rice-biryani",
  );
  const [menuSearch, setMenuSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedLine, setSelectedLine] = useState(0);
  const [tableNumber, setTableNumber] = useState(4);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCategory, setCustomerCategory] = useState("regular");
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [orderPanelWidth, setOrderPanelWidth] = useState(460);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [editDraftConfig, setEditDraftConfig] = useState<OrderLineConfig | null>(
    null,
  );
  /** Full chrome (sidebar + footer). POS opens in focus/zen mode by default. */
  const [focusMode, setFocusMode] = useState(true);
  const menuSearchInputRef = useRef<HTMLInputElement>(null);
  const orderPanelRef = useRef<HTMLElement | null>(null);

  const items = useMemo((): CatalogRow[] => {
    const q = menuSearch.trim().toLowerCase();
    if (!q) {
      const cat = menuCategories.find((c) => c.id === activeCategory);
      const list = cat?.items ?? [];
      return list.map((item) => ({
        ...item,
        categoryId: activeCategory,
        categoryName: cat?.name ?? "",
      }));
    }
    const out: CatalogRow[] = [];
    for (const cat of orderedMenuCategories) {
      for (const item of cat.items) {
        if (item.name.toLowerCase().includes(q)) {
          out.push({
            ...item,
            categoryId: cat.id,
            categoryName: cat.name,
          });
        }
      }
    }
    return out;
  }, [activeCategory, menuCategories, menuSearch, orderedMenuCategories]);

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + l.unitPriceCents * l.qty, 0),
    [cart],
  );
  const tax = Math.round(subtotal * 0.0825);
  const total = subtotal + tax;

  useEffect(() => {
    setSelectedLine((i) =>
      cart.length === 0 ? 0 : Math.min(i, Math.max(0, cart.length - 1)),
    );
  }, [cart.length]);

  useEffect(() => {
    if (menuCategories.some((c) => c.id === activeCategory)) return;
    setActiveCategory(menuCategories[0]?.id ?? "");
  }, [activeCategory, menuCategories]);

  const showMenuSurface = MENU_VIEW_IDS.has(activeLeafId);

  useEffect(() => {
    if (!showMenuSurface) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target === menuSearchInputRef.current) return;
      if (isEditableTarget(target)) return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        menuSearchInputRef.current?.focus();
        return;
      }
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        menuSearchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMenuSurface]);

  const addItemToCart = (item: CatalogItem) => {
    const line = cartLineFromItem(item, 1);
    const newIndex = cart.length;
    setCart((c) => [...c, line]);
    setSelectedLine(newIndex);
  };

  const selectedCatalogItem =
    cart.length > 0
      ? menuCategories
          .flatMap((cat) => cat.items)
          .find((item) => item.id === (cart[selectedLine]?.itemId ?? ""))
      : undefined;
  const activeLine = cart.length > 0 ? cart[selectedLine] : undefined;
  const editingLine =
    editingLineIndex !== null ? cart[editingLineIndex] : undefined;
  const editingCatalogItem = editingLine
    ? menuCategories
        .flatMap((cat) => cat.items)
        .find((item) => item.id === editingLine.itemId)
    : undefined;

  const setLineQty = (idx: number, delta: number) => {
    setCart((c) =>
      c
        .map((l, i) => {
          if (i !== idx) return l;
          const q = l.qty + delta;
          if (q <= 0) return null;
          return { ...l, qty: q };
        })
        .filter((x): x is CartLine => x !== null),
    );
  };

  const openEditModalForLine = (idx: number) => {
    const line = cart[idx];
    if (!line) return;
    setSelectedLine(idx);
    setEditingLineIndex(idx);
    setEditDraftConfig(line.lineConfig);
    setEditModalOpen(true);
  };

  const applyEditModal = () => {
    if (editingLineIndex === null || !editDraftConfig || !editingCatalogItem) return;
    setCart((c) =>
      c.map((l, i) =>
        i === editingLineIndex
          ? lineWithConfig(l, editingCatalogItem, editDraftConfig)
          : l,
      ),
    );
    setEditModalOpen(false);
    setEditingLineIndex(null);
  };

  const startResizeOrderPanel = () => {
    const minWidth = 380;
    const maxWidth = 760;
    const onMove = (ev: MouseEvent) => {
      const rect = orderPanelRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nextWidth = Math.max(
        minWidth,
        Math.min(maxWidth, rect.right - ev.clientX),
      );
      setOrderPanelWidth(nextWidth);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleSignOut = () => {
    signOut();
    navigate("/signin", { replace: true });
  };

  const showOrderPanel = showMenuSurface;

  const mainContent = () => {
    if (activeLeafId === "dashboard") return <DashboardView />;
    if (activeLeafId === "floor") return <FloorView />;
    if (activeLeafId === "mo-list") {
      return <OrdersManageView defaultFilter="all" />;
    }
    if (activeLeafId === "mo-pending") {
      return <OrdersManageView defaultFilter="pending_kitchen" />;
    }
    if (activeLeafId === "mo-completed") {
      return <OrdersManageView defaultFilter="completed" />;
    }
    if (activeLeafId === "mo-cancelled") {
      return <OrdersManageView defaultFilter="cancelled" />;
    }
    if (activeLeafId === "mo-online") {
      return <OrdersManageView defaultFilter="online" />;
    }

    if (showMenuSurface) {
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[15px] font-medium text-[var(--pos-text-1)]">
                Menu / POS
              </h1>
              <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
                Tap an item to add it — adjust quantity and options in the order
                panel
              </p>
            </div>
            <div className="relative w-full min-w-[200px] shrink-0 sm:max-w-[320px]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pos-icon-muted)]"
                strokeWidth={2}
                aria-hidden
              />
              <input
                ref={menuSearchInputRef}
                type="search"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Search all categories…"
                className="h-10 w-full rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] py-2 pl-10 pr-[4.5rem] text-[13px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
                aria-label="Search menu in all categories"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                <kbd className="rounded-[4px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-kbd-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--pos-text-2)]">
                  /
                </kbd>
                <kbd className="hidden rounded-[4px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-kbd-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--pos-text-2)] sm:inline">
                  {typeof navigator !== "undefined" &&
                  navigator.platform?.toLowerCase().includes("mac")
                    ? "⌘K"
                    : "Ctrl+K"}
                </kbd>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {orderedMenuCategories.map((cat, i) => {
              const style = CATEGORY_STYLES[i % CATEGORY_STYLES.length];
              const on = cat.id === activeCategory;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setMenuSearch("");
                    setActiveCategory(cat.id);
                  }}
                  className={`flex min-h-[88px] min-w-[120px] flex-col justify-end rounded-[14px] p-4 text-left transition-[border-width,border-color] duration-150 ${
                    on
                      ? "border-[1.5px] border-solid [border-color:var(--pos-text-1)]"
                      : `${border0} hover:[border-color:var(--pos-border-strong)]`
                  }`}
                  style={{ backgroundColor: style.bg, color: style.text }}
                >
                  <span className="text-[13px] font-medium">{cat.name}</span>
                  <span
                    className="mt-1 text-[10px] font-normal opacity-70"
                    style={{ color: style.text }}
                  >
                    {cat.items.length} items
                  </span>
                </button>
              );
            })}
          </div>

          <div>
            <h2 className="mb-2 text-[13px] font-medium text-[var(--pos-text-2)]">
              {menuSearch.trim()
                ? "Search results (all categories)"
                : "Items in category"}
            </h2>
            {items.length === 0 ? (
              <p className="rounded-[12px] border border-dashed border-[var(--pos-border-medium)] bg-[var(--pos-card)]/50 px-4 py-8 text-center text-[13px] text-[var(--pos-text-2)]">
                {menuSearch.trim() ? (
                  <>
                    No items match &quot;{menuSearch.trim()}&quot;. Try different
                    letters or clear the search.
                  </>
                ) : (
                  <>No items in this category.</>
                )}
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {items.map((item) => {
                  const showCat =
                    menuSearch.trim().length > 0 && item.categoryName;
                  return (
                    <button
                      key={
                        menuSearch.trim()
                          ? `${item.categoryId}-${item.id}`
                          : item.id
                      }
                      type="button"
                      onClick={() => addItemToCart(item)}
                      className={`rounded-[12px] bg-[var(--pos-card)] px-4 py-[14px] text-left transition-colors hover:bg-[var(--pos-nav-hover)]/40 ${border0}`}
                    >
                      {showCat ? (
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
                          {item.categoryName}
                        </p>
                      ) : null}
                      <p className="text-[13px] font-medium text-[var(--pos-text-1)]">
                        {item.name}
                      </p>
                      <p className="mt-1 font-mono text-[13px] font-normal text-[var(--pos-text-2)]">
                        ${formatMoney(item.priceCents)}
                      </p>
                      <p className="mt-3 text-[11px] text-[var(--pos-text-2)]">
                        Sold today ·{" "}
                        <span className="font-mono">{item.soldToday}</span>
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    }

    const meta = findLeafMeta(activeLeafId);
    if (meta) {
      if (
        activeLeafId === "fd-cat" ||
        activeLeafId === "fd-items" ||
        activeLeafId === "fd-addon"
      ) {
        return (
          <FoodManagementPanel
            categories={menuCategories}
            setCategories={setMenuCategories}
            addonTemplates={addonTemplates}
            setAddonTemplates={setAddonTemplates}
            initialLeaf={activeLeafId}
          />
        );
      }
      return (
        <GenericModuleView
          title={meta.label}
          description="Demo module placeholder. Data below is sample only."
          icon={meta.icon}
          addon={meta.addon}
        />
      );
    }

    return <DashboardView />;
  };

  const orderRef = 1000 + tableNumber;

  return (
    <div className="flex h-full w-full flex-col bg-[var(--pos-page)] text-[var(--pos-text-3)]">
      <div className="relative flex min-h-0 flex-1">
        {!focusMode ? (
          <PosSidebar
            activeLeafId={activeLeafId}
            onSelectLeaf={setActiveLeafId}
            onSignOut={handleSignOut}
          />
        ) : null}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {focusMode ? (
            <button
              type="button"
              onClick={() => setFocusMode(false)}
              title="Show sidebar"
              className={`absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-[var(--pos-card)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--pos-text-1)] shadow-sm ${border0} transition-colors hover:bg-[var(--pos-nav-hover)]/50`}
            >
              <PanelLeftOpen className="size-3.5 shrink-0 opacity-80" aria-hidden />
              Exit focus
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setFocusMode(true)}
              title="Focus mode - hide sidebar"
              className={`absolute right-3 top-3 z-20 flex size-8 items-center justify-center rounded-full bg-[var(--pos-card)] text-[var(--pos-text-2)] shadow-sm ${border0} transition-colors hover:bg-[var(--pos-nav-hover)]/50 hover:text-[var(--pos-text-1)]`}
              aria-label="Enter focus mode"
            >
              <Focus className="size-3.5" strokeWidth={2} />
            </button>
          )}

          <div className="flex min-h-0 flex-1 gap-3 p-3 pt-12">
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {mainContent()}
            </main>

            {showOrderPanel ? (
              <aside
                ref={orderPanelRef}
                style={{ width: `${orderPanelWidth}px`, maxWidth: "100%" }}
                className={`relative flex min-h-0 shrink-0 flex-col rounded-[16px] bg-[var(--pos-card)] ${border0} [border-width:1px]`}
              >
                <button
                  type="button"
                  onMouseDown={startResizeOrderPanel}
                  className="absolute -left-1 top-0 h-full w-2 cursor-col-resize rounded-full bg-transparent"
                  aria-label="Resize order panel"
                  title="Drag to resize panel"
                />
                <div className="shrink-0 space-y-2 border-b border-solid [border-color:var(--pos-divider)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-2)]">
                        Table
                      </p>
                      <p className="mt-0.5 text-[15px] font-medium text-[var(--pos-text-1)]">
                        Table{" "}
                        <span className="font-mono tabular-nums">
                          {tableNumber}
                        </span>
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-[var(--pos-text-2)]">
                        #{orderRef} · demo
                      </p>
                    </div>
                  </div>
                  <div className={`rounded-[12px] bg-[var(--pos-page)] p-2.5 ${border0}`}>
                    <button
                      type="button"
                      onClick={() => setShowOrderDetails((v) => !v)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <span className="text-[12px] font-medium text-[var(--pos-text-1)]">
                        Guest & order details
                      </span>
                      <span className="text-[10px] text-[var(--pos-text-2)]">
                        {showOrderDetails ? "Hide" : "Add"}
                      </span>
                    </button>

                    {showOrderDetails ? (
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="block" aria-label="Select table">
                            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
                              Table
                            </span>
                            <select
                              value={tableNumber}
                              onChange={(e) => setTableNumber(Number(e.target.value))}
                              className="h-10 w-full rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[13px] font-mono text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
                            >
                              {DEMO_TABLES.map((n) => (
                                <option key={n} value={n}>
                                  Table {n}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div>
                          <p className="mb-1 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
                            <UserRound
                              className="size-3.5 shrink-0 text-[var(--pos-text-2)]"
                              strokeWidth={2}
                              aria-hidden
                            />
                            Customer
                          </p>
                          <input
                            type="text"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Customer name"
                            className="h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
                            aria-label="Customer name"
                          />
                          <input
                            type="tel"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="Phone number"
                            className="mt-2 h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
                            aria-label="Customer phone number"
                          />
                          <select
                            value={customerCategory}
                            onChange={(e) => setCustomerCategory(e.target.value)}
                            className="mt-2 h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
                            aria-label="Customer category"
                          >
                            <option value="regular">Regular</option>
                            <option value="vip">VIP</option>
                            <option value="corporate">Corporate</option>
                            <option value="online">Online</option>
                          </select>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-2)]">
                        Current order
                      </p>
                      <p className="font-mono text-[11px] text-[var(--pos-text-2)]">
                        {cart.length} line{cart.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--pos-border-medium)] [&::-webkit-scrollbar-track]:bg-transparent">
                    {cart.length === 0 ? (
                      <p className="rounded-[10px] border border-dashed border-[var(--pos-border-medium)] px-3 py-8 text-center text-[12px] text-[var(--pos-text-2)]">
                        Cart is empty — tap items on the left to add
                      </p>
                    ) : (
                      cart.map((row, idx) => {
                        const highlight = idx === selectedLine;
                        const lineTags = [
                          ...row.optionRows.map((o) => `${o.groupName}: ${o.choiceName}`),
                          ...row.suboptionRows.map((s) => `+${s.name}`),
                        ];
                        const visibleTags = lineTags.slice(0, 3);
                        const hiddenTagCount = Math.max(0, lineTags.length - visibleTags.length);
                        return (
                          <div
                            key={row.key}
                            className={`mb-2 flex w-full flex-col gap-2 rounded-[10px] border px-2.5 py-2 text-left text-[12px] transition-colors ${
                              highlight
                                ? "border-solid [border-color:var(--pos-text-1)] bg-[var(--pos-highlight-bg)] shadow-[inset_0_0_0_1px_var(--pos-text-1)]"
                                : "border-[var(--pos-border-hairline)] bg-[var(--pos-card)] hover:[border-color:var(--pos-border-medium)] hover:bg-[var(--pos-nav-hover)]/20"
                            }`}
                          >
                            <div className="flex w-full items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedLine(idx)}
                                className={`flex-1 text-left text-[12.5px] font-medium leading-snug ${
                                  highlight
                                    ? "text-[var(--pos-highlight-fg)]"
                                    : "text-[var(--pos-text-3)]"
                                }`}
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className={`inline-flex min-w-[1.1rem] items-center justify-center rounded-[5px] px-1 py-0.5 text-[9px] font-semibold ${
                                      highlight
                                        ? "bg-[var(--pos-highlight-fg)]/15 text-[var(--pos-highlight-fg)]"
                                        : "bg-[var(--pos-page)] text-[var(--pos-text-2)]"
                                    }`}
                                  >
                                    {idx + 1}
                                  </span>
                                  <span>{row.name}</span>
                                </span>
                              </button>
                              <span
                                className={`shrink-0 rounded-[7px] px-1.5 py-0.5 font-mono text-[11px] ${
                                  highlight
                                    ? "bg-[var(--pos-highlight-fg)]/10 text-[var(--pos-highlight-fg)]"
                                    : "bg-[var(--pos-page)] text-[var(--pos-text-2)]"
                                }`}
                              >
                                ${formatMoney(row.unitPriceCents * row.qty)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <p
                                className={`text-[10px] ${
                                  highlight
                                    ? "text-[var(--pos-highlight-fg)]/90"
                                    : "text-[var(--pos-text-2)]"
                                }`}
                              >
                                {row.qty} x ${formatMoney(row.unitPriceCents)}
                              </p>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setLineQty(idx, -1)}
                                  className="flex size-7 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)]"
                                  aria-label="Decrease quantity"
                                >
                                  <Minus className="size-3.5" strokeWidth={2} />
                                </button>
                                <span className="min-w-[1.75rem] text-center font-mono text-[13px] text-[var(--pos-text-1)]">
                                  {row.qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setLineQty(idx, 1)}
                                  className="flex size-7 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)]"
                                  aria-label="Increase quantity"
                                >
                                  <Plus className="size-3.5" strokeWidth={2} />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => openEditModalForLine(idx)}
                                className="inline-flex h-7 items-center gap-1 rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-2 text-[10px] font-medium text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)]"
                              >
                                <SlidersHorizontal className="size-3" strokeWidth={2} />
                                Modify
                              </button>
                            </div>

                            {lineTags.length > 0 ? (
                              <div className="flex flex-wrap gap-1 border-t border-dashed [border-color:var(--pos-border-hairline)] pt-1.5">
                                {visibleTags.map((tag) => (
                                  <span
                                    key={`${row.key}-${tag}`}
                                    className={`inline-flex items-center rounded-full border border-solid px-2 py-0.5 text-[10px] ${
                                      highlight
                                        ? "border-[var(--pos-highlight-fg)] text-[var(--pos-highlight-fg)]"
                                        : "border-[var(--pos-border-medium)] text-[var(--pos-text-2)]"
                                    }`}
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {hiddenTagCount > 0 ? (
                                  <span
                                    key={`${row.key}-more-tags`}
                                    className={`inline-flex items-center rounded-full border border-solid px-2 py-0.5 text-[10px] ${
                                      highlight
                                        ? "border-[var(--pos-highlight-fg)] text-[var(--pos-highlight-fg)]"
                                        : "border-[var(--pos-border-medium)] text-[var(--pos-text-2)]"
                                    }`}
                                  >
                                    +{hiddenTagCount} more
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {cart.length > 0 && activeLine && selectedCatalogItem ? (
                    <div className="shrink-0 border-t border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)]/40 px-3 py-2">
                      <p className="text-[11px] text-[var(--pos-text-2)]">
                        Selected:{" "}
                        <span className="font-medium text-[var(--pos-text-1)]">
                          {activeLine.name}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--pos-text-2)]">
                        Use <span className="font-medium">Modify</span> to change options/add-ons.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 space-y-3 border-t border-solid [border-color:var(--pos-divider)] p-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[12px] text-[var(--pos-text-2)]">
                      <span>Subtotal</span>
                      <span className="font-mono">${formatMoney(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-[12px] text-[var(--pos-text-2)]">
                      <span>Tax</span>
                      <span className="font-mono">${formatMoney(tax)}</span>
                    </div>
                    <div className="flex justify-between border-t border-solid [border-color:var(--pos-border-hairline)] pt-2 text-[15px] font-semibold text-[var(--pos-text-1)]">
                      <span>Total</span>
                      <span className="font-mono">${formatMoney(total)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setCart([])}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-[var(--pos-primary-bg)] px-4 text-[13px] font-semibold text-[var(--pos-primary-fg)] shadow-sm transition-colors hover:bg-[var(--pos-primary-hover)]"
                    >
                      <Send className="size-4 shrink-0 opacity-90" strokeWidth={2} />
                      Place order
                    </button>
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-[11px] border-[1.5px] border-solid border-[#e8472a] bg-transparent px-4 text-[13px] font-semibold text-[#e8472a] transition-colors hover:bg-[#e8472a]/10"
                    >
                      <Flame className="size-4 shrink-0" strokeWidth={2} />
                      Fire to kitchen
                    </button>
                  </div>
                </div>
              </aside>
            ) : null}
          </div>
        </div>
      </div>

      {editModalOpen && editingLine && editingCatalogItem && editDraftConfig ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Modify order line"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditModalOpen(false);
              setEditingLineIndex(null);
            }
          }}
        >
          <div
            className={`max-h-[min(88vh,760px)] w-full max-w-[460px] overflow-y-auto rounded-[20px] bg-[var(--pos-card)] p-5 ${border0} [border-width:1.5px] [border-color:var(--pos-border-strong)]`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-2)]">
                  Modify order line
                </p>
                <h3 className="mt-1 text-[16px] font-medium text-[var(--pos-text-1)]">
                  {editingLine.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingLineIndex(null);
                }}
                className="flex size-8 items-center justify-center rounded-[10px] border border-solid [border-color:var(--pos-border-medium)] text-[var(--pos-text-1)] hover:[border-color:var(--pos-text-1)]"
                aria-label="Close"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </div>

            <div className="mt-4">
              <ItemOptionsBody
                item={editingCatalogItem}
                value={editDraftConfig}
                onChange={setEditDraftConfig}
                dense
              />
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-solid [border-color:var(--pos-divider)] pt-4">
              <p className="text-[12px] text-[var(--pos-text-2)]">
                Unit price preview
              </p>
              <p className="font-mono text-[14px] font-medium text-[var(--pos-text-1)]">
                ${formatMoney(computeLineUnitPrice(editingCatalogItem, editDraftConfig))}
              </p>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingLineIndex(null);
                }}
                className="flex h-10 flex-1 items-center justify-center rounded-[10px] border-[1.5px] border-solid [border-color:var(--pos-input-border)] bg-transparent text-[13px] font-medium text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-border-strong)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyEditModal}
                className="flex h-10 flex-1 items-center justify-center rounded-[10px] bg-[var(--pos-primary-bg)] text-[13px] font-medium text-[var(--pos-primary-fg)] transition-colors hover:bg-[var(--pos-primary-hover)]"
              >
                Apply changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
