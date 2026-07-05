/**
 * Human-readable labels for ledger-related fields on saved daily expense lines.
 * Wording matches Cashbooks / Daily Entry Form; keep in sync if those labels change.
 */
import type { ExpenseLineSaved } from "@/features/daily-entry";
import { savedLineKind } from "@/features/daily-entry";

const LEDGER_KIND_LABEL: Record<NonNullable<ExpenseLineSaved["ledgerKind"]>, string> = {
  invoice: "Bill",
  payment: "Payment",
  return_credit: "Return",
  adjustment: "Adjust",
};

/** Current kinds plus legacy values still present in older saved daily rows. */
const EMPLOYEE_LINE_LABEL: Record<string, string> = {
  salary: "Salary",
  service_charge: "Service Charge",
  bonus: "Bonus",
  overtime: "Overtime",
  house_rent: "House rent",
  deal: "Deal / one-off",
  advance: "Advance",
  other: "Other",
};

/** Bill / Payment / staff line type, or "—" when not a cashbook line or not set. */
export function expenseSavedLineLedgerLabel(line: ExpenseLineSaved): string {
  if (savedLineKind(line) === "regular") return "—";
  const ek = line.ledgerEmployeeLineKind;
  if (ek) return EMPLOYEE_LINE_LABEL[ek] ?? ek;
  const lk = line.ledgerKind;
  if (lk) return LEDGER_KIND_LABEL[lk] ?? lk;
  return "—";
}

/** Ledger entry column in expense reports — type when posted; surfaces sync failures inline. */
export function expenseSavedLineLedgerReportLabel(line: ExpenseLineSaved): string {
  if (savedLineKind(line) === "regular") return "—";
  const typeLabel = expenseSavedLineLedgerLabel(line);
  if (line.ledgerLink) {
    return typeLabel !== "—" ? typeLabel : "Posted";
  }
  if (typeLabel !== "—") return `${typeLabel} · not posted`;
  return "Not posted";
}
