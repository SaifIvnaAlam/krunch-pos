/**
 * Human-readable labels for ledger-related fields on saved daily expense lines.
 * Wording matches Cashbooks / Daily Entry Form; keep in sync if those labels change.
 */
import { savedLineKind } from "@/features/daily-entry/calculations";
import {
  staffLineKindFromSaved,
} from "@/features/daily-entry/staffExpenseLine";
import type { ExpenseLineSaved } from "@/features/daily-entry";
import { staffLineKindLabel } from "@/features/payroll";

const LEDGER_KIND_LABEL: Record<NonNullable<ExpenseLineSaved["ledgerKind"]>, string> = {
  invoice: "Bill",
  payment: "Payment",
  return_credit: "Return",
  adjustment: "Adjust",
};

/** Bill / Payment / staff line type, or "—" when not a cashbook line or not set. */
export function expenseSavedLineLedgerLabel(line: ExpenseLineSaved): string {
  const kind = savedLineKind(line);
  if (kind === "regular") return "—";
  if (kind === "staff") return staffLineKindLabel(staffLineKindFromSaved(line));
  if (kind === "purchase") return "Bill";
  const ek = line.ledgerEmployeeLineKind;
  if (ek) return staffLineKindLabel(ek);
  const lk = line.ledgerKind;
  if (lk) return LEDGER_KIND_LABEL[lk] ?? lk;
  return "—";
}

/** Ledger entry column in expense reports — type when posted; surfaces sync failures inline. */
export function expenseSavedLineLedgerReportLabel(line: ExpenseLineSaved): string {
  const kind = savedLineKind(line);
  if (kind === "regular") return "—";
  if (kind === "staff") return staffLineKindLabel(staffLineKindFromSaved(line));
  const typeLabel = expenseSavedLineLedgerLabel(line);
  if (line.ledgerLink) {
    return typeLabel !== "—" ? typeLabel : "Posted";
  }
  if (typeLabel !== "—") return `${typeLabel} · not posted`;
  return "Not posted";
}
