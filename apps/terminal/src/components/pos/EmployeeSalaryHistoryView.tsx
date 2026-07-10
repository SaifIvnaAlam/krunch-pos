import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Lock, Plus, Trash2 } from "lucide-react";
import { useSession, verifySessionPassword } from "@/features/auth";
import {
  buildEmployeeSalaryHistory,
  deleteStaffPayout,
  getSalaryBundle,
  getSalaryWorkspaceLoadState,
  reconcileSalaryMonthFromDailyEntries,
  staffLineKindLabel,
  subscribeSalaryBundle,
  type EmployeeSalaryPayoutLine,
} from "@/features/payroll";
import { formatDateKeyAsDisplay } from "../../lib/dateDisplay";
import {
  removeEmployee,
  setEmployeeActive,
  updateEmployee,
  useEmployeeDirectory,
} from "../../lib/employeeDirectoryStorage";
import { dispatchOpenDailyEntry } from "../../lib/posNavEvents";
import { isMonthKey, isSalaryPaymentPosted } from "../../lib/salarySheetStorage";
import {
  EmployeeFormModal,
  employeeDraftFromRecord,
  parseEmployeeMoneyInput,
  parseEmployeePctInput,
} from "./EmployeeFormModal";
import {
  employeeInitials,
  formatWhole,
  stillOwedLabel,
  stillOwedTone,
} from "./salaryUiShared";
import { StaffPayoutModal } from "./StaffPayoutModal";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

const profilePageShellClass =
  "mx-auto flex w-full max-w-[960px] flex-col gap-5 px-4 sm:px-8 lg:px-12 xl:px-16";

const profileBtnClass =
  "inline-flex h-[30px] shrink-0 items-center justify-center border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 text-[13px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-sidebar)]/50 disabled:cursor-not-allowed disabled:opacity-40";

function SummaryChip({
  label,
  value,
  toneClass = "text-[var(--pos-text-1)]",
}: {
  label: string;
  value: string;
  toneClass?: string;
}) {
  return (
    <div className="min-w-0 rounded-[8px] bg-[var(--pos-sidebar)]/60 px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
        {label}
      </p>
      <p className={`mt-0.5 font-mono text-[12px] font-semibold sm:text-[13px] ${toneClass}`}>{value}</p>
    </div>
  );
}

export function EmployeeSalaryHistoryView({
  employeeId,
  employeeName,
  backLabel = "Employee Salaries",
  onBack,
  onSelectMonth,
  onEmployeeRemoved,
}: {
  employeeId: string;
  employeeName: string;
  backLabel?: string;
  onBack: () => void;
  onSelectMonth: (monthKey: string) => void;
  onEmployeeRemoved?: () => void;
}) {
  const employees = useEmployeeDirectory();
  const { activeBranch } = useSession();
  const bundle = useSyncExternalStore(subscribeSalaryBundle, getSalaryBundle, getSalaryBundle);
  const loadState = useSyncExternalStore(
    subscribeSalaryBundle,
    getSalaryWorkspaceLoadState,
    getSalaryWorkspaceLoadState,
  );

  const employee = useMemo(
    () => employees.find((e) => e.id === employeeId),
    [employees, employeeId],
  );
  const displayName = employee?.name.trim() || employeeName.trim() || "Unnamed employee";
  const canManageEmployee = Boolean(employee);

  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(() =>
    employeeDraftFromRecord(
      employee ?? {
        id: "",
        name: displayName,
        role: "",
        phone: "",
        email: "",
        defaultBasicSalary: 0,
        serviceChargePct: null,
        notes: "",
        active: true,
      },
    ),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeSalaryPayoutLine | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [employeeDeleteOpen, setEmployeeDeleteOpen] = useState(false);
  const [employeeDeletePassword, setEmployeeDeletePassword] = useState("");
  const [employeeDeleteError, setEmployeeDeleteError] = useState<string | null>(null);
  const [employeeDeleteBusy, setEmployeeDeleteBusy] = useState(false);
  const employeeDeletePasswordRef = useRef<HTMLInputElement>(null);

  const resolvedEmployeeId = employee?.id ?? employeeId;

  const history = useMemo(
    () => buildEmployeeSalaryHistory(bundle, employeeId, displayName),
    [bundle, employeeId, displayName],
  );

  useEffect(() => {
    if (!loadState.loaded) return;
    const monthKeys = Object.keys(getSalaryBundle().months).filter(isMonthKey);
    if (monthKeys.length === 0) return;
    let cancelled = false;
    void Promise.all(monthKeys.map((monthKey) => reconcileSalaryMonthFromDailyEntries(monthKey))).then(
      () => {
        if (cancelled) return;
      },
    );
    return () => {
      cancelled = true;
    };
  }, [employeeId, loadState.loaded]);

  function openDailyEntry(dateKey?: string) {
    if (dateKey) {
      dispatchOpenDailyEntry(dateKey, {
        staffPayoutEmployeeId: resolvedEmployeeId || undefined,
      });
      return;
    }
    setPayoutModalOpen(true);
  }

  function openEdit() {
    if (!employee) return;
    setDraft(employeeDraftFromRecord(employee));
    setFormError(null);
    setEditOpen(true);
  }

  function saveEdit() {
    if (!employee) return;
    const res = updateEmployee(employee.id, {
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
    setStatusMessage(`Updated ${res.employee.name}.`);
    setEditOpen(false);
    setFormError(null);
  }

  function toggleActive() {
    if (!employee) return;
    const res = setEmployeeActive(employee.id, !employee.active);
    if (!res.ok) {
      setStatusMessage(res.message);
      return;
    }
    setStatusMessage(employee.active ? `Deactivated ${employee.name}.` : `Reactivated ${employee.name}.`);
  }

  function openEmployeeDelete() {
    if (!employee) return;
    setEmployeeDeletePassword("");
    setEmployeeDeleteError(null);
    setEmployeeDeleteOpen(true);
    requestAnimationFrame(() => employeeDeletePasswordRef.current?.focus());
  }

  function closeEmployeeDelete() {
    if (employeeDeleteBusy) return;
    setEmployeeDeleteOpen(false);
    setEmployeeDeletePassword("");
    setEmployeeDeleteError(null);
  }

  async function handleConfirmDeleteEmployee() {
    if (!employee || employeeDeleteBusy) return;
    setEmployeeDeleteBusy(true);
    setEmployeeDeleteError(null);
    try {
      const verified = await verifySessionPassword(employeeDeletePassword, activeBranch.id);
      if (!verified.ok) {
        setEmployeeDeleteError(verified.message);
        employeeDeletePasswordRef.current?.focus();
        return;
      }
      const res = removeEmployee(employee.id);
      if (!res.ok) {
        setEmployeeDeleteError(res.message);
        return;
      }
      setEmployeeDeleteOpen(false);
      setEmployeeDeletePassword("");
      onEmployeeRemoved?.();
    } finally {
      setEmployeeDeleteBusy(false);
    }
  }

  function handlePayoutSaved(result: { dailyEntryDate: string; amount: number }) {
    setStatusMessage(
      `Recorded ${formatWhole(result.amount)} for ${formatDateKeyAsDisplay(result.dailyEntryDate)}.`,
    );
  }

  async function handleConfirmDeletePayout() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    setStatusMessage(null);
    try {
      const res = await deleteStaffPayout({
        paymentId: deleteTarget.id,
        monthKey: deleteTarget.monthKey,
        employeeId: resolvedEmployeeId,
      });
      if (!res.ok) {
        setStatusMessage(res.message);
        return;
      }
      const dateLabel = res.dailyEntryDate
        ? formatDateKeyAsDisplay(res.dailyEntryDate)
        : deleteTarget.monthLabel;
      setStatusMessage(`Removed ${formatWhole(res.amount)} payout from ${dateLabel}.`);
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  const { totals } = history;
  const thBase = "px-3 py-2 text-[11px] font-semibold text-[var(--pos-text-2)]";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className={profilePageShellClass}>
        <div className="shrink-0 pt-1">
          <button
            type="button"
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--pos-text-2)] transition-colors hover:text-[var(--pos-text-1)]"
          >
            <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden />
            {backLabel}
          </button>

          <div className={`rounded-[14px] bg-[var(--pos-card)] ${border0} px-4 py-4 sm:px-5 sm:py-5`}>
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--pos-sidebar)] text-[14px] font-semibold text-[var(--pos-text-1)] sm:size-14 sm:text-[15px]"
                aria-hidden
              >
                {employeeInitials(displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
                      Employee profile
                    </p>
                    <h1 className="text-[17px] font-semibold text-[var(--pos-text-1)] sm:text-[18px]">
                      {displayName}
                    </h1>
                    <p className="mt-0.5 text-[12px] text-[var(--pos-text-2)]">
                      {employee?.role?.trim() || "Staff member"}
                      {employee ? ` · ${employee.active ? "Active" : "Inactive"}` : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button type="button" onClick={openEdit} disabled={!canManageEmployee} className={profileBtnClass}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={toggleActive}
                      disabled={!canManageEmployee}
                      className={profileBtnClass}
                    >
                      {employee?.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={openEmployeeDelete}
                      disabled={!canManageEmployee}
                      className={`${profileBtnClass} text-red-600 hover:bg-red-500/10 dark:text-red-400`}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px]">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                      Basic salary
                    </p>
                    <p className="mt-0.5 font-mono text-[12px] text-[var(--pos-text-1)]">
                      {employee && employee.defaultBasicSalary > 0
                        ? formatWhole(employee.defaultBasicSalary)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                      Service charge %
                    </p>
                    <p className="mt-0.5 font-mono text-[12px] text-[var(--pos-text-1)]">
                      {employee?.serviceChargePct != null ? employee.serviceChargePct : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                      Phone
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--pos-text-1)]">
                      {employee?.phone?.trim() || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                      Email
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-[var(--pos-text-1)]">
                      {employee?.email?.trim() || "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid w-full grid-cols-2 gap-2 border-t border-solid [border-color:var(--pos-divider)] pt-4 sm:grid-cols-4 sm:gap-3">
              <SummaryChip label="Total payable" value={formatWhole(totals.payable)} />
              <SummaryChip label="Total paid" value={formatWhole(totals.paid)} />
              <SummaryChip
                label={totals.advanceCredit > 0 ? "Advance credit" : "Due"}
                value={
                  totals.advanceCredit > 0
                    ? formatWhole(totals.advanceCredit)
                    : formatWhole(totals.stillOwed)
                }
                toneClass={stillOwedTone(
                  totals.payable,
                  totals.paid,
                  totals.stillOwed,
                  totals.advanceCredit,
                )}
              />
              <SummaryChip
                label="Months"
                value={String(history.months.length)}
                toneClass="text-[var(--pos-text-2)]"
              />
            </div>
          </div>
        </div>

        {statusMessage ? (
          <p className="text-[12px] text-[var(--pos-text-2)]" role="status">
            {statusMessage}
          </p>
        ) : null}

        <div className={`shrink-0 rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
          <div className="border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
              By month
            </p>
          </div>
          {history.months.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-[var(--pos-text-2)]">
              No salary records yet for this employee.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-solid [border-color:var(--pos-divider)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
                    <th className="px-4 py-2.5 text-left">Month</th>
                    <th className="px-2 py-2.5 text-right">Payable</th>
                    <th className="px-2 py-2.5 text-right">Paid</th>
                    <th className="px-2 py-2.5 text-right">Due</th>
                    <th className="px-2 py-2.5 text-center">Pays</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.months.map((month) => (
                    <tr
                      key={month.monthKey}
                      className="border-b border-solid [border-color:var(--pos-border-hairline)] last:border-b-0 hover:bg-[var(--pos-sidebar)]/40"
                    >
                      <td className="px-4 py-2.5 font-medium text-[var(--pos-text-1)]">
                        <span className="inline-flex items-center gap-1.5">
                          {month.monthLabel}
                          {month.isLocked ? (
                            <Lock
                              className="size-3 text-[var(--pos-text-2)]"
                              strokeWidth={2}
                              aria-label="Locked"
                            />
                          ) : null}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-[var(--pos-text-1)]">
                        {formatWhole(month.payable)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-[var(--pos-text-1)]">
                        {formatWhole(month.paid)}
                      </td>
                      <td
                        className={`px-2 py-2.5 text-right font-mono font-semibold ${stillOwedTone(month.payable, month.paid, month.stillOwed, month.advanceCarriedOut)}`}
                      >
                        <span className="block text-[12px]">
                          {month.advanceCarriedOut > 0
                            ? stillOwedLabel(month.stillOwed, month.advanceCarriedOut)
                            : formatWhole(month.stillOwed)}
                        </span>
                        {month.advanceApplied > 0 ? (
                          <span className="block text-[10px] font-normal text-sky-700 dark:text-sky-400">
                            −{formatWhole(month.advanceApplied)} prior adv
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5 text-center text-[var(--pos-text-2)]">
                        {month.paymentCount > 0 ? month.paymentCount : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectMonth(month.monthKey)}
                          className="text-[11px] font-medium text-[var(--pos-text-1)] underline-offset-2 hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={`min-h-0 shrink-0 rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
              All payouts
            </p>
            <button
              type="button"
              onClick={() => openDailyEntry()}
              disabled={!resolvedEmployeeId}
              className="inline-flex shrink-0 items-center gap-1 rounded-[8px] bg-[var(--pos-text-1)] px-3 py-2 text-[12px] font-medium text-[var(--pos-page)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add payout
              <Plus className="size-3" strokeWidth={2} aria-hidden />
            </button>
          </div>
          {history.payouts.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-[var(--pos-text-2)]">
              No payouts recorded yet. Use Add payout above or record from Daily Entry.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-solid [border-color:var(--pos-divider)]">
                    <th className={`whitespace-nowrap ${thBase} text-left`}>Month</th>
                    <th className={`whitespace-nowrap ${thBase} text-left`}>Date</th>
                    <th className={`whitespace-nowrap ${thBase} text-left`}>Type</th>
                    <th className={`${thBase} text-right`}>Amount</th>
                    <th className={`min-w-[4rem] ${thBase} text-left`}>Note</th>
                    <th className={`whitespace-nowrap ${thBase} text-left`}>Source</th>
                    <th className={`${thBase} text-right`}>Month paid</th>
                    <th className={`${thBase} text-right`}> </th>
                  </tr>
                </thead>
                <tbody>
                  {history.payouts.map((payout) => (
                    <tr
                      key={`${payout.monthKey}-${payout.id}`}
                      className="border-b border-solid [border-color:var(--pos-border-hairline)] last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-[var(--pos-text-2)]">
                        {payout.monthLabel}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-[var(--pos-text-1)]">
                        {formatDateKeyAsDisplay(payout.date)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-[var(--pos-text-2)]">
                        {staffLineKindLabel(payout.postedEmployeeLineKind)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono font-medium text-[var(--pos-text-1)]">
                        {formatWhole(payout.amount)}
                      </td>
                      <td className="max-w-[7rem] truncate px-2 py-2.5 text-[var(--pos-text-2)]">
                        {payout.note?.trim() ? payout.note.trim() : "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5">
                        {isSalaryPaymentPosted(payout) && payout.dailyEntryDate ? (
                          <button
                            type="button"
                            onClick={() => openDailyEntry(payout.dailyEntryDate)}
                            className="font-medium text-[var(--pos-text-1)] underline-offset-2 hover:underline"
                          >
                            Daily Entry
                          </button>
                        ) : (
                          <span className="text-[var(--pos-text-2)]">Manual / imported</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-[var(--pos-text-2)]">
                        {formatWhole(payout.runningPaidInMonth)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(payout)}
                          className="inline-flex size-8 items-center justify-center rounded-[8px] text-[var(--pos-text-2)] transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                          aria-label={`Remove payout on ${formatDateKeyAsDisplay(payout.date)}`}
                        >
                          <Trash2 className="size-3.5" strokeWidth={2} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <EmployeeFormModal
        title="Edit employee"
        open={editOpen}
        draft={draft}
        onChange={setDraft}
        onClose={() => {
          setEditOpen(false);
          setFormError(null);
        }}
        onSave={saveEdit}
        saveLabel="Save"
        error={formError}
      />

      <StaffPayoutModal
        open={payoutModalOpen}
        onClose={() => setPayoutModalOpen(false)}
        employeeId={resolvedEmployeeId}
        employeeName={displayName}
        onSaved={handlePayoutSaved}
      />

      {employeeDeleteOpen && employee ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Dismiss"
            onClick={closeEmployeeDelete}
          />
          <div
            className={`relative z-[1] w-full max-w-[400px] overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0} shadow-lg`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-employee-title"
          >
            <div className="border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
              <p id="delete-employee-title" className="flex items-center gap-2 text-[15px] font-semibold text-[var(--pos-text-1)]">
                <Lock className="size-4 shrink-0 text-[var(--pos-text-2)]" strokeWidth={2} aria-hidden />
                Delete employee?
              </p>
            </div>
            <div className="flex flex-col gap-3 px-4 py-4 text-[12px] text-[var(--pos-text-2)]">
              <p>
                Permanently remove{" "}
                <span className="font-semibold text-[var(--pos-text-1)]">{employee.name}</span> from the
                employee list. Salary history stays on file. This cannot be undone.
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                  Your password
                </span>
                <input
                  ref={employeeDeletePasswordRef}
                  type="password"
                  value={employeeDeletePassword}
                  onChange={(e) => {
                    setEmployeeDeletePassword(e.target.value);
                    if (employeeDeleteError) setEmployeeDeleteError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    void handleConfirmDeleteEmployee();
                  }}
                  autoComplete="current-password"
                  disabled={employeeDeleteBusy}
                  className="h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none disabled:opacity-50"
                  placeholder="Enter password to confirm"
                />
              </label>
              {employeeDeleteError ? (
                <p className="text-[12px] text-red-600 dark:text-red-400" role="alert">
                  {employeeDeleteError}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-solid [border-color:var(--pos-divider)] px-4 py-3">
              <button
                type="button"
                disabled={employeeDeleteBusy}
                onClick={closeEmployeeDelete}
                className="rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] px-3 py-2 text-[12px] font-medium text-[var(--pos-text-1)] hover:bg-[var(--pos-sidebar)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={employeeDeleteBusy || !employeeDeletePassword.trim()}
                onClick={() => void handleConfirmDeleteEmployee()}
                className="rounded-[8px] bg-red-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {employeeDeleteBusy ? "Deleting…" : "Delete employee"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Dismiss"
            onClick={() => !deleteBusy && setDeleteTarget(null)}
          />
          <div className={`relative z-[1] w-full max-w-[400px] overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0} shadow-lg`} role="dialog" aria-modal="true">
            <div className="border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
              <p className="text-[15px] font-semibold text-[var(--pos-text-1)]">Remove payout?</p>
            </div>
            <div className="flex flex-col gap-2 px-4 py-4 text-[12px] text-[var(--pos-text-2)]">
              <p>
                Remove <span className="font-mono font-semibold text-[var(--pos-text-1)]">{formatWhole(deleteTarget.amount)}</span> on{" "}
                <span className="font-medium text-[var(--pos-text-1)]">{formatDateKeyAsDisplay(deleteTarget.date)}</span>?
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-solid [border-color:var(--pos-divider)] px-4 py-3">
              <button type="button" disabled={deleteBusy} onClick={() => setDeleteTarget(null)} className="rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] px-3 py-2 text-[12px] font-medium text-[var(--pos-text-1)] hover:bg-[var(--pos-sidebar)] disabled:opacity-50">
                Cancel
              </button>
              <button type="button" disabled={deleteBusy} onClick={() => void handleConfirmDeletePayout()} className="rounded-[8px] bg-red-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {deleteBusy ? "Removing…" : "Remove payout"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
