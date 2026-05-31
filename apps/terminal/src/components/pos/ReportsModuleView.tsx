import { useEffect, useState } from "react";
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

export function ReportsModuleView({ leafId }: { leafId: string }) {
  const [tab, setTab] = useState<ReportsPanelTab>(() =>
    reportsTabFromLeafId(leafId),
  );

  useEffect(() => {
    setTab(reportsTabFromLeafId(leafId));
  }, [leafId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
