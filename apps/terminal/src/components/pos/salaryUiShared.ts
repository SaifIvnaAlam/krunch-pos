/** Shared layout tokens and helpers for Employee Salaries UI. */

export const salaryShell =
  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]";

export const salaryHead =
  "flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3";

export const salaryTitle = "text-[18px] font-semibold text-[var(--pos-text-1)]";

export const salarySubtitle = "text-[13px] text-[var(--pos-text-2)]";

export const salaryStatLabel =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]";

export const salaryStatValue =
  "font-mono text-[26px] font-semibold leading-none text-[var(--pos-text-1)]";

export const salaryStats =
  "grid grid-cols-2 gap-2 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2.5 sm:grid-cols-4";

export const salaryStatCell =
  "rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2.5";

/** Spreadsheet-style grid (Google Sheets-like). */
export const sheetTableWrap =
  "w-fit min-w-full overflow-hidden rounded-[10px] border border-solid [border-color:var(--pos-divider)]";

export const sheetTh =
  "border border-solid border-[var(--pos-sb-border)] bg-[var(--pos-sb-bg)] px-2.5 py-2 text-left text-[14px] font-medium text-[var(--pos-sb-text-1)]";

export const sheetThNum = `${sheetTh} text-right`;

export const sheetTd =
  "border border-solid [border-color:var(--pos-divider)] px-2.5 py-0 align-middle text-[16px] text-[var(--pos-text-1)]";

export const sheetTdNum =
  "border border-solid [border-color:var(--pos-divider)] px-2.5 py-1.5 align-middle text-right font-mono text-[16px] font-semibold tabular-nums text-[var(--pos-text-1)]";

export const sheetTdTotal = `${sheetTd} bg-[var(--pos-sidebar)] font-semibold`;

export const sheetTdNumTotal = `${sheetTdNum} bg-[var(--pos-sidebar)]`;

export const sheetCellLink =
  "block max-w-full cursor-pointer truncate text-left underline-offset-2 hover:underline";

export const sheetInput =
  "box-border block h-[36px] w-full min-w-0 border-0 bg-transparent px-1 text-right font-mono text-[16px] font-semibold tabular-nums text-[var(--pos-text-1)] outline-none focus:bg-[var(--pos-sidebar)]/80";

export const sheetInputLocked = `${sheetInput} cursor-default opacity-60`;

export const sheetPlainSelect =
  "h-[30px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-2 text-[13px] text-[var(--pos-text-1)]";

export const sheetPlainInput =
  "h-[30px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-2 text-[13px] text-[var(--pos-text-1)] outline-none focus:bg-[var(--pos-sidebar)]/50";

export function formatWhole(n: number): string {
  return n.toLocaleString("en-BD");
}

export function stillOwedTone(
  shouldPay: number,
  _paid: number,
  stillOwed: number,
  advance = 0,
): string {
  if (advance > 0) return "text-sky-700 dark:text-sky-400";
  if (shouldPay <= 0) return "text-[var(--pos-text-2)]";
  if (stillOwed <= 0) return "text-emerald-700 dark:text-emerald-400";
  return "text-red-600 dark:text-red-400";
}

export function stillOwedLabel(stillOwed: number, advanceOut: number): string {
  if (advanceOut > 0) return `Adv ${formatWhole(advanceOut)}`;
  return formatWhole(stillOwed);
}

export function employeeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
