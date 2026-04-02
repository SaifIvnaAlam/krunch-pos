/** KPI + flat charts — no shadows/gradients per style guide. */

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

const SALES_BY_DAY = [
  { label: "Mon", cents: 4200_00 },
  { label: "Tue", cents: 3800_00 },
  { label: "Wed", cents: 5100_00 },
  { label: "Thu", cents: 4600_00 },
  { label: "Fri", cents: 6200_00 },
  { label: "Sat", cents: 7800_00 },
  { label: "Sun", cents: 5400_00 },
];

const ORDERS_HOURLY = [2, 4, 6, 8, 12, 18, 24, 32, 28, 22, 16, 10, 6];

const CATEGORY_SHARE = [
  { name: "Premium cuts", pct: 24 },
  { name: "Premium platter", pct: 18 },
  { name: "Mocktails & smoothie", pct: 16 },
  { name: "Appetizer & econo", pct: 22 },
  { name: "Rest", pct: 20 },
];

function fmtMoney(cents: number) {
  return (cents / 100).toFixed(0);
}

export function DashboardView() {
  const maxDay = Math.max(...SALES_BY_DAY.map((d) => d.cents), 1);
  const maxHr = Math.max(...ORDERS_HOURLY, 1);

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

      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {[
          { label: "Gross sales", value: "৳4,286", sub: "vs yesterday +12%" },
          { label: "Orders", value: "142", sub: "in-store + QR" },
          { label: "Avg ticket", value: "৳30.18", sub: "after discounts" },
          { label: "Open tables", value: "8", sub: "of 24 seated" },
        ].map((k) => (
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`rounded-[14px] bg-[var(--pos-card)] p-4 ${border0}`}>
          <h2 className="text-[18px] font-medium tracking-[-0.01em] text-[var(--pos-text-1)]">
            Sales by day
          </h2>
          <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
            Last 7 days · demo currency
          </p>
          <div className="mt-6 flex h-[140px] items-end justify-between gap-2">
            {SALES_BY_DAY.map((d, i) => {
              const h = Math.round((d.cents / maxDay) * 100);
              const bg = PASTEL_BARS[i % PASTEL_BARS.length];
              return (
                <div
                  key={d.label}
                  className="flex min-w-0 flex-1 flex-col items-center gap-2"
                >
                  <div className="flex h-[100px] w-full max-w-[40px] items-end justify-center">
                    <div
                      className="w-full rounded-t-[8px] rounded-b-[4px] border border-solid [border-color:var(--pos-border-hairline)]"
                      style={{
                        height: `${Math.max(h, 8)}%`,
                        backgroundColor: bg,
                      }}
                      title={`৳${fmtMoney(d.cents)}`}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-[var(--pos-text-2)]">
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`rounded-[14px] bg-[var(--pos-card)] p-4 ${border0}`}>
          <h2 className="text-[18px] font-medium tracking-[-0.01em] text-[var(--pos-text-1)]">
            Orders by hour
          </h2>
          <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
            Today · covers logged
          </p>
          <div className="mt-4">
            <svg
              viewBox="0 0 320 120"
              className="h-[120px] w-full"
              role="img"
              aria-label="Orders by hour line chart"
            >
              <polyline
                fill="none"
                stroke="#2f6dae"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={ORDERS_HOURLY.map((v, i) => {
                  const x = 12 + (i * (320 - 24)) / (ORDERS_HOURLY.length - 1);
                  const y = 108 - (v / maxHr) * 96;
                  return `${x},${y}`;
                }).join(" ")}
              />
              {ORDERS_HOURLY.map((v, i) => {
                const x = 12 + (i * (320 - 24)) / (ORDERS_HOURLY.length - 1);
                const y = 108 - (v / maxHr) * 96;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="3"
                    fill="var(--pos-card)"
                    stroke="#2f6dae"
                    strokeWidth="2"
                  />
                );
              })}
            </svg>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-[var(--pos-text-2)]">
              <span>11:00</span>
              <span>16:00</span>
              <span>21:00</span>
            </div>
          </div>
        </div>
      </div>

      <div className={`rounded-[14px] bg-[var(--pos-card)] p-4 ${border0}`}>
        <h2 className="text-[18px] font-medium tracking-[-0.01em] text-[var(--pos-text-1)]">
          Sales mix by category
        </h2>
        <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
          Share of net · rounded demo
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {CATEGORY_SHARE.map((row, i) => (
            <div key={row.name}>
              <div className="mb-1 flex justify-between text-[13px]">
                <span className="text-[var(--pos-text-3)]">{row.name}</span>
                <span className="font-mono text-[var(--pos-text-2)]">
                  {row.pct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--pos-sidebar)]">
                <div
                  className="h-full rounded-full border border-solid [border-color:var(--pos-border-hairline)]"
                  style={{
                    width: `${row.pct}%`,
                    backgroundColor: PASTEL_BARS[i % PASTEL_BARS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
