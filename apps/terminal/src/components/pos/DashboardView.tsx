/** KPI + flat charts — data from Nest reports + daily entries. */

import { useDashboardData } from "@/features/reports";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

const PASTEL_BARS = [
  "#ffd4c8",
  "#c8efe0",
  "#ddd4f5",
  "#c8e4f5",
  "#fce5c8",
  "#f5d0dc",
  "#d8edd0",
] as const;

function fmtMoney(value: string | number) {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-BD");
}

export function DashboardView() {
  const { sales, items, dailyEntryCount, loading, error } = useDashboardData();

  const topItems = items.slice(0, 7);
  const maxQty = Math.max(...topItems.map((i) => i.quantity), 1);

  const kpis = [
    {
      label: "Gross sales (7d)",
      value: sales ? `৳${fmtMoney(sales.totalRevenue)}` : "—",
      sub: sales ? `${sales.totalOrders} paid orders` : "Loading…",
    },
    {
      label: "Avg ticket",
      value: sales ? `৳${fmtMoney(sales.averageOrderValue)}` : "—",
      sub: "Paid orders only",
    },
    {
      label: "Daily entries",
      value: String(dailyEntryCount),
      sub: "Saved in Daily Entry Form",
    },
    {
      label: "Menu performers",
      value: String(items.length),
      sub: "Items with sales this week",
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto pr-1">
      <div>
        <p className="text-[10px] font-medium tracking-[0.06em] text-[var(--pos-text-2)]">
          Overview / Dashboard
        </p>
        <h1 className="mt-0.5 text-[19px] font-semibold tracking-[-0.01em] text-[var(--pos-text-1)]">
          Dashboard
        </h1>
      </div>

      {loading ? (
        <p className="text-[13px] text-[var(--pos-text-2)]">Loading dashboard…</p>
      ) : null}
      {error ? (
        <p className="text-[13px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`rounded-[14px] bg-[var(--pos-card)] p-4 ${border0}`}
          >
            <p className="text-[11px] text-[var(--pos-text-2)]">{k.label}</p>
            <p className="mt-2 font-mono text-[24px] font-medium leading-none tracking-[-0.03em] text-[var(--pos-text-1)]">
              {k.value}
            </p>
            <p className="mt-2 text-[11px] text-[var(--pos-text-2)]">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-[14px] bg-[var(--pos-card)] p-4 ${border0}`}>
        <h2 className="text-[18px] font-medium tracking-[-0.01em] text-[var(--pos-text-1)]">
          Top items (7 days)
        </h2>
        <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
          From order history — save orders at the register to populate this chart.
        </p>
        {topItems.length === 0 ? (
          <p className="mt-6 text-center text-[13px] text-[var(--pos-text-2)]">
            No item sales yet this week.
          </p>
        ) : (
          <div className="mt-4 flex h-40 items-end gap-2">
            {topItems.map((row, i) => (
              <div key={row.menuItemId} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-[6px]"
                  style={{
                    height: `${Math.max(8, (row.quantity / maxQty) * 100)}%`,
                    backgroundColor: PASTEL_BARS[i % PASTEL_BARS.length],
                  }}
                  title={`${row.name}: ${row.quantity}`}
                />
                <span className="max-w-full truncate text-[9px] text-[var(--pos-text-2)]">
                  {row.name.split(" ")[0]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
