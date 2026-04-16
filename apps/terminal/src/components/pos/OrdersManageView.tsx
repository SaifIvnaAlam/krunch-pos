import { useMemo, useState } from "react";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

export type OrderFilter =
  | "all"
  | "pending"
  | "kitchen"
  | "pending_kitchen"
  | "completed"
  | "cancelled"
  | "online";

type OrderStatus = "pending" | "kitchen" | "completed" | "cancelled";
type OrderType = "dine_in" | "takeaway" | "online_delivery" | "online_pickup";

const DEMO_ORDERS = [
  {
    id: "#1040",
    table: "2",
    status: "pending" as const,
    type: "dine_in" as const,
    total: "42.50",
    time: "12:04",
    date: "2026-03-25",
  },
  {
    id: "#1041",
    table: "7",
    status: "kitchen" as const,
    type: "takeaway" as const,
    total: "28.00",
    time: "12:18",
    date: "2026-03-25",
  },
  {
    id: "#1042",
    table: "4",
    status: "kitchen" as const,
    type: "dine_in" as const,
    total: "51.20",
    time: "12:22",
    date: "2026-03-24",
  },
  {
    id: "#1038",
    table: "QR-12",
    status: "pending" as const,
    type: "online_delivery" as const,
    total: "36.75",
    time: "12:01",
    date: "2026-03-25",
  },
  {
    id: "#1035",
    table: "1",
    status: "completed" as const,
    type: "dine_in" as const,
    total: "24.00",
    time: "11:40",
    date: "2026-03-24",
  },
  {
    id: "#1033",
    table: "6",
    status: "cancelled" as const,
    type: "online_pickup" as const,
    total: "0.00",
    time: "11:22",
    date: "2026-03-23",
  },
];

const CONSOLIDATED_ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "kitchen",
  "completed",
  "cancelled",
];
const ALL_ORDER_TYPES: OrderType[] = [
  "dine_in",
  "takeaway",
  "online_delivery",
  "online_pickup",
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  kitchen: "Kitchen",
  completed: "Completed",
  cancelled: "Cancelled",
};
const TYPE_LABELS: Record<OrderType, string> = {
  dine_in: "Dine In",
  takeaway: "Takeaway",
  online_delivery: "Online Delivery",
  online_pickup: "Online Pickup",
};

const statusPill: Record<OrderStatus, string> = {
  pending: "border-[#6f6f6f] bg-[#f2f2f2] text-[#111111]",
  kitchen: "border-[#4f4f4f] bg-[#dddddd] text-[#111111]",
  completed: "border-[#2f2f2f] bg-[#cfcfcf] text-[#111111]",
  cancelled: "border-[#1f1f1f] bg-[#bdbdbd] text-[#111111]",
};
const TYPE_PILL: Record<OrderType, string> = {
  dine_in: "border-[#808080] bg-[#f5f5f5] text-[#111111]",
  takeaway: "border-[#666666] bg-[#e8e8e8] text-[#111111]",
  online_delivery: "border-[#444444] bg-[#dcdcdc] text-[#111111]",
  online_pickup: "border-[#2a2a2a] bg-[#d0d0d0] text-[#111111]",
};

function buildInitialStatusSet(filter: OrderFilter): Set<OrderStatus> {
  if (filter === "pending") return new Set(["pending"]);
  if (filter === "kitchen") return new Set(["kitchen"]);
  if (filter === "pending_kitchen") return new Set(["pending", "kitchen"]);
  if (filter === "completed") return new Set(["completed"]);
  if (filter === "cancelled") return new Set(["cancelled"]);
  return new Set(CONSOLIDATED_ORDER_STATUSES);
}
function buildInitialTypeSet(filter: OrderFilter): Set<OrderType> {
  if (filter === "online") return new Set(["online_delivery", "online_pickup"]);
  return new Set(ALL_ORDER_TYPES);
}

export function OrdersManageView({
  defaultFilter = "all",
}: {
  defaultFilter?: OrderFilter;
}) {
  const [activeStatuses, setActiveStatuses] = useState<Set<OrderStatus>>(
    () => buildInitialStatusSet(defaultFilter),
  );
  const [activeTypes, setActiveTypes] = useState<Set<OrderType>>(
    () => buildInitialTypeSet(defaultFilter),
  );
  const [orderDate, setOrderDate] = useState("");
  const [query, setQuery] = useState("");

  const statusCounts = useMemo(() => {
    const base: Record<OrderStatus, number> = {
      pending: 0,
      kitchen: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const order of DEMO_ORDERS) base[order.status] += 1;
    return base;
  }, []);

  const subtitle = useMemo(() => {
    const statusLabels = Array.from(activeStatuses).map((s) => STATUS_LABELS[s]);
    const typeLabels = Array.from(activeTypes).map((t) => TYPE_LABELS[t]);
    if (statusLabels.length === 0 || typeLabels.length === 0) return "No filter selected";
    if (
      statusLabels.length === CONSOLIDATED_ORDER_STATUSES.length &&
      typeLabels.length === ALL_ORDER_TYPES.length
    ) {
      return "Consolidated queue across all order types";
    }
    return `Status: ${statusLabels.join(", ")} | Type: ${typeLabels.join(", ")}`;
  }, [activeStatuses, activeTypes]);

  const rows = useMemo(
    () =>
      DEMO_ORDERS.filter(
        (o) =>
          activeStatuses.has(o.status) &&
          activeTypes.has(o.type) &&
          (!orderDate || o.date === orderDate) &&
          (!query ||
            o.id.toLowerCase().includes(query.toLowerCase()) ||
            o.table.toLowerCase().includes(query.toLowerCase())),
      ),
    [activeStatuses, activeTypes, orderDate, query],
  );

  const toggleStatus = (status: OrderStatus) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };
  const toggleType = (type: OrderType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pr-1">
      <div className="shrink-0">
        <p className="text-[10px] font-medium tracking-[0.06em] text-[var(--pos-text-2)]">
          Operations / Orders
        </p>
        <h1 className="mt-0.5 text-[19px] font-semibold tracking-[-0.01em] text-[var(--pos-text-1)]">
          Order list
        </h1>
        <p className="mt-1 text-[12px] text-[var(--pos-text-2)]">{subtitle}</p>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(statusCounts) as OrderStatus[]).map((status) => (
          <div
            key={status}
            className={`rounded-[10px] border border-solid px-3 py-2 ${border0} bg-[var(--pos-card)]`}
          >
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              {STATUS_LABELS[status]}
            </p>
            <p className="mt-1 font-mono text-[15px] font-semibold text-[var(--pos-text-1)]">
              {statusCounts[status]}
            </p>
          </div>
        ))}
      </div>

      <div className={`shrink-0 rounded-[14px] bg-[var(--pos-card)] p-3 ${border0}`}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {CONSOLIDATED_ORDER_STATUSES.map((status) => {
              const isActive = activeStatuses.has(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  className={`rounded-full border border-solid px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    isActive
                      ? "border-[var(--pos-text-1)] bg-[var(--pos-text-1)] text-[var(--pos-card)]"
                      : "[border-color:var(--pos-border-medium)] text-[var(--pos-text-2)] hover:[border-color:var(--pos-text-1)] hover:text-[var(--pos-text-1)]"
                  }`}
                >
                  {STATUS_LABELS[status]}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ALL_ORDER_TYPES.map((type) => {
              const isActive = activeTypes.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`rounded-full border border-solid px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    isActive
                      ? "border-[var(--pos-text-1)] bg-[var(--pos-text-1)] text-[var(--pos-card)]"
                      : "[border-color:var(--pos-border-medium)] text-[var(--pos-text-2)] hover:[border-color:var(--pos-text-1)] hover:text-[var(--pos-text-1)]"
                  }`}
                >
                  {TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by order id or table"
              className="h-9 flex-1 rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-text-2)] focus:border-[var(--pos-text-1)] focus:outline-none"
              aria-label="Search orders"
            />
            <label className="flex items-center gap-2 text-[12px] text-[var(--pos-text-2)]">
              <span>Date</span>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="h-9 rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
                aria-label="Filter orders by date"
              />
            </label>
          </div>
        </div>
      </div>
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <div className="sticky top-0 z-[1] grid shrink-0 grid-cols-[1fr_72px_100px_130px_86px_70px] gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)] shadow-[inset_0_-1px_0_var(--pos-border-hairline)]">
          <span>Order</span>
          <span>Table</span>
          <span>Status</span>
          <span>Type</span>
          <span>Date / Time</span>
          <span className="text-right">Total</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--pos-text-2)]">
              No orders in this view.
            </p>
          ) : (
            rows.map((o) => (
              <button
                key={o.id}
                type="button"
                className="grid w-full grid-cols-[1fr_72px_100px_130px_86px_70px] gap-2 border-b border-solid [border-color:var(--pos-border-hairline)] px-3 py-2 text-left transition-colors hover:bg-[var(--pos-sidebar)]"
              >
                <div>
                  <p className="font-mono text-[13px] font-medium text-[var(--pos-text-1)]">
                    {o.id}
                  </p>
                </div>
                <span className="font-mono text-[13px] text-[var(--pos-text-2)]">
                  {o.table}
                </span>
                <span
                  className={`inline-flex w-fit items-center rounded-[999px] border border-solid px-[8px] py-[2px] text-[10px] font-semibold uppercase ${statusPill[o.status]}`}
                >
                  {STATUS_LABELS[o.status]}
                </span>
                <span
                  className={`inline-flex w-fit items-center rounded-[999px] border border-solid px-[8px] py-[2px] text-[10px] font-semibold ${TYPE_PILL[o.type]}`}
                >
                  {TYPE_LABELS[o.type]}
                </span>
                <span className="text-[11px] text-[var(--pos-text-2)]">
                  {o.date.slice(5)} {o.time}
                </span>
                <span className="text-right font-mono text-[13px] text-[var(--pos-text-1)]">
                  ৳{o.total}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
