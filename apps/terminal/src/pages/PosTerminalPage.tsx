import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CircleDollarSign,
  Minus,
  NotebookPen,
  Plus,
  Printer,
  Receipt,
  Search,
  Send,
  Pencil,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useSession } from "@/features/auth";
import { MENU_VIEW_IDS, findLeafMeta } from "../data/posNav";
import {
  resolveInitialLeafId,
  writeStoredLastLeafId,
} from "../posSectionStorage";
import {
  buildOrderLineDisplay,
  computeLineUnitPrice,
  defaultOrderLineConfig,
  useMenuCatalog,
  type CatalogItem,
  type OrderLineConfig,
} from "@/features/menu";
import { createOrderOnApi, holdOrderOnApi } from "@/features/orders";
import { processPaymentOnApi } from "@/features/payments/paymentsApi";
import { StorageImage } from "@/features/storage";
import { PosSidebar } from "../components/pos/PosSidebar";
import { OrdersManageView } from "../components/pos/OrdersManageView";
import { GenericModuleView } from "../components/pos/GenericModuleView";
import {
  HR_LEAF_IDS,
  EmployeeModuleView,
} from "../components/pos/EmployeeModuleView";
import {
  LEDGER_LEAF_IDS,
  LedgerModuleView,
} from "../components/pos/LedgerModuleView";
import { ItemOptionsBody } from "../components/pos/ItemOptionsModal";
import { DailyEntryFormView } from "../components/pos/DailyEntryFormView";
import {
  REPORT_LEAF_IDS,
  ReportsModuleView,
} from "../components/pos/ReportsModuleView";
import { FoodManagementPanel } from "../components/pos/FoodManagementPanel";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

const FOOD_MANAGEMENT_LEAF_IDS = new Set([
  "menu-mgmt",
  "fd-menu",
  "fd-cat",
  "fd-items",
  "fd-addon",
]);

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
  /** Free-text note for kitchen / receipt (per line). */
  note?: string;
  /** Percent off this line only (0–100). */
  lineDiscountPercent?: number;
};

function lineGrossCents(l: CartLine) {
  return l.unitPriceCents * l.qty;
}

function lineDiscountCents(l: CartLine) {
  const p = l.lineDiscountPercent ?? 0;
  if (p <= 0) return 0;
  const clamped = Math.min(100, p);
  return Math.round(lineGrossCents(l) * (clamped / 100));
}

function lineNetCents(l: CartLine) {
  return lineGrossCents(l) - lineDiscountCents(l);
}

function newLineKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatMoney(cents: number) {
  return (cents / 100).toFixed(2);
}

function formatDiscountPercentLabel(p: number) {
  const clamped = Math.min(100, Math.max(0, p));
  if (clamped % 1 === 0) return String(clamped);
  return clamped.toFixed(2).replace(/\.?0+$/, "");
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
    lineDiscountPercent: 0,
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
  const { signOut } = useSession();
  const {
    categories: menuCategories,
    setCategories: setMenuCategories,
    loading: menuLoading,
    error: menuError,
    refresh: refreshMenuCatalog,
  } = useMenuCatalog();
  const orderedMenuCategories = useMemo(
    () => [...menuCategories].sort((a, b) => a.name.localeCompare(b.name)),
    [menuCategories],
  );
  const [activeLeafId, setActiveLeafId] = useState(resolveInitialLeafId);
  const [activeCategory, setActiveCategory] = useState(
    orderedMenuCategories[0]?.id ?? "appetizer",
  );
  const [menuSearch, setMenuSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedLine, setSelectedLine] = useState(-1);
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
  const [lineNoteModalIndex, setLineNoteModalIndex] = useState<number | null>(
    null,
  );
  const [lineNoteDraft, setLineNoteDraft] = useState("");
  const [lineDiscountModalIndex, setLineDiscountModalIndex] = useState<
    number | null
  >(null);
  const [lineDiscountDraft, setLineDiscountDraft] = useState("");
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const [miscModalOpen, setMiscModalOpen] = useState(false);
  const [miscName, setMiscName] = useState("");
  const [miscPrice, setMiscPrice] = useState("");
  const menuSearchInputRef = useRef<HTMLInputElement>(null);
  const orderPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!checkoutNotice) return;
    const t = window.setTimeout(() => setCheckoutNotice(""), 2200);
    return () => window.clearTimeout(t);
  }, [checkoutNotice]);

  useEffect(() => {
    const onNav = (ev: Event) => {
      const detail = (ev as CustomEvent<{ leafId?: string }>).detail;
      if (detail?.leafId) setActiveLeafId(detail.leafId);
    };
    window.addEventListener("pos-select-leaf", onNav);
    return () => window.removeEventListener("pos-select-leaf", onNav);
  }, []);

  useEffect(() => {
    writeStoredLastLeafId(activeLeafId);
  }, [activeLeafId]);

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

  const grossSubtotal = useMemo(
    () => cart.reduce((s, l) => s + lineGrossCents(l), 0),
    [cart],
  );
  const itemCount = useMemo(
    () => cart.reduce((s, l) => s + l.qty, 0),
    [cart],
  );
  const discount = useMemo(
    () => cart.reduce((s, l) => s + lineDiscountCents(l), 0),
    [cart],
  );
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);
  const subtotalAfterLineDiscounts = Math.max(0, grossSubtotal - discount);
  const service = serviceChargeEnabled
    ? Math.round(subtotalAfterLineDiscounts * 0.1)
    : 0;
  const tax = Math.round(
    Math.max(0, subtotalAfterLineDiscounts + service) * 0.0825,
  );
  const total = Math.max(0, subtotalAfterLineDiscounts + service + tax);

  useEffect(() => {
    setSelectedLine((i) => {
      if (cart.length === 0) return -1;
      if (i < 0) return -1;
      return Math.min(i, Math.max(0, cart.length - 1));
    });
  }, [cart.length]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-cart-line-card]")) return;
      setSelectedLine(-1);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

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

  const openLineDiscountModal = (idx: number) => {
    const line = cart[idx];
    if (!line) return;
    setSelectedLine(idx);
    const p = line.lineDiscountPercent ?? 0;
    setLineDiscountDraft(p > 0 ? String(p) : "");
    setLineDiscountModalIndex(idx);
  };

  const saveLineDiscount = () => {
    if (lineDiscountModalIndex === null) return;
    const idx = lineDiscountModalIndex;
    const raw = lineDiscountDraft.trim().replace(",", ".");
    let pct = 0;
    if (raw.length > 0) {
      const n = Number.parseFloat(raw);
      if (Number.isFinite(n)) {
        pct = Math.min(100, Math.max(0, n));
      }
    }
    setCart((c) =>
      c.map((l, i) =>
        i === idx
          ? {
              ...l,
              lineDiscountPercent: pct > 0 ? pct : undefined,
            }
          : l,
      ),
    );
    setLineDiscountModalIndex(null);
  };

  const removeLineAt = (idx: number) => {
    setCart((c) => c.filter((_, i) => i !== idx));
  };

  const openLineNoteModal = (idx: number) => {
    const line = cart[idx];
    if (!line) return;
    setSelectedLine(idx);
    setLineNoteDraft(line.note ?? "");
    setLineNoteModalIndex(idx);
  };

  const saveLineNote = () => {
    if (lineNoteModalIndex === null) return;
    const idx = lineNoteModalIndex;
    const text = lineNoteDraft.trim();
    setCart((c) =>
      c.map((l, i) =>
        i === idx ? { ...l, note: text.length > 0 ? text : undefined } : l,
      ),
    );
    setLineNoteModalIndex(null);
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

  const clearOrder = () => {
    setCart([]);
    setSelectedLine(-1);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerCategory("regular");
    setShowOrderDetails(false);
  };

  const addMiscLine = () => {
    const name = miscName.trim();
    const raw = miscPrice.trim().replace(",", ".");
    const parsed = Number.parseFloat(raw);
    if (!name) {
      setCheckoutNotice("Enter a misc item name.");
      return;
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setCheckoutNotice("Enter a valid misc price.");
      return;
    }
    const unitPriceCents = Math.round(parsed * 100);
    const line: CartLine = {
      key: newLineKey(),
      itemId: `misc-${Date.now()}`,
      name,
      qty: 1,
      unitPriceCents,
      variantSummary: "",
      optionRows: [],
      suboptionRows: [],
      lineConfig: { variantChoiceIds: {}, addonIds: [] },
      lineDiscountPercent: 0,
    };
    setCart((c) => [...c, line]);
    setSelectedLine(cart.length);
    setMiscName("");
    setMiscPrice("");
    setMiscModalOpen(false);
    setCheckoutNotice("Misc item added.");
  };

  const handlePrintOrder = () => {
    if (cart.length === 0) {
      setCheckoutNotice("Add items before printing.");
      return;
    }
    window.print();
    setCheckoutNotice("Print dialog opened.");
  };

  const handleNoSale = () => {
    setCheckoutNotice("No-sale recorded for this terminal.");
  };

  const submitCartToApi = async (mode: "hold" | "pay") => {
    if (cart.length === 0) {
      setCheckoutNotice("Cart is empty.");
      return;
    }
    const apiItems = cart
      .filter((line) => !line.itemId.startsWith("misc-"))
      .map((line) => ({
        menuItemId: line.itemId,
        quantity: line.qty,
        modifiers: { lineConfig: line.lineConfig },
        notes: line.note,
      }));
    if (apiItems.length === 0) {
      setCheckoutNotice("Misc-only carts cannot sync — add menu items.");
      return;
    }
    try {
      const order = await createOrderOnApi({
        tableNumber: String(tableNumber),
        items: apiItems,
      });
      if (mode === "hold") {
        await holdOrderOnApi(order.id);
        clearOrder();
        setCheckoutNotice("Order placed on hold.");
        return;
      }
      const amount =
        cart.reduce((sum, line) => sum + lineNetCents(line), 0) / 100;
      await processPaymentOnApi({
        orderId: order.id,
        method: "CASH",
        amount,
      });
      clearOrder();
      setCheckoutNotice("Payment completed.");
    } catch (e) {
      setCheckoutNotice(
        e instanceof Error ? e.message : "Could not save order.",
      );
    }
  };

  const handleHold = () => {
    void submitCartToApi("hold");
  };

  const handlePay = () => {
    void submitCartToApi("pay");
  };

  const showOrderPanel = showMenuSurface;

  const mainContent = () => {
    if (activeLeafId === "mo-list") {
      return <OrdersManageView defaultFilter="all" />;
    }

    if (showMenuSurface) {
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[15px] font-medium text-[var(--pos-text-1)]">
                Menu / POS
              </h1>
              {menuLoading ? (
                <p className="mt-1 text-[12px] text-[var(--pos-text-2)]">Loading menu…</p>
              ) : menuError ? (
                <p className="mt-1 text-[12px] text-red-600" role="alert">
                  {menuError}
                </p>
              ) : menuCategories.length === 0 ? (
                <p className="mt-1 text-[12px] text-[var(--pos-text-2)]">
                  No menu items yet — add items in Food management or run{" "}
                  <span className="font-mono">npm run db:seed</span>.
                </p>
              ) : null}
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
                      className={`overflow-hidden rounded-[12px] bg-[var(--pos-card)] text-left transition-colors hover:bg-[var(--pos-nav-hover)]/40 ${border0}`}
                    >
                      {item.imageRef ? (
                        <StorageImage
                          mediaRef={item.imageRef}
                          alt={item.name}
                          className="aspect-[16/10] w-full object-cover"
                          placeholderClassName="flex aspect-[16/10] w-full items-center justify-center bg-[var(--pos-page)] text-[10px] text-[var(--pos-text-2)]"
                        />
                      ) : null}
                      <div className="px-4 py-[14px]">
                      {showCat ? (
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
                          {item.categoryName}
                        </p>
                      ) : null}
                      <p className="text-[13px] font-medium text-[var(--pos-text-1)]">
                        {item.name}
                      </p>
                      <p className="mt-1 font-mono text-[13px] font-normal text-[var(--pos-text-2)]">
                        ৳{formatMoney(item.priceCents)}
                      </p>
                      <p className="mt-3 text-[11px] text-[var(--pos-text-2)]">
                        Sold today ·{" "}
                        <span className="font-mono">{item.soldToday}</span>
                      </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (LEDGER_LEAF_IDS.has(activeLeafId)) {
      return <LedgerModuleView leafId={activeLeafId} />;
    }
    if (HR_LEAF_IDS.has(activeLeafId)) {
      return <EmployeeModuleView />;
    }

    if (activeLeafId === "exp-daily") {
      return <DailyEntryFormView />;
    }
    if (REPORT_LEAF_IDS.has(activeLeafId)) {
      return <ReportsModuleView leafId={activeLeafId} />;
    }

    if (FOOD_MANAGEMENT_LEAF_IDS.has(activeLeafId)) {
      return (
        <FoodManagementPanel
          categories={menuCategories}
          setCategories={setMenuCategories}
          onMenuRefresh={refreshMenuCatalog}
        />
      );
    }

    const meta = findLeafMeta(activeLeafId);
    if (meta) {
      return (
        <GenericModuleView
          title={meta.label}
          icon={meta.icon}
          addon={meta.addon}
        />
      );
    }

    return <DailyEntryFormView />;
  };

  const orderRef = 1000 + tableNumber;

  return (
    <div className="flex h-full w-full flex-col bg-[var(--pos-page)] text-[var(--pos-text-3)]">
      <div className="relative flex min-h-0 flex-1">
        <PosSidebar
          activeLeafId={activeLeafId}
          onSelectLeaf={setActiveLeafId}
          onSignOut={handleSignOut}
        />

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3 pt-2">
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
                <div className="shrink-0 space-y-1.5 border-b border-solid [border-color:var(--pos-divider)] px-2.5 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
                        Table
                      </span>
                      <span className="font-mono text-[14px] font-medium tabular-nums text-[var(--pos-text-1)]">
                        {tableNumber}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--pos-text-2)]">
                        #{orderRef}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--pos-text-2)]">
                      {cart.length} line{cart.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className={`rounded-[10px] bg-[var(--pos-page)] p-2 ${border0}`}>
                    <button
                      type="button"
                      onClick={() => setShowOrderDetails((v) => !v)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <span className="text-[11px] font-medium text-[var(--pos-text-1)]">
                        Guest & order details
                      </span>
                      <span className="text-[10px] text-[var(--pos-text-2)]">
                        {showOrderDetails ? "Hide" : "Add"}
                      </span>
                    </button>

                    {showOrderDetails ? (
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="block" aria-label="Select table">
                            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
                              Table
                            </span>
                            <select
                              value={tableNumber}
                              onChange={(e) => setTableNumber(Number(e.target.value))}
                              className="h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 text-[12px] font-mono text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
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
                  <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-2.5 py-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-2)]">
                      Current order
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
                    {cart.length === 0 ? (
                      <p className="rounded-[10px] border border-dashed border-[var(--pos-border-medium)] px-3 py-8 text-center text-[12px] text-[var(--pos-text-2)]">
                        Cart is empty — tap items on the left to add
                      </p>
                    ) : (
                      cart.map((row, idx) => {
                        const highlight = idx === selectedLine;
                        const lineCatalogItem = menuCategories
                          .flatMap((c) => c.items)
                          .find((it) => it.id === row.itemId);
                        const lineTags = [
                          ...row.optionRows.map((o) => `${o.groupName}: ${o.choiceName}`),
                          ...row.suboptionRows.map((s) => `+${s.name}`),
                        ];
                        const compactTags = [
                          ...row.suboptionRows.map((s) => `+${s.name}`),
                          ...(row.note ? [`Note: ${row.note}`] : []),
                        ];
                        const shownTags = (highlight ? lineTags : compactTags).slice(
                          0,
                          highlight ? 3 : 1,
                        );
                        const hiddenTagCount = Math.max(
                          0,
                          (highlight ? lineTags : compactTags).length - shownTags.length,
                        );
                        const lineHasAddons =
                          (lineCatalogItem?.addons.length ?? 0) > 0;
                        const addonIds = row.lineConfig.addonIds;
                        const addonNamesSummary =
                          addonIds.length > 0 && lineCatalogItem
                            ? addonIds
                                .map(
                                  (id) =>
                                    lineCatalogItem.addons.find((a) => a.id === id)
                                      ?.name,
                                )
                                .filter((n): n is string => Boolean(n))
                                .join(", ")
                            : "";
                        const lineDisc = lineDiscountCents(row);
                        const lineNet = lineNetCents(row);
                        const lineDiscPct = row.lineDiscountPercent ?? 0;
                        return (
                          <div
                            key={row.key}
                            data-cart-line-card
                            className={`mb-1.5 flex w-full flex-col rounded-[9px] border px-2 text-left text-[12px] transition-colors ${
                              highlight
                                ? "gap-1 py-1.5 border-solid [border-color:var(--pos-text-1)] bg-[var(--pos-highlight-bg)] shadow-[inset_0_0_0_1px_var(--pos-text-1)]"
                                : "gap-0.5 py-1 border-[var(--pos-border-hairline)] bg-[var(--pos-card)] hover:[border-color:var(--pos-border-medium)] hover:bg-[var(--pos-nav-hover)]/20"
                            }`}
                          >
                            <div className="flex w-full min-w-0 items-start gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedLine(idx)}
                                className={`min-w-0 flex-1 text-left ${
                                  highlight
                                    ? "text-[var(--pos-highlight-fg)]"
                                    : "text-[var(--pos-text-3)]"
                                }`}
                              >
                                <div className="flex items-start gap-1.5">
                                  <span
                                    className={`mt-0.5 inline-flex min-w-[1rem] shrink-0 items-center justify-center rounded-[4px] px-0.5 py-0.5 text-[8px] font-semibold leading-none ${
                                      highlight
                                        ? "bg-[var(--pos-highlight-fg)]/15 text-[var(--pos-highlight-fg)]"
                                        : "bg-[var(--pos-page)] text-[var(--pos-text-2)]"
                                    }`}
                                  >
                                    {idx + 1}
                                  </span>
                                  <div className="min-w-0 flex flex-1 items-center gap-1.5 overflow-hidden">
                                    <p className="min-w-0 shrink truncate text-[12px] font-medium leading-tight">
                                      {row.name}
                                    </p>
                                    <div className="flex min-w-0 shrink items-center gap-0.5 overflow-hidden">
                                      {shownTags.map((tag) => (
                                        <span
                                          key={`${row.key}-${tag}`}
                                          className={`inline-flex max-w-full items-center truncate rounded-full border border-solid px-1.5 py-px text-[9px] ${
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
                                          className={`inline-flex items-center rounded-full border border-solid px-1.5 py-px text-[9px] ${
                                            highlight
                                              ? "border-[var(--pos-highlight-fg)] text-[var(--pos-highlight-fg)]"
                                              : "border-[var(--pos-border-medium)] text-[var(--pos-text-2)]"
                                          }`}
                                        >
                                          +{hiddenTagCount}
                                        </span>
                                      ) : null}
                                      {highlight && lineHasAddons ? (
                                        <button
                                          type="button"
                                          onClick={() => openEditModalForLine(idx)}
                                          className={`inline-flex max-w-full items-center truncate rounded-full border border-solid px-1.5 py-px text-[9px] italic ${
                                            highlight
                                              ? "border-[var(--pos-highlight-fg)] text-[var(--pos-highlight-fg)]"
                                              : "border-[var(--pos-border-medium)] text-[var(--pos-text-2)]"
                                          }`}
                                          title={
                                            addonNamesSummary ? addonNamesSummary : "Add add-ons"
                                          }
                                          aria-label="Add or edit add-ons for this line"
                                        >
                                          {addonIds.length > 0 ? "Edit addon" : "+ Add addons"}
                                        </button>
                                      ) : null}
                                      {highlight ? (
                                        <button
                                          type="button"
                                          onClick={() => openLineNoteModal(idx)}
                                          className={`inline-flex max-w-full items-center truncate rounded-full border border-solid px-1.5 py-px text-[9px] italic ${
                                            highlight
                                              ? "border-[var(--pos-highlight-fg)] text-[var(--pos-highlight-fg)]"
                                              : "border-[var(--pos-border-medium)] text-[var(--pos-text-2)]"
                                          }`}
                                          title={row.note ? row.note : "Add note"}
                                          aria-label="Add or edit note for this line"
                                        >
                                          {row.note ? `Note: ${row.note}` : "+ Add note"}
                                        </button>
                                      ) : null}
                                    </div>
                                    {!highlight ? (
                                      <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--pos-text-2)]">
                                        {row.qty} × ৳{formatMoney(row.unitPriceCents)}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </button>
                            </div>

                            {highlight ? (
                              <div
                                className="flex min-h-[32px] items-center gap-1 rounded-[8px] bg-[var(--pos-highlight-fg)]/8 px-1 py-0.5"
                              >
                              <div className="flex min-w-0 flex-1 items-center gap-1">
                                <button
                                  type="button"
                                  title="Note"
                                  onClick={() => openLineNoteModal(idx)}
                                  className={`flex size-8 shrink-0 items-center justify-center rounded-[7px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)] ${
                                    row.note ? "ring-1 ring-[var(--pos-primary-bg)]/45" : ""
                                  }`}
                                  aria-label="Note for this line"
                                >
                                  <NotebookPen className="size-3.5" strokeWidth={2} />
                                </button>
                                <button
                                  type="button"
                                  title="Discount"
                                  onClick={() => openLineDiscountModal(idx)}
                                  className={`flex size-8 shrink-0 items-center justify-center rounded-[7px] border border-solid transition-colors ${
                                    (row.lineDiscountPercent ?? 0) > 0
                                      ? "border-[var(--pos-primary-bg)] bg-[var(--pos-primary-bg)]/12 text-[var(--pos-primary-bg)]"
                                      : "[border-color:var(--pos-border-medium)] bg-[var(--pos-card)] text-[var(--pos-text-1)] hover:[border-color:var(--pos-text-1)]"
                                  }`}
                                  aria-label="Set discount for this line"
                                >
                                  <Tag className="size-3.5" strokeWidth={2} />
                                </button>
                              </div>
                              <div className="mx-0.5 flex h-8 items-center justify-center gap-0.5 rounded-[7px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-0.5">
                                <button
                                  type="button"
                                  onClick={() => setLineQty(idx, -1)}
                                  className="flex size-7 shrink-0 items-center justify-center rounded-full border border-solid [border-color:var(--pos-border-medium)] text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)]"
                                  aria-label="Decrease quantity"
                                >
                                  <Minus className="size-3" strokeWidth={2} />
                                </button>
                                <span className="min-w-[1.25rem] text-center font-mono text-[11px] text-[var(--pos-text-1)]">
                                  {row.qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setLineQty(idx, 1)}
                                  className="flex size-7 shrink-0 items-center justify-center rounded-full border border-solid [border-color:var(--pos-border-medium)] text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)]"
                                  aria-label="Increase quantity"
                                >
                                  <Plus className="size-3" strokeWidth={2} />
                                </button>
                              </div>
                              <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
                                <button
                                  type="button"
                                  title="Remove line"
                                  onClick={() => removeLineAt(idx)}
                                  className="flex size-8 shrink-0 items-center justify-center rounded-[7px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)]"
                                  aria-label="Delete this line"
                                >
                                  <Trash2 className="size-3.5" strokeWidth={2} />
                                </button>
                                <button
                                  type="button"
                                  title="Modify options"
                                  onClick={() => openEditModalForLine(idx)}
                                  className="flex size-8 shrink-0 items-center justify-center rounded-[7px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)]"
                                  aria-label="Modify options for this line"
                                >
                                  <Pencil className="size-3.5" strokeWidth={2} />
                                </button>
                              </div>
                              </div>
                            ) : null}

                            {highlight ? (
                              <div className="flex items-center justify-end border-t border-dashed [border-color:var(--pos-border-hairline)] pt-1">
                              <p
                                className={`font-mono text-[10px] ${
                                  highlight
                                    ? "text-[var(--pos-highlight-fg)]/90"
                                    : "text-[var(--pos-text-2)]"
                                }`}
                              >
                                {row.qty} × ৳{formatMoney(row.unitPriceCents)} (৳{formatMoney(lineNet)})
                                {lineDiscPct > 0 && lineDisc > 0
                                  ? ` · −${formatDiscountPercentLabel(lineDiscPct)}%`
                                  : ""}
                              </p>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="shrink-0 space-y-2 border-t border-solid [border-color:var(--pos-divider)] px-2.5 py-2">
                  <div className="grid grid-cols-2 gap-x-5 gap-y-1">
                    <div className="flex justify-between text-[11px] text-[var(--pos-text-2)]">
                      <span>Items</span>
                      <span className="font-mono tabular-nums">{itemCount}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-[var(--pos-text-2)]">
                      <span>Subtotal</span>
                      <span className="font-mono tabular-nums">
                        ৳{formatMoney(grossSubtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-[var(--pos-text-2)]">
                      <span>Total discount</span>
                      <span className="font-mono tabular-nums">
                        −৳{formatMoney(discount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--pos-text-2)]">
                      <span className="inline-flex items-center gap-1.5">
                        Service
                        <button
                          type="button"
                          role="switch"
                          aria-checked={serviceChargeEnabled}
                          onClick={() => setServiceChargeEnabled((v) => !v)}
                          className={`relative inline-flex h-[18px] w-8 items-center rounded-full transition-colors ${
                            serviceChargeEnabled
                              ? "bg-[var(--pos-primary-bg)]"
                              : "bg-[var(--pos-border-medium)]"
                          }`}
                        >
                          <span
                            className={`inline-block size-3.5 transform rounded-full bg-white transition-transform ${
                              serviceChargeEnabled ? "translate-x-[15px]" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </span>
                      <span className="font-mono tabular-nums">৳{formatMoney(service)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-[var(--pos-text-2)]">
                      <span>Tax</span>
                      <span className="font-mono tabular-nums">৳{formatMoney(tax)}</span>
                    </div>
                    <div className="flex justify-between border-t border-solid [border-color:var(--pos-border-hairline)] pt-1 text-[11px] font-semibold text-[var(--pos-accent)]">
                      <span>Due</span>
                      <span className="font-mono tabular-nums">৳{formatMoney(total)}</span>
                    </div>
                    <div className="col-span-2 flex justify-between border-t border-solid [border-color:var(--pos-border-hairline)] pt-1 text-[14px] font-semibold text-[var(--pos-text-1)]">
                      <span>Total</span>
                      <span className="font-mono tabular-nums">৳{formatMoney(total)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      title="Misc product"
                      onClick={() => setMiscModalOpen(true)}
                      className="flex h-9 flex-col items-center justify-center gap-0.5 rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-1 text-[9px] font-medium leading-tight text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)]"
                    >
                      <Receipt className="size-3.5 shrink-0" strokeWidth={2} />
                      Misc
                    </button>
                    <button
                      type="button"
                      title="Print"
                      onClick={handlePrintOrder}
                      className="flex h-9 flex-col items-center justify-center gap-0.5 rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-1 text-[9px] font-medium leading-tight text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)]"
                    >
                      <Printer className="size-3.5 shrink-0" strokeWidth={2} />
                      Print
                    </button>
                    <button
                      type="button"
                      title="No sale"
                      onClick={handleNoSale}
                      className="flex h-9 flex-col items-center justify-center gap-0.5 rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-1 text-[9px] font-medium leading-tight text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)]"
                    >
                      <CircleDollarSign className="size-3.5 shrink-0" strokeWidth={2} />
                      No sale
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        clearOrder();
                        setCheckoutNotice("Order cleared.");
                      }}
                      className="flex h-10 items-center justify-center rounded-[10px] bg-[#ef5350] px-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#dc3f3c]"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={handleHold}
                      className="flex h-10 items-center justify-center gap-1 rounded-[10px] bg-[var(--pos-primary-bg)] px-2 text-[11px] font-semibold text-[var(--pos-primary-fg)] transition-colors hover:bg-[var(--pos-primary-hover)]"
                    >
                      <Send className="size-3 shrink-0" strokeWidth={2} />
                      Hold
                    </button>
                    <button
                      type="button"
                      onClick={handlePay}
                      className="flex h-10 items-center justify-center rounded-[10px] bg-[#3dbf52] px-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#2ca340]"
                    >
                      Pay
                    </button>
                  </div>
                  <p
                    className={`min-h-[14px] text-center text-[10px] ${
                      checkoutNotice
                        ? "text-[var(--pos-text-2)]"
                        : "text-transparent"
                    }`}
                    aria-live="polite"
                  >
                    {checkoutNotice || "."}
                  </p>
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
                ৳{formatMoney(computeLineUnitPrice(editingCatalogItem, editDraftConfig))}
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

      {lineDiscountModalIndex !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Discount"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLineDiscountModalIndex(null);
          }}
        >
          <div
            className={`w-full max-w-[400px] rounded-[20px] bg-[var(--pos-card)] p-5 ${border0} [border-width:1.5px] [border-color:var(--pos-border-strong)]`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-2)]">
                  Discount
                </p>
                <h3 className="mt-1 text-[15px] font-medium text-[var(--pos-text-1)]">
                  {cart[lineDiscountModalIndex]?.name ?? "Item"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLineDiscountModalIndex(null)}
                className="flex size-8 items-center justify-center rounded-[10px] border border-solid [border-color:var(--pos-border-medium)] text-[var(--pos-text-1)] hover:[border-color:var(--pos-text-1)]"
                aria-label="Close"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </div>
            <p className="mt-2 text-[12px] text-[var(--pos-text-2)]">
              Enter percent off this line (0–100%). Leave empty or 0 to remove.
            </p>
            <label className="mt-4 block text-[11px] font-medium text-[var(--pos-text-2)]">
              Percent off
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="any"
                value={lineDiscountDraft}
                onChange={(e) => setLineDiscountDraft(e.target.value)}
                placeholder="e.g. 15 or 12.5"
                className="mt-1.5 h-11 w-full rounded-[12px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[15px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
                aria-label="Discount percent for this line"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setLineDiscountModalIndex(null)}
                className="flex h-10 flex-1 items-center justify-center rounded-[10px] border-[1.5px] border-solid [border-color:var(--pos-input-border)] bg-transparent text-[13px] font-medium text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-border-strong)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveLineDiscount}
                className="flex h-10 flex-1 items-center justify-center rounded-[10px] bg-[var(--pos-primary-bg)] text-[13px] font-medium text-[var(--pos-primary-fg)] transition-colors hover:bg-[var(--pos-primary-hover)]"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lineNoteModalIndex !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Line note"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLineNoteModalIndex(null);
          }}
        >
          <div
            className={`w-full max-w-[400px] rounded-[20px] bg-[var(--pos-card)] p-5 ${border0} [border-width:1.5px] [border-color:var(--pos-border-strong)]`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-2)]">
                  Line note
                </p>
                <h3 className="mt-1 text-[15px] font-medium text-[var(--pos-text-1)]">
                  {cart[lineNoteModalIndex]?.name ?? "Item"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLineNoteModalIndex(null)}
                className="flex size-8 items-center justify-center rounded-[10px] border border-solid [border-color:var(--pos-border-medium)] text-[var(--pos-text-1)] hover:[border-color:var(--pos-text-1)]"
                aria-label="Close"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </div>
            <textarea
              value={lineNoteDraft}
              onChange={(e) => setLineNoteDraft(e.target.value)}
              rows={4}
              placeholder="e.g. No onions, extra sauce…"
              className="mt-4 w-full resize-y rounded-[12px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 py-2.5 text-[13px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
              aria-label="Note for this line"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setLineNoteModalIndex(null)}
                className="flex h-10 flex-1 items-center justify-center rounded-[10px] border-[1.5px] border-solid [border-color:var(--pos-input-border)] bg-transparent text-[13px] font-medium text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-border-strong)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveLineNote}
                className="flex h-10 flex-1 items-center justify-center rounded-[10px] bg-[var(--pos-primary-bg)] text-[13px] font-medium text-[var(--pos-primary-fg)] transition-colors hover:bg-[var(--pos-primary-hover)]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {miscModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Add misc item"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMiscModalOpen(false);
          }}
        >
          <div
            className={`w-full max-w-[400px] rounded-[20px] bg-[var(--pos-card)] p-5 ${border0} [border-width:1.5px] [border-color:var(--pos-border-strong)]`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-2)]">
                  Misc product
                </p>
                <h3 className="mt-1 text-[15px] font-medium text-[var(--pos-text-1)]">
                  Add custom line item
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMiscModalOpen(false)}
                className="flex size-8 items-center justify-center rounded-[10px] border border-solid [border-color:var(--pos-border-medium)] text-[var(--pos-text-1)] hover:[border-color:var(--pos-text-1)]"
                aria-label="Close"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </div>
            <label className="mt-4 block text-[11px] font-medium text-[var(--pos-text-2)]">
              Item name
              <input
                type="text"
                value={miscName}
                onChange={(e) => setMiscName(e.target.value)}
                placeholder="e.g. Bottle deposit"
                className="mt-1.5 h-10 w-full rounded-[12px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[13px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
              />
            </label>
            <label className="mt-3 block text-[11px] font-medium text-[var(--pos-text-2)]">
              Unit price
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={miscPrice}
                onChange={(e) => setMiscPrice(e.target.value)}
                placeholder="e.g. 2.50"
                className="mt-1.5 h-10 w-full rounded-[12px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[13px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setMiscModalOpen(false)}
                className="flex h-10 flex-1 items-center justify-center rounded-[10px] border-[1.5px] border-solid [border-color:var(--pos-input-border)] bg-transparent text-[13px] font-medium text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-border-strong)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addMiscLine}
                className="flex h-10 flex-1 items-center justify-center rounded-[10px] bg-[var(--pos-primary-bg)] text-[13px] font-medium text-[var(--pos-primary-fg)] transition-colors hover:bg-[var(--pos-primary-hover)]"
              >
                Add item
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
