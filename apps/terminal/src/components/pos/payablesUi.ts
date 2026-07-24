/** Shared layout tokens for the Payables (expenses/payments) UI. Mirrors the
 *  semantic --pos-* token styling used across the terminal. */

export const payShell =
  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]";

/** Page layout used by the expense screens: paper background, floating cards. */
/** Page shell: fills main; list bodies scroll inside (not the shell itself). */
export const pageWrap = "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pb-2";
export const floatingCard =
  "rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]";
export const pageH1 =
  "text-[20px] font-semibold leading-tight tracking-[-0.01em] text-[var(--pos-text-1)]";

/** Maroon brand button for the primary page action (matches the sidebar base). */
export const brandBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] bg-[var(--pos-sb-base)] px-3.5 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export const payHead =
  "flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3";

export const payTitle = "text-[18px] font-semibold text-[var(--pos-text-1)]";
export const paySubtitle = "text-[13px] text-[var(--pos-text-2)]";

export const payBody = "min-h-0 flex-1 overflow-auto p-4";

export const fieldLabel =
  "block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]";

export const textInput =
  "mt-1 h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-2.5 text-[14px] text-[var(--pos-text-1)] outline-none focus:border-[var(--pos-accent,#6366f1)]";

export const selectInput = textInput;

export const primaryBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-solid border-[var(--pos-accent,#4f46e5)]/60 bg-[var(--pos-accent,#4f46e5)] px-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[13px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30";

export const dangerBtn =
  "inline-flex h-8 items-center justify-center gap-1 rounded-[8px] border border-solid border-red-500/50 px-2.5 text-[12px] font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400";

export const statCard =
  "rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-3";

export const statLabel =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]";

export const statValue =
  "mt-1 font-mono text-[24px] font-semibold leading-none text-[var(--pos-text-1)]";

/** Whole-currency money with the branch symbol (frontend is BDT today). */
export function formatMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}৳${Math.abs(n).toLocaleString("en-BD", {
    maximumFractionDigits: 2,
  })}`;
}
