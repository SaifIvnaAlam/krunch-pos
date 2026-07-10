import { findEmployeeByName, getEmployeeById } from "../../lib/employeeDirectoryStorage";
import {
  normalizeStaffLineKind,
  staffLineKindLabel,
  STAFF_LINE_KIND,
} from "../payroll/staffLineKinds";
import type { StaffLineKind } from "../payroll/staffLineKinds";
import type { ExpenseLineSaved } from "./types";

/** Legacy cashbook title prefix used before staff payouts moved off cashbooks. */
const LEGACY_STAFF_CASHBOOK_PREFIX = "Staff — ";

export type SavedExpenseLineKind = "vendor" | "regular" | "staff" | "purchase";

export function savedLineKind(line: { kind?: string }): SavedExpenseLineKind {
  if (line.kind === "staff") return "staff";
  if (line.kind === "regular") return "regular";
  if (line.kind === "purchase") return "purchase";
  return "vendor";
}

/** Legacy rows posted via staff cashbooks before the staff expense line kind existed. */
export function isLegacyStaffVendorLine(line: ExpenseLineSaved): boolean {
  if (line.kind === "staff" || line.salaryPaymentId) return true;
  const vendor = (line.vendor ?? "").trim();
  if (!vendor) return false;
  if (vendor.startsWith(LEGACY_STAFF_CASHBOOK_PREFIX)) return true;
  return Boolean(line.ledgerEmployeeLineKind);
}

export function staffLineKindFromSaved(line: ExpenseLineSaved): StaffLineKind {
  if (line.staffLineKind) return normalizeStaffLineKind(line.staffLineKind);
  if (line.ledgerEmployeeLineKind) return normalizeStaffLineKind(line.ledgerEmployeeLineKind);
  return STAFF_LINE_KIND;
}

export function employeeIdFromSavedStaffLine(line: ExpenseLineSaved): string {
  if (line.employeeId?.trim()) return line.employeeId.trim();
  const vendor = (line.vendor ?? "").trim();
  const name = vendor.startsWith(LEGACY_STAFF_CASHBOOK_PREFIX)
    ? vendor.slice(LEGACY_STAFF_CASHBOOK_PREFIX.length).trim()
    : (line.employeeName ?? "").trim();
  if (!name) return "";
  return findEmployeeByName(name)?.id ?? "";
}

export function employeeNameFromSavedStaffLine(line: ExpenseLineSaved): string {
  if (line.employeeName?.trim()) return line.employeeName.trim();
  const vendor = (line.vendor ?? "").trim();
  if (vendor.startsWith(LEGACY_STAFF_CASHBOOK_PREFIX)) {
    return vendor.slice(LEGACY_STAFF_CASHBOOK_PREFIX.length).trim();
  }
  const employeeId = line.employeeId?.trim();
  if (employeeId) {
    return getEmployeeById(employeeId)?.name ?? "";
  }
  return "";
}

/** Legacy daily-entry rows before fines moved to the salary sheet only. */
export function isStaffFineExpenseLine(line: ExpenseLineSaved): boolean {
  return line.kind === "staff" && line.staffLineKind === "fine";
}

export function staffExpenseLineTitle(line: ExpenseLineSaved): string {
  const name = employeeNameFromSavedStaffLine(line);
  const kindLabel = staffLineKindLabel(line.staffLineKind);
  if (name) return `${name} · ${kindLabel}`;
  return kindLabel === "Advance" ? "Salary advance" : "Staff payout";
}

export function staffExpenseLineNote(line: ExpenseLineSaved): string {
  return (line.note ?? line.ledgerNote ?? "").trim();
}
