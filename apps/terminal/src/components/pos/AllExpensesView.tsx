import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  fetchExpenseReportSummary,
  type ExpenseReportSummary,
} from "@/features/payables";
import {
  expenseStatLabel,
  expenseStatTile,
  expenseStatValue,
  formatMoney,
  payShell,
} from "./payablesUi";
import { ExpensesListView, SettlementSummary } from "./ExpensesListView";

/**
 * All Expenses — Expense Reports shell (single card: header, stats strip,
 * filters, table) while keeping payables features: still-due + kind tiles,
 * column multi-filters, add/detail drawers, density, ceiled money.
 */
export function AllExpensesView() {
  const [data, setData] = useState<ExpenseReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const t = data?.totals;

  return (
    <div className={payShell}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
        <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">All Expenses</h1>
        <button
          type="button"
          aria-label="Refresh"
          title="Refresh"
          disabled={refreshing}
          onClick={() => void refresh()}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-card)] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-nav-hover)]/40 hover:text-[var(--pos-text-1)] disabled:opacity-50"
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} />
        </button>
      </div>

      {error ? (
        <p className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-2 text-[12px] text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <div className="flex shrink-0 flex-wrap gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2.5">
        <SettlementSummary due={t?.due ?? 0} />
        {data?.byKind.map((c) => (
          <div key={c.key} className={expenseStatTile}>
            <div className={expenseStatLabel}>{c.label}</div>
            <div className={expenseStatValue}>{formatMoney(c.total)}</div>
            {c.due > 0 ? (
              <div className="mt-0.5 text-[11px] tabular-nums text-rose-600 dark:text-rose-400">
                due {formatMoney(c.due)}
              </div>
            ) : (
              <div className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">Settled</div>
            )}
          </div>
        ))}
      </div>

      <ExpensesListView embedded reportShell onDataChanged={() => void load()} />
    </div>
  );
}
