import { ExpensesListView } from "./ExpensesListView";
import { QuickExpenseView } from "./QuickExpenseView";
import { PayablesDashboardView } from "./PayablesDashboardView";
import { ExpenseCategoriesView } from "./ExpenseCategoriesView";

export const PAYABLES_LEAF_IDS = new Set([
  "pay-list",
  "pay-quick",
  "pay-dashboard",
  "pay-categories",
]);

export function PayablesModuleView({ leafId }: { leafId: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {leafId === "pay-quick" ? (
        <QuickExpenseView />
      ) : leafId === "pay-dashboard" ? (
        <PayablesDashboardView />
      ) : leafId === "pay-categories" ? (
        <ExpenseCategoriesView />
      ) : (
        <ExpensesListView />
      )}
    </div>
  );
}
