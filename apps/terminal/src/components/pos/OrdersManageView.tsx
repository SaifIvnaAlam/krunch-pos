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

const DEMO_ORDERS = [
  {
    id: "#1040",
    table: "2",
    status: "pending" as const,
    total: "42.50",
    time: "12:04",
    date: "2026-03-25",
  },
  {
    id: "#1041",
    table: "7",
    status: "kitchen" as const,
    total: "28.00",
    time: "12:18",
    date: "2026-03-25",
  },
  {
    id: "#1042",
    table: "4",
    status: "kitchen" as const,
    total: "51.20",
    time: "12:22",
    date: "2026-03-24",
  },
  {
    id: "#1038",
    table: "QR-12",
    status: "online" as const,
    total: "36.75",
    time: "12:01",
    date: "2026-03-25",
  },
  {
    id: "#1035",
    table: "1",
    status: "completed" as const,
    total: "24.00",
    time: "11:40",
    date: "2026-03-24",
  },
  {
    id: "#1033",
    table: "6",
    status: "cancelled" as const,
    total: "0.00",
    time: "11:22",
    date: "2026-03-23",
  },
];

const FILTER_META: Record<
  OrderFilter,
  { title: string; subtitle: string; match: (s: string) => boolean }
> = {
  all: {
    title: "Order list",
    subtitle: "All channels · demo",
    match: () => true,
  },
  pending: {
    title: "Pending",
    subtitle: "Needs confirmation or payment",
    match: (s) => s === "pending",
  },
  kitchen: {
    title: "Kitchen / in progress",
    subtitle: "Fired to kitchen display",
    match: (s) => s === "kitchen",
  },
  pending_kitchen: {
    title: "Pending / kitchen",
    subtitle: "Queue before and during prep",
    match: (s) => s === "pending" || s === "kitchen",
  },
  completed: {
    title: "Completed",
    subtitle: "Settled tickets",
    match: (s) => s === "completed",
  },
  cancelled: {
    title: "Cancelled",
    subtitle: "Voided or no-shows",
    match: (s) => s === "cancelled",
  },
  online: {
    title: "Online queue",
    subtitle: "Website / QR incoming",
    match: (s) => s === "online",
  },
};

const statusPill: Record<string, string> = {
  pending: "bg-[#ffe4c0] text-[#e07030] [border-color:#f5a94a]",
  kitchen: "bg-[#c8def5] text-[#2f6dae] [border-color:#5b9bd6]",
  completed: "bg-[#c8efd8] text-[#2e9b65] [border-color:#6bca9a]",
  cancelled: "bg-[#ffd0cc] text-[#e8472a] [border-color:#e8472a]",
  online: "bg-[#ddd4f5] text-[#3d2875] [border-color:#c8c7c2]",
};

const ORDER_FILTER_TABS: { id: OrderFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending_kitchen", label: "Pending / Kitchen" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "online", label: "Online" },
];

export function OrdersManageView({
  defaultFilter = "all",
}: {
  defaultFilter?: OrderFilter;
}) {
  const [activeFilter, setActiveFilter] = useState<OrderFilter>(defaultFilter);
  const [orderDate, setOrderDate] = useState("");
  const meta = FILTER_META[activeFilter];
  const rows = useMemo(
    () =>
      DEMO_ORDERS.filter(
        (o) => meta.match(o.status) && (!orderDate || o.date === orderDate),
      ),
    [meta, orderDate],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
          Manage order
        </p>
        <h1 className="mt-1 text-[22px] font-medium tracking-[-0.02em] text-[var(--pos-text-1)]">
          {meta.title}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--pos-text-2)]">
          {meta.subtitle}
        </p>
      </div>
      <div className={`rounded-[14px] bg-[var(--pos-card)] p-3 ${border0}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {ORDER_FILTER_TABS.map((tab) => {
              const isActive = tab.id === activeFilter;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`rounded-full border border-solid px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    isActive
                      ? "border-[var(--pos-text-1)] bg-[var(--pos-text-1)] text-[var(--pos-card)]"
                      : "[border-color:var(--pos-border-medium)] text-[var(--pos-text-2)] hover:[border-color:var(--pos-text-1)] hover:text-[var(--pos-text-1)]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
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
      <div className={`rounded-[14px] bg-[var(--pos-card)] ${border0} overflow-hidden`}>
        <div className="grid grid-cols-[1fr_80px_100px_80px] gap-2 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
          <span>Order</span>
          <span>Table</span>
          <span>Status</span>
          <span className="text-right">Total</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--pos-text-2)]">
            No orders in this view.
          </p>
        ) : (
          rows.map((o) => (
            <button
              key={o.id}
              type="button"
              className="grid w-full grid-cols-[1fr_80px_100px_80px] gap-2 border-b border-solid [border-color:var(--pos-border-hairline)] px-4 py-3 text-left transition-colors hover:bg-[var(--pos-sidebar)]"
            >
              <div>
                <p className="font-mono text-[13px] font-medium text-[var(--pos-text-1)]">
                  {o.id}
                </p>
                <p className="text-[11px] text-[var(--pos-text-2)]">{o.time}</p>
              </div>
              <span className="font-mono text-[13px] text-[var(--pos-text-2)]">
                {o.table}
              </span>
              <span
                className={`inline-flex w-fit items-center gap-2 rounded-full border border-solid px-[8px] py-[2px] text-[11px] font-medium capitalize ${statusPill[o.status] ?? ""}`}
              >
                <span className="size-[5px] shrink-0 rounded-full bg-current" />
                {o.status}
              </span>
              <span className="text-right font-mono text-[13px] text-[var(--pos-text-1)]">
                ${o.total}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
