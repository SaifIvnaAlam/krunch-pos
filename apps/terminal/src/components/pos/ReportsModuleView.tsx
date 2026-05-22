import { useEffect, useState } from "react";
import { LineChart, Receipt, TrendingUp, type LucideIcon } from "lucide-react";
import { AnalyticsReportView } from "./AnalyticsReportView";
import { ExpenseReportsView } from "./ExpenseReportsView";
import { SalesReportView } from "./SalesReportView";

export const REPORT_LEAF_IDS = new Set([
  "rep-management",
  "rep-expenses",
  "rep-sales",
  "rep-analytics",
]);

export type ReportsPanelTab = "expenses" | "sales" | "analytics";

function reportsTabFromLeafId(leafId: string): ReportsPanelTab {
  if (leafId === "rep-sales") return "sales";
  if (leafId === "rep-analytics") return "analytics";
  return "expenses";
}

const REPORT_VIEW_TABS: {
  id: ReportsPanelTab;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "expenses", label: "Expense reports", icon: Receipt },
  { id: "sales", label: "Sales report", icon: TrendingUp },
  { id: "analytics", label: "Analytics", icon: LineChart },
];

function ReportsViewSwitcher({
  tab,
  onTabChange,
}: {
  tab: ReportsPanelTab;
  onTabChange: (next: ReportsPanelTab) => void;
}) {
  return (
    <header className="shrink-0">
      <nav
        role="tablist"
        aria-label="Reports views"
        className="flex gap-0 border-b border-solid [border-color:var(--pos-divider)]"
      >
        {REPORT_VIEW_TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(id)}
              className={[
                "relative -mb-px flex items-center gap-2 px-4 py-3 text-[13px] transition-colors",
                active
                  ? "font-semibold text-[var(--pos-text-1)]"
                  : "font-medium text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]",
              ].join(" ")}
            >
              <Icon
                className={`size-[15px] shrink-0 ${active ? "text-[var(--pos-sb-base)]" : "opacity-70"}`}
                strokeWidth={2}
                aria-hidden
              />
              {label}
              <span
                className={[
                  "pointer-events-none absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[var(--pos-sb-base)] transition-opacity duration-200",
                  active ? "opacity-100" : "opacity-0",
                ].join(" ")}
                aria-hidden
              />
            </button>
          );
        })}
      </nav>
    </header>
  );
}

export function ReportsModuleView({ leafId }: { leafId: string }) {
  const [tab, setTab] = useState<ReportsPanelTab>(() =>
    reportsTabFromLeafId(leafId),
  );

  useEffect(() => {
    setTab(reportsTabFromLeafId(leafId));
  }, [leafId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <ReportsViewSwitcher tab={tab} onTabChange={setTab} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {tab === "expenses" ? (
          <ExpenseReportsView />
        ) : tab === "sales" ? (
          <SalesReportView />
        ) : (
          <AnalyticsReportView />
        )}
      </div>
    </div>
  );
}
