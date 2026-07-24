import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  fetchExpenseReportSummary,
  type ExpenseReportSummary,
} from "@/features/payables";
import { floatingCard, formatMoney, pageH1, pageWrap, secondaryBtn } from "./payablesUi";
import { ExpensesListView, SettlementSummary } from "./ExpensesListView";

/**
 * All Expenses overview: headline stats and a per-category breakdown across the
 * three expense categories (item purchases, other expenses, salary), followed by
 * the combined list of every expense entry. The stats come from the report
 * summary (which includes salary); the list below shows the individual expenses.
 */
export function AllExpensesView() {
  const [data, setData] = useState<ExpenseReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchExpenseReportSummary({}));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load summary.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const t = data?.totals;

  return (
    <div className={pageWrap}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className={pageH1}>All Expenses</h1>
        <button type="button" className={secondaryBtn} onClick={() => void load()}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {error ? <p className="shrink-0 text-[12px] text-red-600">{error}</p> : null}

      <div className={`${floatingCard} shrink-0`}>
        <SettlementSummary
          total={t?.total ?? 0}
          paid={t?.paid ?? 0}
          due={t?.due ?? 0}
          extra={
            data && data.byKind.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.byKind.map((c) => (
                  <div
                    key={c.key}
                    className="inline-flex items-center gap-2 rounded-full border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-1.5"
                  >
                    <span className="text-[12px] font-medium text-[var(--pos-text-1)]">{c.label}</span>
                    <span className="font-mono text-[12px] tabular-nums text-[var(--pos-text-2)]">
                      {formatMoney(c.total)}
                    </span>
                    {c.due > 0 ? (
                      <span className="font-mono text-[11px] tabular-nums text-red-600 dark:text-red-400">
                        · due {formatMoney(c.due)}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null
          }
        />
      </div>

      <ExpensesListView embedded />
    </div>
  );
}
