/**
 * Human-readable labels for ledger-related fields on saved daily expense lines.
 * Wording matches Ledger Management / Daily Entry Form; keep in sync if those labels change.
 */
import type { ExpenseLineSaved } from "./dailyEntryStorage";
import { savedLineKind } from "./dailyEntryStorage";

const LEDGER_KIND_LABEL: Record<NonNullable<ExpenseLineSaved["ledgerKind"]>, string> = {
  invoice: "Bill",
  payment: "Payment",
  return_credit: "Return",
  adjustment: "Adjust",
};

const EMPLOYEE_LINE_LABEL: Record<
  NonNullable<ExpenseLineSaved["ledgerEmployeeLineKind"]>,
  string
> = {
  salary: "Salary",
  service_charge: "Service charge",
  house_rent: "House rent",
  deal: "Deal / one-off",
  advance: "Advance",
  bonus: "Bonus",
  other: "Other",
};

/** Bill / Payment / staff line type, or "—" when not a ledger book line or not set. */
export function expenseSavedLineLedgerLabel(line: ExpenseLineSaved): string {
  if (savedLineKind(line) === "regular") return "—";
  const ek = line.ledgerEmployeeLineKind;
  if (ek) return EMPLOYEE_LINE_LABEL[ek] ?? ek;
  const lk = line.ledgerKind;
  if (lk) return LEDGER_KIND_LABEL[lk] ?? lk;
  return "—";
}
