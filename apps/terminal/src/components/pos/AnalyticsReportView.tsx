import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  bankSaleNetAfterServiceCharge,
  listDailyEntriesDescendingFromMap,
  useDailyEntryMap,
  type DailyEntryRow,
} from "@/features/daily-entry";

type ChartPoint = {
  dateKey: string;
  label: string;
  sales: number;
  expenses: number;
};

function netSalesForRow(r: DailyEntryRow): number {
  const gross =
    r.cashSale +
    bankSaleNetAfterServiceCharge(r.bankSale) +
    r.bkashSale +
    r.nagadSale +
    r.pathaoSale +
    r.foodiSale +
    r.foodpandaSale;
  return gross - Math.max(0, r.voidSale ?? 0);
}

function formatChartDate(dateKey: string): string {
  const parts = dateKey.split("-");
  const d = parts[2] ?? "";
  const m = parts[1] ?? "";
  if (!d || !m) return dateKey;
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}`;
}

function monthKeyFromDate(dateKey: string): string | null {
  const parts = dateKey.split("-");
  if (parts.length < 2) return null;
  const [y, m] = parts;
  if (!y || !m) return null;
  return `${y}-${m}`;
}

function parseMonthKey(monthKey: string): { year: number; month: number } | null {
  const [y, m] = monthKey.split("-").map((x) => Number.parseInt(x, 10));
  if (!y || !m || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function monthLabel(monthKey: string): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  return new Date(parsed.year, parsed.month - 1, 1).toLocaleDateString("en-BD", {
    month: "long",
    year: "numeric",
  });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAxisTk(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "৳0";
  if (Math.abs(n) >= 1000) return `৳${Math.round(n / 1000)}k`;
  return `৳${Math.round(n)}`;
}

function niceYMax(maxValue: number): number {
  if (maxValue <= 0) return 200_000;
  const step = 20_000;
  return Math.max(step, Math.ceil(maxValue / step) * step);
}

function buildChartPoints(rows: DailyEntryRow[], monthKey: string): ChartPoint[] {
  return rows
    .filter((r) => monthKeyFromDate(r.date) === monthKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      dateKey: r.date,
      label: formatChartDate(r.date),
      sales: netSalesForRow(r),
      expenses: r.expenses ?? 0,
    }));
}

function collectMonthKeys(rows: DailyEntryRow[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) {
    const mk = monthKeyFromDate(r.date);
    if (mk) keys.add(mk);
  }
  return Array.from(keys).sort((a, b) => b.localeCompare(a));
}

function ChartTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: ChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2 text-[12px] shadow-md">
      <p className="mb-1 font-semibold text-[var(--pos-text-1)]">{point.label}</p>
      <p className="text-[#6db86d]">
        Sales: <span className="font-mono font-medium">৳{formatMoney(point.sales)}</span>
      </p>
      <p className="text-[#e8956a]">
        Expenses: <span className="font-mono font-medium">৳{formatMoney(point.expenses)}</span>
      </p>
    </div>
  );
}

export function AnalyticsReportView() {
  const { map, loading, error } = useDailyEntryMap();
  const entries = useMemo(() => listDailyEntriesDescendingFromMap(map), [map]);
  const monthKeys = useMemo(() => collectMonthKeys(entries), [entries]);

  const defaultMonth = useMemo(() => {
    if (monthKeys.length > 0) return monthKeys[0];
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, [monthKeys]);

  const [monthKey, setMonthKey] = useState(defaultMonth);

  useEffect(() => {
    if (monthKeys.length === 0) return;
    setMonthKey((prev) => (monthKeys.includes(prev) ? prev : monthKeys[0]!));
  }, [monthKeys]);

  const activeMonth =
    monthKeys.length > 0 && monthKeys.includes(monthKey) ? monthKey : defaultMonth;

  const chartPoints = useMemo(
    () => buildChartPoints(entries, activeMonth),
    [entries, activeMonth],
  );

  const yMax = useMemo(() => {
    let peak = 0;
    for (const p of chartPoints) {
      peak = Math.max(peak, p.sales, p.expenses);
    }
    return niceYMax(peak);
  }, [chartPoints]);

  const monthIndex = monthKeys.indexOf(activeMonth);
  const canGoOlder = monthIndex >= 0 && monthIndex < monthKeys.length - 1;
  const canGoNewer = monthIndex > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
        <div>
          <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">Analytics</h1>
          <p className="text-[12px] text-[var(--pos-text-2)]">
            Daily net sales vs expenses from saved daily entries (same figures as Sales report).
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canGoOlder}
            onClick={() => {
              if (canGoOlder) setMonthKey(monthKeys[monthIndex + 1]!);
            }}
            className="flex size-8 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-input-border)] text-[var(--pos-text-2)] transition-colors enabled:hover:bg-[var(--pos-nav-hover)] disabled:opacity-40"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" strokeWidth={2} />
          </button>
          <span className="min-w-[140px] text-center text-[13px] font-medium text-[var(--pos-text-1)]">
            {monthLabel(activeMonth)}
          </span>
          <button
            type="button"
            disabled={!canGoNewer}
            onClick={() => {
              if (canGoNewer) setMonthKey(monthKeys[monthIndex - 1]!);
            }}
            className="flex size-8 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-input-border)] text-[var(--pos-text-2)] transition-colors enabled:hover:bg-[var(--pos-nav-hover)] disabled:opacity-40"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[var(--pos-text-2)]">
            Loading daily entries…
          </div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-red-600" role="alert">
            {error}
          </div>
        ) : chartPoints.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[var(--pos-text-2)]">
            No daily entries for {monthLabel(activeMonth)}. Save entries in Daily Entry Form or
            pick another month.
          </div>
        ) : (
          <section
            className="rounded-[12px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] p-4"
            aria-labelledby="daily-sales-vs-expenses-title"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2
                id="daily-sales-vs-expenses-title"
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-1)]"
              >
                Daily sales vs expenses
              </h2>
              <div className="flex items-center gap-4 text-[11px] text-[var(--pos-text-2)]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-sm bg-[#6db86d]" aria-hidden />
                  Sales
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 rounded-full border-2 border-[#e8956a] bg-[#e8956a]"
                    aria-hidden
                  />
                  Expenses
                </span>
              </div>
            </div>
            <div className="h-[min(420px,50vh)] min-h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartPoints}
                  margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke="var(--pos-divider)"
                    strokeOpacity={0.65}
                    vertical
                    horizontal
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--pos-text-2)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--pos-divider)" }}
                    interval={1}
                  />
                  <YAxis
                    domain={[0, yMax]}
                    tickFormatter={formatAxisTk}
                    tick={{ fill: "var(--pos-text-2)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--pos-divider)" }}
                    ticks={Array.from({ length: yMax / 20_000 + 1 }, (_, i) => i * 20_000)}
                  />
                  <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar
                    dataKey="sales"
                    name="Sales"
                    fill="#6db86d"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={28}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke="#e8956a"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#e8956a", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
