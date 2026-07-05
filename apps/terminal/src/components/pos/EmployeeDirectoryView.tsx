import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import {
  getEmployeeDirectoryLoadState,
  loadEmployeeDirectory,
  subscribeEmployeeDirectoryStore,
} from "@/features/employees";
import {
  addEmployee,
  removeEmployee,
  setEmployeeActive,
  updateEmployee,
  useEmployeeDirectory,
  type Employee,
} from "../../lib/employeeDirectoryStorage";
import {
  EMPLOYEE_LEDGER_BOOK_NAME_PREFIX,
  hasEmployeeLedgerBook,
  upsertEmployeeLedgerBook,
} from "./LedgerModuleView";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

export const HR_DIRECTORY_LEAF_IDS = new Set(["hr-employees"]);

function Toolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
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

const fieldClass =
  "h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none";

type EmployeeDraft = {
  name: string;
  role: string;
  phone: string;
  defaultBasicSalary: string;
  serviceChargePct: string;
  notes: string;
  active: boolean;
};

function emptyDraft(): EmployeeDraft {
  return {
    name: "",
    role: "",
    phone: "",
    defaultBasicSalary: "",
    serviceChargePct: "",
    notes: "",
    active: true,
  };
}

function draftFromEmployee(e: Employee): EmployeeDraft {
  return {
    name: e.name,
    role: e.role,
    phone: e.phone,
    defaultBasicSalary: e.defaultBasicSalary > 0 ? String(e.defaultBasicSalary) : "",
    serviceChargePct: e.serviceChargePct === null ? "" : String(e.serviceChargePct),
    notes: e.notes,
    active: e.active,
  };
}

function parseMoneyInput(raw: string): number {
  const t = raw.replace(/,/g, "").trim();
  if (t === "") return 0;
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function parsePctInput(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(100, Math.round(n * 100) / 100);
}

function EmployeeFormModal({
  title,
  open,
  draft,
  onChange,
  onClose,
  onSave,
  saveLabel,
  error,
}: {
  title: string;
  open: boolean;
  draft: EmployeeDraft;
  onChange: (d: EmployeeDraft) => void;
  onClose: () => void;
  onSave: () => void;
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
        <div className="flex justify-end gap-2 border-t border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="button" showPlus={false} onClick={onSave}>
            {saveLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export function EmployeeDirectoryView() {
  const employees = useEmployeeDirectory();
  const loadState = useSyncExternalStore(
    subscribeEmployeeDirectoryStore,
    getEmployeeDirectoryLoadState,
    getEmployeeDirectoryLoadState,
  );
  const [, setLedgerTick] = useState(0);

  useEffect(() => {
    void loadEmployeeDirectory();
  }, []);

  const [showInactive, setShowInactive] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const visible = useMemo(
    () => (showInactive ? employees : employees.filter((e) => e.active)),
    [employees, showInactive],
  );

  const activeCount = employees.filter((e) => e.active).length;

  const openAdd = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setFormError(null);
    setFormMode("add");
  };

  const openEdit = (e: Employee) => {
    setDraft(draftFromEmployee(e));
    setEditingId(e.id);
    setFormError(null);
    setFormMode("edit");
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormError(null);
  };

  const saveForm = () => {
    const payload = {
      name: draft.name,
      role: draft.role,
      phone: draft.phone,
      defaultBasicSalary: parseMoneyInput(draft.defaultBasicSalary),
      serviceChargePct: parsePctInput(draft.serviceChargePct),
      notes: draft.notes,
      active: draft.active,
    };
    if (formMode === "add") {
      const res = addEmployee(payload);
      if (!res.ok) {
        setFormError(res.message);
        return;
      }
      upsertEmployeeLedgerBook({ name: res.employee.name, phone: res.employee.phone });
      setLedgerTick((t) => t + 1);
      setStatusMessage(`Added ${res.employee.name} and created staff ledger book.`);
      closeForm();
      return;
    }
    if (formMode === "edit" && editingId) {
      const res = updateEmployee(editingId, payload);
      if (!res.ok) {
        setFormError(res.message);
        return;
      }
      setStatusMessage(`Updated ${res.employee.name}.`);
      closeForm();
    }
  };

  const toggleActive = useCallback((e: Employee) => {
    const res = setEmployeeActive(e.id, !e.active);
    if (res.ok) {
      setStatusMessage(e.active ? `Deactivated ${e.name}.` : `Reactivated ${e.name}.`);
    }
  }, []);

  const handleDelete = (e: Employee) => {
    if (!window.confirm(`Remove ${e.name} from the employee list? This cannot be undone.`)) return;
    const res = removeEmployee(e.id);
    if (!res.ok) {
      setStatusMessage(res.message);
      return;
    }
    setStatusMessage(`Removed ${e.name}.`);
  };

  const createLedgerBook = (e: Employee) => {
    upsertEmployeeLedgerBook({ name: e.name, phone: e.phone });
    setLedgerTick((t) => t + 1);
    setStatusMessage(`Ledger book ready: ${EMPLOYEE_LEDGER_BOOK_NAME_PREFIX}${e.name}`);
  };

  const createAllMissingBooks = () => {
    let n = 0;
    for (const e of employees.filter((x) => x.active)) {
      if (!hasEmployeeLedgerBook(e.name)) {
        upsertEmployeeLedgerBook({ name: e.name, phone: e.phone });
        n += 1;
      }
    }
    setLedgerTick((t) => t + 1);
    setStatusMessage(n > 0 ? `Created ${n} staff ledger book(s).` : "All active staff already have ledger books.");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden pr-1">
      <div className="shrink-0">
        <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">Employee Management</h1>
        <p className="mt-1 max-w-[52rem] text-[12px] leading-snug text-[var(--pos-text-2)]">
          Maintain your staff list here — synced to your branch. Basic salary, service charge %, and
          names flow into Employee Salaries, staff ledger books, and daily-entry staff payments.
        </p>
      </div>

      {loadState.loading ? (
        <p className="text-[12px] text-[var(--pos-text-2)]" role="status">
          Loading staff directory…
        </p>
      ) : null}
      {loadState.error ? (
        <p className="text-[12px] text-red-600 dark:text-red-400" role="status">
          {loadState.error}
        </p>
      ) : null}

      <Toolbar className="shrink-0 flex-wrap items-center justify-between gap-3">
        <Toolbar>
          <PrimaryButton type="button" onClick={openAdd}>
            Add employee
          </PrimaryButton>
          <GhostButton type="button" onClick={createAllMissingBooks}>
            Create missing ledger books
          </GhostButton>
        </Toolbar>
        <label className="flex items-center gap-2 text-[12px] text-[var(--pos-text-2)]">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="size-4 rounded border-[var(--pos-input-border)]"
          />
          Show inactive
        </label>
      </Toolbar>

      {statusMessage ? (
        <p className="text-[12px] text-[var(--pos-text-2)]" role="status">
          {statusMessage}
        </p>
      ) : null}

      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Staff directory · {activeCount} active
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-[12px]">
            <thead className="sticky top-0 z-[1] bg-[var(--pos-card)] shadow-[inset_0_-1px_0_var(--pos-border-hairline)]">
              <tr className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Phone</th>
                <th className="px-4 py-2.5 text-right">Basic</th>
                <th className="px-4 py-2.5 text-right">SC %</th>
                <th className="px-4 py-2.5">Ledger book</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[var(--pos-text-2)]">
                    No employees yet. Add your first team member.
                  </td>
                </tr>
              ) : (
                visible.map((e) => {
                  const hasBook = hasEmployeeLedgerBook(e.name);
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-solid [border-color:var(--pos-border-hairline)] hover:bg-[var(--pos-sidebar)]/50"
                    >
                      <td className="px-4 py-2.5 font-medium text-[var(--pos-text-1)]">
                        <span className="inline-flex items-center gap-2">
                          <UserRound className="size-3.5 text-[var(--pos-text-2)]" strokeWidth={2} />
                          {e.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--pos-text-2)]">{e.role || "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--pos-text-2)]">
                        {e.phone || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[11px]">
                        {e.defaultBasicSalary > 0 ? e.defaultBasicSalary.toLocaleString("en-BD") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[11px]">
                        {e.serviceChargePct ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {hasBook ? (
                          <span className="text-[11px] text-[var(--pos-text-2)]">Linked</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => createLedgerBook(e)}
                            className="text-[11px] font-medium text-[var(--pos-text-1)] underline-offset-2 hover:underline"
                          >
                            Create book
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            e.active
                              ? "bg-[var(--pos-nav-active-bg)]/20 text-[var(--pos-text-1)]"
                              : "bg-[var(--pos-sidebar)] text-[var(--pos-text-2)]"
                          }`}
                        >
                          {e.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(e)}
                            className="inline-flex size-8 items-center justify-center rounded-[6px] text-[var(--pos-text-2)] hover:bg-[var(--pos-sidebar)]"
                            aria-label={`Edit ${e.name}`}
                          >
                            <Pencil className="size-3.5" strokeWidth={2} />
                          </button>
                          <GhostButton
                            type="button"
                            className="!px-2 !py-1 text-[10px]"
                            onClick={() => toggleActive(e)}
                          >
                            {e.active ? "Deactivate" : "Activate"}
                          </GhostButton>
                          <button
                            type="button"
                            onClick={() => handleDelete(e)}
                            className="inline-flex size-8 items-center justify-center rounded-[6px] text-[var(--pos-text-2)] hover:bg-[var(--pos-sidebar)] hover:text-red-600"
                            aria-label={`Remove ${e.name}`}
                          >
                            <Trash2 className="size-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EmployeeFormModal
        title={formMode === "add" ? "Add employee" : "Edit employee"}
        open={formMode !== null}
        draft={draft}
        onChange={setDraft}
        onClose={closeForm}
        onSave={saveForm}
        saveLabel={formMode === "add" ? "Add" : "Save"}
        error={formError}
      />
    </div>
  );
}
