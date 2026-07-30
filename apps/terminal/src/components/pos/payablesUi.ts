/** Shared layout tokens for the Payables (expenses/payments) UI. Mirrors the
 *  semantic --pos-* token styling used across the terminal. */

export const payShell =
  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)]";

/** Page layout used by the expense screens: paper background, floating cards. */
/** Page shell: fills main; list bodies scroll inside (not the shell itself). */
export const pageWrap = "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pb-2";
export const floatingCard =
  "rounded-[16px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-[0_1px_2px_rgba(0,0,0,0.03)]";
export const pageH1 =
  "text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[var(--pos-text-1)]";

/** Oxblood brand button for the primary page action (matches the sidebar base). */
export const brandBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-[var(--pos-sb-base)] px-3.5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.04),0_6px_16px_color-mix(in_srgb,var(--pos-sb-base)_22%,transparent)] transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

/** Hero card wash used by settlement summary bands. */
export const heroCard =
  `${floatingCard} relative overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--pos-sb-base)_9%,transparent),transparent_58%)]`;

/** Same chrome as Expense Reports `statCell` — fixed tile size across pages. */
export const expenseStatTile =
  "w-[180px] max-w-full shrink-0 rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-2";

/** Horizontal strip that hosts expenseStatTile cells (matches Expense Reports). */
export const expenseStatStrip =
  "flex flex-wrap gap-2 rounded-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-4 py-2.5";

export const expenseStatLabel = "text-[11px] text-[var(--pos-text-2)]";
export const expenseStatValue =
  "mt-0.5 text-[20px] font-semibold tabular-nums leading-tight text-[var(--pos-text-1)]";

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

/** Whole-currency money with the branch symbol (frontend is BDT today). Ceils fractions. */
export function formatMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  const whole = Math.ceil(Math.abs(n));
  return `${sign}৳${whole.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}
