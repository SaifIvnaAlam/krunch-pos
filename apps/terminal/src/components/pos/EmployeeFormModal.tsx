import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Plus, X } from "lucide-react";
import type { Employee } from "../../lib/employeeDirectoryStorage";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

const fieldClass =
  "h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none";

export type EmployeeDraft = {
  name: string;
  role: string;
  phone: string;
  email: string;
  defaultBasicSalary: string;
  serviceChargePct: string;
  notes: string;
  active: boolean;
};

export function emptyEmployeeDraft(): EmployeeDraft {
  return {
    name: "",
    role: "",
    phone: "",
    email: "",
    defaultBasicSalary: "",
    serviceChargePct: "",
    notes: "",
    active: true,
  };
}

export function employeeDraftFromRecord(e: Employee): EmployeeDraft {
  return {
    name: e.name,
    role: e.role,
    phone: e.phone,
    email: e.email,
    defaultBasicSalary: e.defaultBasicSalary > 0 ? String(e.defaultBasicSalary) : "",
    serviceChargePct: e.serviceChargePct === null ? "" : String(e.serviceChargePct),
    notes: e.notes,
    active: e.active,
  };
}

export function parseEmployeeMoneyInput(raw: string): number {
  const t = raw.replace(/,/g, "").trim();
  if (t === "") return 0;
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function parseEmployeePctInput(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(100, Math.round(n * 100) / 100);
}

function PrimaryButton({
  children,
  showPlus = true,
  className = "",
  type = "button",
  ...rest
}: ComponentPropsWithoutRef<"button"> & { children: ReactNode; showPlus?: boolean }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--pos-text-1)] px-3 py-2 text-[12px] font-medium text-[var(--pos-page)] transition-opacity hover:opacity-90 ${className}`}
      {...rest}
    >
      {showPlus ? <Plus className="size-3.5" strokeWidth={2} /> : null}
      {children}
    </button>
  );
}

function GhostButton({
  children,
  className = "",
  type = "button",
  ...rest
}: ComponentPropsWithoutRef<"button"> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={`rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-3 py-2 text-[12px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-sidebar)] ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function EmployeeFormModal({
  title,
  open,
  draft,
  onChange,
  onClose,
  onSave,
  onRemove,
  saveLabel,
  error,
}: {
  title: string;
  open: boolean;
  draft: EmployeeDraft;
  onChange: (d: EmployeeDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onRemove?: () => void;
  saveLabel: string;
  error: string | null;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Dismiss" onClick={onClose} />
      <div
        className={`relative z-[1] w-full max-w-[440px] overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0} shadow-lg`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-form-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p id="employee-form-title" className="text-[15px] font-semibold text-[var(--pos-text-1)]">
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-[8px] text-[var(--pos-text-2)] hover:bg-[var(--pos-sidebar)]"
            aria-label="Close"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Full name
            </span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              className={fieldClass}
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Role
            </span>
            <input
              type="text"
              value={draft.role}
              onChange={(e) => onChange({ ...draft, role: e.target.value })}
              className={fieldClass}
              placeholder="e.g. Waiter, Kitchen"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Phone
            </span>
            <input
              type="tel"
              value={draft.phone}
              onChange={(e) => onChange({ ...draft, phone: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Email
            </span>
            <input
              type="email"
              value={draft.email}
              onChange={(e) => onChange({ ...draft, email: e.target.value })}
              className={fieldClass}
              placeholder="name@example.com"
              autoComplete="email"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Basic salary (BDT)
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={draft.defaultBasicSalary}
              onChange={(e) => onChange({ ...draft, defaultBasicSalary: e.target.value })}
              className={fieldClass}
              placeholder="Fixed monthly basic pay"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Service charge %
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={draft.serviceChargePct}
              onChange={(e) => onChange({ ...draft, serviceChargePct: e.target.value })}
              className={fieldClass}
              placeholder="Leave blank if not in pool split"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Notes
            </span>
            <input
              type="text"
              value={draft.notes}
              onChange={(e) => onChange({ ...draft, notes: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-[var(--pos-text-1)]">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => onChange({ ...draft, active: e.target.checked })}
              className="size-4 rounded border-[var(--pos-input-border)]"
            />
            Active on payroll
          </label>
          {error ? (
            <p className="text-[12px] text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-solid [border-color:var(--pos-divider)] px-4 py-3">
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="text-[12px] text-red-600 underline-offset-2 hover:underline dark:text-red-400"
            >
              Remove employee
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <GhostButton type="button" onClick={onClose}>
              Cancel
            </GhostButton>
            <PrimaryButton type="button" showPlus={false} onClick={onSave}>
              {saveLabel}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
