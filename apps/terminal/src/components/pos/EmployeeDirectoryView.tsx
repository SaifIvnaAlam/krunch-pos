import { useEffect, useMemo, useState, useSyncExternalStore, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { dispatchOpenEmployeeSalaryHistory } from "../../lib/posNavEvents";
import {
  addEmployee,
  useEmployeeDirectory,
} from "../../lib/employeeDirectoryStorage";
import {
  flushEmployeeDirectoryPersist,
  getEmployeeDirectoryLoadState,
  loadEmployeeDirectory,
  subscribeEmployeeDirectoryStore,
} from "@/features/employees";
import {
  loadSalaryWorkspace,
  syncLoadedSalaryBundleToEmployees,
} from "@/features/payroll";
import {
  EmployeeFormModal,
  emptyEmployeeDraft,
  parseEmployeeMoneyInput,
  parseEmployeePctInput,
} from "./EmployeeFormModal";
import {
  formatWhole,
  salaryShell,
  sheetCellLink,
  sheetTableWrap,
  sheetTd,
  sheetTdNum,
  sheetTh,
  sheetThNum,
} from "./salaryUiShared";

export const HR_DIRECTORY_LEAF_IDS = new Set(["hr-employees"]);

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

function EmployeeDirectoryColGroup() {
  return (
    <colgroup>
      <col className="w-[15%]" />
      <col className="w-[11%]" />
      <col className="w-[12%]" />
      <col className="w-[14%]" />
      <col className="w-[10%]" />
      <col className="w-[7%]" />
      <col className="w-[9%]" />
      <col className="w-[9%]" />
    </colgroup>
  );
}

export function EmployeeDirectoryView() {
  const employees = useEmployeeDirectory();
  const loadState = useSyncExternalStore(
    subscribeEmployeeDirectoryStore,
    getEmployeeDirectoryLoadState,
    getEmployeeDirectoryLoadState,
  );
  useEffect(() => {
    void loadEmployeeDirectory();
  }, []);

  const [showInactive, setShowInactive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState(emptyEmployeeDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const visible = useMemo(
    () => (showInactive ? employees : employees.filter((e) => e.active)),
    [employees, showInactive],
  );

  const activeCount = employees.filter((e) => e.active).length;

  const openAdd = () => {
    setDraft(emptyEmployeeDraft());
    setFormError(null);
    setAddOpen(true);
  };

  const closeAdd = () => {
    setAddOpen(false);
    setFormError(null);
  };

  const saveAdd = () => {
    const res = addEmployee({
      name: draft.name,
      role: draft.role,
      phone: draft.phone,
      email: draft.email,
      defaultBasicSalary: parseEmployeeMoneyInput(draft.defaultBasicSalary),
      serviceChargePct: parseEmployeePctInput(draft.serviceChargePct),
      notes: draft.notes,
      active: draft.active,
    });
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    setStatusMessage(`Added ${res.employee.name}.`);
    closeAdd();
    void (async () => {
      try {
        await flushEmployeeDirectoryPersist();
        await loadSalaryWorkspace();
        syncLoadedSalaryBundleToEmployees();
      } catch {
        /* directory save error is surfaced via store loadError */
      }
    })();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden pr-1">
      <div className="shrink-0">
        <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">Employee Management</h1>
        <p className="mt-1 max-w-[52rem] text-[12px] leading-snug text-[var(--pos-text-2)]">
          Add staff and open a profile to edit details, view salary history, and record payouts.
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

      <div className={`${salaryShell} min-h-0 flex-1`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-solid [border-color:var(--pos-divider)] px-3 py-2 text-[13px]">
          <div className="flex flex-wrap items-center gap-3 text-[var(--pos-text-2)]">
            {statusMessage ? <span role="status">{statusMessage}</span> : null}
            <span>{activeCount} active</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="size-4 rounded border-[var(--pos-input-border)]"
              />
              Show inactive
            </label>
          </div>
          <PrimaryButton type="button" onClick={openAdd}>
            Add employee
          </PrimaryButton>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className={sheetTableWrap}>
            <table className="w-full min-w-[720px] table-fixed border-collapse">
              <EmployeeDirectoryColGroup />
              <thead>
                <tr>
                  <th className={sheetTh}>Name</th>
                  <th className={sheetTh}>Role</th>
                  <th className={sheetTh}>Phone</th>
                  <th className={sheetTh}>Email</th>
                  <th className={sheetThNum}>Basic</th>
                  <th className={sheetThNum}>SC %</th>
                  <th className={sheetTh}>Status</th>
                  <th className={`${sheetTh} text-center`}>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={`${sheetTd} py-6 text-center text-[var(--pos-text-2)]`}>
                      No employees yet. Add your first team member.
                    </td>
                  </tr>
                ) : (
                  visible.map((e) => (
                    <tr key={e.id}>
                      <td className={`${sheetTd} max-w-0 truncate`}>
                        <button
                          type="button"
                          onClick={() => dispatchOpenEmployeeSalaryHistory(e.id)}
                          className={sheetCellLink}
                          title={`Open ${e.name} profile`}
                        >
                          {e.name}
                        </button>
                      </td>
                      <td className={`${sheetTd} text-[var(--pos-text-2)]`}>{e.role || "—"}</td>
                      <td className={`${sheetTd} font-mono text-[var(--pos-text-2)]`}>
                        {e.phone || "—"}
                      </td>
                      <td className={`${sheetTd} max-w-0 truncate text-[var(--pos-text-2)]`}>
                        {e.email || "—"}
                      </td>
                      <td className={sheetTdNum}>
                        {e.defaultBasicSalary > 0 ? formatWhole(e.defaultBasicSalary) : "—"}
                      </td>
                      <td className={sheetTdNum}>{e.serviceChargePct ?? "—"}</td>
                      <td className={sheetTd}>{e.active ? "Active" : "Inactive"}</td>
                      <td className={`${sheetTd} text-center`}>
                        <button
                          type="button"
                          onClick={() => dispatchOpenEmployeeSalaryHistory(e.id)}
                          className="cursor-pointer text-[16px] font-medium underline-offset-2 hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <EmployeeFormModal
        title="Add employee"
        open={addOpen}
        draft={draft}
        onChange={setDraft}
        onClose={closeAdd}
        onSave={saveAdd}
        saveLabel="Add"
        error={formError}
      />
    </div>
  );
}
