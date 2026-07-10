import { useEffect, useMemo, useState, useSyncExternalStore, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ExternalLink, X } from "lucide-react";
import {
  getEmployeeMonthBalance,
  getSalaryBundle,
  recordStaffPayout,
  subscribeSalaryBundle,
} from "@/features/payroll";
import { useSession } from "@/features/auth";
import { formatDateKeyAsDisplay, todayDateKey } from "../../lib/dateDisplay";
import { dispatchOpenDailyEntry } from "../../lib/posNavEvents";
import {
  parseNonNegativeAmount,
  sanitizeNonNegativeDecimalInput,
} from "../../lib/moneyInput";
import { formatWhole, stillOwedTone } from "./salaryUiShared";

const fieldClass =
  "h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none";

function GhostButton({
  children,
  className = "",
  type = "button",
  ...rest
}: ComponentPropsWithoutRef<"button"> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={`rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-3 py-2 text-[12px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-sidebar)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  className = "",
  type = "button",
  ...rest
}: ComponentPropsWithoutRef<"button"> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--pos-text-1)] px-3 py-2 text-[12px] font-medium text-[var(--pos-page)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

type StaffPayoutModalProps = {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  initialDateKey?: string;
  onSaved?: (result: { dailyEntryDate: string; amount: number }) => void;
};

export function StaffPayoutModal({
  open,
  onClose,
  employeeId,
  employeeName,
  initialDateKey,
  onSaved,
}: StaffPayoutModalProps) {
  const { userName } = useSession();
  const bundle = useSyncExternalStore(subscribeSalaryBundle, getSalaryBundle, getSalaryBundle);
  const [dateKey, setDateKey] = useState(todayDateKey());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isAdvance, setIsAdvance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const monthKey = dateKey.slice(0, 7);
  const monthBalance = useMemo(
    () => getEmployeeMonthBalance(bundle, monthKey, employeeId),
    [bundle, monthKey, employeeId],
  );
  const stillOwed = monthBalance?.stillOwed ?? 0;

  useEffect(() => {
    if (!open) return;
    setDateKey(initialDateKey && /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey) ? initialDateKey : todayDateKey());
    setAmount("");
    setNote("");
    setIsAdvance(false);
    setError(null);
    setBusy(false);
  }, [open, initialDateKey, employeeId]);

  if (!open) return null;

  async function handleSave() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await recordStaffPayout({
        employeeId,
        employeeName,
        dateKey,
        amount: parseNonNegativeAmount(amount),
        note: note.trim() || undefined,
        enteredBy: userName.trim() || undefined,
        isAdvance,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onSaved?.({ dailyEntryDate: res.dailyEntryDate, amount: res.amount });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function openFullDailyEntry() {
    onClose();
    dispatchOpenDailyEntry(dateKey, { staffPayoutEmployeeId: employeeId });
  }

  function fillDueAmount() {
    if (stillOwed > 0) {
      setAmount(String(stillOwed));
      setIsAdvance(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Dismiss" onClick={onClose} />
      <div
        className="relative z-[1] w-full max-w-[420px] overflow-hidden rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-lg sm:rounded-[14px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-payout-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <div>
            <p id="staff-payout-title" className="text-[15px] font-semibold text-[var(--pos-text-1)]">
              Record payout
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--pos-text-2)]">{employeeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-[8px] text-[var(--pos-text-2)] hover:bg-[var(--pos-sidebar)]"
            aria-label="Close"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        {/* Context summary */}
        {!isAdvance && monthBalance ? (
          <div className="border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-sidebar)]/25 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                  Due this month
                </p>
                <p
                  className={`mt-0.5 font-mono text-[18px] font-semibold ${stillOwedTone(stillOwed, 0, stillOwed)}`}
                >
                  ৳{formatWhole(stillOwed)}
                </p>
              </div>
              {stillOwed > 0 ? (
                <button
                  type="button"
                  onClick={fillDueAmount}
                  className="shrink-0 rounded-[6px] border border-solid [border-color:var(--pos-divider)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-sidebar)]"
                >
                  Fill amount
                </button>
              ) : null}
            </div>
            {monthBalance.advanceApplied > 0 ? (
              <p className="mt-2 text-[11px] text-sky-700 dark:text-sky-400">
                Prior advance applied: ৳{formatWhole(monthBalance.advanceApplied)}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 px-4 py-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Payout date
            </span>
            <input
              type="date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              className={fieldClass}
            />
            <span className="text-[11px] text-[var(--pos-text-2)]">
              {formatDateKeyAsDisplay(dateKey)}
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Amount (BDT)
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(sanitizeNonNegativeDecimalInput(e.target.value))}
              className={fieldClass}
              placeholder="0"
              autoFocus
            />
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={isAdvance}
              onChange={(e) => setIsAdvance(e.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 accent-[var(--pos-text-1)]"
            />
            <span className="text-[12px] leading-snug text-[var(--pos-text-1)]">
              Advance salary
              <span className="mt-0.5 block text-[11px] text-[var(--pos-text-2)]">
                Pay ahead of earned amount. Carries into next month.
              </span>
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Note (optional)
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={fieldClass}
              placeholder={isAdvance ? `Salary advance - ${employeeName}` : `Salary payout - ${employeeName}`}
            />
          </label>

          {error ? (
            <p className="text-[12px] text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <button
            type="button"
            onClick={openFullDailyEntry}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--pos-text-2)] underline-offset-2 hover:text-[var(--pos-text-1)] hover:underline"
          >
            Open full Daily Entry
            <ExternalLink className="size-3" strokeWidth={2} aria-hidden />
          </button>
          <div className="flex gap-2">
            <GhostButton type="button" onClick={onClose} disabled={busy}>
              Cancel
            </GhostButton>
            <PrimaryButton type="button" onClick={() => void handleSave()} disabled={busy}>
              {busy ? "Saving…" : isAdvance ? "Record advance" : "Record payout"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
