import { dispatchPosSelectLeaf } from "../../lib/posNavEvents";

const linkClass =
  "rounded-[6px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-2.5 py-1 text-[10px] font-semibold text-[var(--pos-text-1)] transition-colors hover:border-[var(--pos-sb-base)] hover:bg-[var(--pos-nav-hover)]/30";

export function DailyEntryLedgerLinks() {
  return (
    <>
      <p className="border-b border-solid [border-color:var(--pos-divider)] pb-1 pt-2 text-[11px] font-semibold text-[var(--pos-text-1)]">
        Ledger book entry
      </p>
      <p className="text-[10px] leading-snug text-[var(--pos-text-2)]">
        Ledger rows post to bills &amp; payments. Regular rows use title + amount only.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => dispatchPosSelectLeaf("lm-management")}
          className={linkClass}
        >
          Open ledger books
        </button>
        <button
          type="button"
          onClick={() => dispatchPosSelectLeaf("lm-ledger")}
          className={linkClass}
        >
          Open bills &amp; payments
        </button>
      </div>
    </>
  );
}

export function DailyEntryReportLinks({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
          Reports
        </span>
        <button
          type="button"
          onClick={() => dispatchPosSelectLeaf("rep-management")}
          className={linkClass}
        >
          Expenses
        </button>
        <button
          type="button"
          onClick={() => dispatchPosSelectLeaf("rep-sales")}
          className={linkClass}
        >
          Sales
        </button>
        <button
          type="button"
          onClick={() => dispatchPosSelectLeaf("rep-analytics")}
          className={linkClass}
        >
          Analytics
        </button>
      </div>
    );
  }

  return (
    <>
      <p className="border-b border-solid [border-color:var(--pos-divider)] pb-1 pt-3 text-[11px] font-semibold text-[var(--pos-text-1)]">
        Reports
      </p>
      <p className="text-[10px] leading-snug text-[var(--pos-text-2)]">
        Review saved entries in expense, sales, and analytics reports.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => dispatchPosSelectLeaf("rep-management")}
          className={linkClass}
        >
          Expense reports
        </button>
        <button
          type="button"
          onClick={() => dispatchPosSelectLeaf("rep-sales")}
          className={linkClass}
        >
          Sales report
        </button>
        <button
          type="button"
          onClick={() => dispatchPosSelectLeaf("rep-analytics")}
          className={linkClass}
        >
          Analytics
        </button>
      </div>
    </>
  );
}
