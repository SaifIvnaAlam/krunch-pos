import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { formatDateKeyAsDisplay } from "../../lib/dateDisplay";
import {
  dispatchPosSelectLeaf,
  POS_OPEN_EMPLOYEE_SALARY_HISTORY_EVENT,
} from "../../lib/posNavEvents";
import { EmployeeSalaryHistoryView } from "./EmployeeSalaryHistoryView";
import { SalarySheetPanel } from "./SalarySheetPanel";
import {
  formatWhole,
  salaryHead,
  salaryShell,
  salaryStatCell,
  salaryStatLabel,
  salaryStatValue,
  salaryStats,
  salarySubtitle,
  salaryTitle,
  stillOwedTone,
} from "./salaryUiShared";
import { useSession } from "@/features/auth";
import {
  getEmployeeDirectoryLoadState,
  loadEmployeeDirectory,
  subscribeEmployeeDirectoryStore,
} from "@/features/employees";
import {
  getSalaryBundle,
  getEmployeeMonthBalance,
  getSalaryWorkspaceLoadState,
  getSalaryWorkspaceSaveState,
  reloadSalaryWorkspace,
  reconcileSalaryMonthFromDailyEntries,
  flushSalaryWorkspacePersist,
  setSalaryBundle,
  subscribeSalaryBundle,
  syncLoadedSalaryBundleToEmployees,
} from "@/features/payroll";
import {
  distributeServiceChargePool,
  emptySalarySheetBundle,
  ensureMonthDoc,
  isMonthKey,
  isSalarySheetLocked,
  labelFromMonthKey,
  monthKeyFromDate,
  summarizeSalaryDocWithPosting,
  sumPaymentsForRow,
  totalPayableForRow,
  type SalarySheetDoc,
  type SalarySheetRow,
} from "../../lib/salarySheetStorage";
import { useActiveEmployees } from "../../lib/employeeDirectoryStorage";

export const HR_PAYROLL_LEAF_IDS = new Set(["hr-payroll"]);

type PrimaryButtonProps = ComponentPropsWithoutRef<"button"> & {
  children: ReactNode;
  showPlus?: boolean;
};

function PrimaryButton({
  children,
  showPlus = true,
  className = "",
  type = "button",
  ...rest
}: PrimaryButtonProps) {
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

function parseMoneyInput(raw: string): number {
  const t = raw.replace(/,/g, "").trim();
  if (t === "") return 0;
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function normalizeMoneyDraft(raw: string): string {
  const t = raw.replace(/,/g, "").trim();
  if (t === "") return "";
  const digits = t.replace(/\D/g, "");
  if (digits === "") return "";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return monthKeyFromDate();
  return monthKeyFromDate(new Date(y, mo - 1 + delta, 1));
}

type EmployeeHistoryTarget = {
  employeeId: string;
  employeeName: string;
};

function resolveHistoryTarget(
  row: SalarySheetRow,
  employees: { id: string; name: string }[],
): EmployeeHistoryTarget {
  if (row.employeeId) {
    return { employeeId: row.employeeId, employeeName: row.name };
  }
  const norm = row.name.trim().toLowerCase();
  const hit = employees.find((e) => e.name.trim().toLowerCase() === norm);
  if (hit) return { employeeId: hit.id, employeeName: hit.name };
  return { employeeId: "", employeeName: row.name };
}

function PayrollSalaries({
  initialEmployeeHistoryId = null,
  profileReturnLeafId = null,
  onEmployeeHistoryConsumed,
  onProfileReturn,
}: {
  initialEmployeeHistoryId?: string | null;
  profileReturnLeafId?: string | null;
  onEmployeeHistoryConsumed?: () => void;
  onProfileReturn?: (leafId: string) => void;
}) {
  const { isSignedIn, userName } = useSession();
  const employees = useActiveEmployees();
  const employeeSyncKey = employees
    .map(
      (e) =>
        `${e.id}\t${e.name}\t${e.active}\t${e.serviceChargePct}\t${e.defaultBasicSalary}`,
    )
    .join("\n");

  const bundle = useSyncExternalStore(
    subscribeSalaryBundle,
    getSalaryBundle,
    getSalaryBundle,
  );
  const loadState = useSyncExternalStore(
    subscribeSalaryBundle,
    getSalaryWorkspaceLoadState,
    getSalaryWorkspaceLoadState,
  );
  const saveState = useSyncExternalStore(
    subscribeSalaryBundle,
    getSalaryWorkspaceSaveState,
    getSalaryWorkspaceSaveState,
  );
  const employeeLoadState = useSyncExternalStore(
    subscribeEmployeeDirectoryStore,
    getEmployeeDirectoryLoadState,
    getEmployeeDirectoryLoadState,
  );
  const [poolDraft, setPoolDraft] = useState("");
  const [historyTarget, setHistoryTarget] = useState<EmployeeHistoryTarget | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [generateMonthOpen, setGenerateMonthOpen] = useState(false);
  const [generateMonthDraft, setGenerateMonthDraft] = useState(monthKeyFromDate());
  const [deleteMonthTarget, setDeleteMonthTarget] = useState<string | null>(null);
  const [deleteMonthBusy, setDeleteMonthBusy] = useState(false);
  const [salaryLockModalOpen, setSalaryLockModalOpen] = useState(false);
  const [salaryUnlockModalOpen, setSalaryUnlockModalOpen] = useState(false);
  const [salaryLockBusy, setSalaryLockBusy] = useState(false);
  const [salarySheetNotice, setSalarySheetNotice] = useState<string | null>(null);
  const wasSignedInRef = useRef(isSignedIn);
  const monthPickerRef = useRef<HTMLDivElement>(null);

  const activeKey = bundle.selectedMonthKey;
  const doc = bundle.months[activeKey] ?? ensureMonthDoc(activeKey, undefined, employees);
  const isSheetLocked = isSalarySheetLocked(doc);

  useEffect(() => {
    if (!initialEmployeeHistoryId) return;
    const emp = employees.find((e) => e.id === initialEmployeeHistoryId);
    setHistoryTarget({
      employeeId: initialEmployeeHistoryId,
      employeeName: emp?.name ?? "",
    });
    onEmployeeHistoryConsumed?.();
  }, [initialEmployeeHistoryId, onEmployeeHistoryConsumed, employees]);

  useEffect(() => {
    const onOpenHistory = (ev: Event) => {
      const employeeId = (ev as CustomEvent<{ employeeId?: string }>).detail?.employeeId?.trim();
      if (!employeeId) return;
      const emp = employees.find((e) => e.id === employeeId);
      setHistoryTarget({
        employeeId,
        employeeName: emp?.name ?? "",
      });
    };
    window.addEventListener(POS_OPEN_EMPLOYEE_SALARY_HISTORY_EVENT, onOpenHistory);
    return () =>
      window.removeEventListener(POS_OPEN_EMPLOYEE_SALARY_HISTORY_EVENT, onOpenHistory);
  }, [employees]);

  useEffect(() => {
    void loadEmployeeDirectory();
    void reloadSalaryWorkspace();
  }, []);

  useEffect(() => {
    if (isSignedIn && !wasSignedInRef.current) {
      void reloadSalaryWorkspace();
    }
    wasSignedInRef.current = isSignedIn;
  }, [isSignedIn]);

  useEffect(() => {
    if (!loadState.loaded) return;
    void reconcileSalaryMonthFromDailyEntries(activeKey);
  }, [activeKey, loadState.loaded]);

  useEffect(() => {
    setSalarySheetNotice(null);
  }, [activeKey]);

  useEffect(() => {
    if (!loadState.loaded) return;
    const monthDoc = getSalaryBundle().months[activeKey];
    if (!monthDoc) {
      setPoolDraft("");
      return;
    }
    if (monthDoc.serviceChargePool != null && monthDoc.serviceChargePool > 0) {
      setPoolDraft(String(monthDoc.serviceChargePool));
      return;
    }
    const total = monthDoc.rows.reduce((sum, row) => sum + row.serviceCharge, 0);
    setPoolDraft(total > 0 ? String(total) : "");
  }, [activeKey, loadState.loaded]);

  useEffect(() => {
    if (!monthPickerOpen) return;
    function onPointerDown(ev: MouseEvent) {
      if (monthPickerRef.current && !monthPickerRef.current.contains(ev.target as Node)) {
        setMonthPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [monthPickerOpen]);

  const flushSalaryEdits = () => {
    void flushSalaryWorkspacePersist().catch(() => {
      /* loadError surfaced in UI */
    });
  };

  useEffect(() => {
    if (!loadState.loaded || !employeeLoadState.loaded) return;
    syncLoadedSalaryBundleToEmployees();
  }, [employeeSyncKey, loadState.loaded, employeeLoadState.loaded]);

  const patchDoc = (updater: (d: SalarySheetDoc) => SalarySheetDoc) => {
    setSalaryBundle((b) => {
      const key = b.selectedMonthKey;
      const cur = ensureMonthDoc(key, b.months[key], employees);
      if (isSalarySheetLocked(cur)) return b;
      const nextDoc = updater(cur);
      return {
        ...b,
        months: {
          ...b.months,
          [key]: {
            ...nextDoc,
            periodLabel: labelFromMonthKey(key),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  };

  const setMonthLockState = (locked: boolean) => {
    setSalaryBundle((b) => {
      const key = b.selectedMonthKey;
      const cur = ensureMonthDoc(key, b.months[key], employees);
      if (locked && isSalarySheetLocked(cur)) return b;
      if (!locked && !isSalarySheetLocked(cur)) return b;
      const now = new Date().toISOString();
      return {
        ...b,
        months: {
          ...b.months,
          [key]: locked
            ? {
                ...cur,
                isLocked: true,
                lockedAt: now,
                lockedBy: userName.trim() || "Unknown",
                updatedAt: now,
              }
            : {
                ...cur,
                isLocked: false,
                lockedAt: undefined,
                lockedBy: undefined,
                updatedAt: now,
              },
        },
      };
    });
  };

  async function executeLockSalarySheet() {
    setSalaryLockBusy(true);
    try {
      setMonthLockState(true);
      await flushSalaryWorkspacePersist();
      setSalaryLockModalOpen(false);
      setSalarySheetNotice(
        `${labelFromMonthKey(activeKey)} is locked — earnings can no longer be edited.`,
      );
    } catch {
      setSalarySheetNotice("Could not save lock state. Try again.");
    } finally {
      setSalaryLockBusy(false);
    }
  }

  async function executeUnlockSalarySheet() {
    setSalaryLockBusy(true);
    try {
      setMonthLockState(false);
      await flushSalaryWorkspacePersist();
      setSalaryUnlockModalOpen(false);
      setSalarySheetNotice(
        `${labelFromMonthKey(activeKey)} is unlocked — you can edit earnings again.`,
      );
    } catch {
      setSalarySheetNotice("Could not save unlock state. Try again.");
    } finally {
      setSalaryLockBusy(false);
    }
  }

  /** Switch to an existing sheet only — never creates a new month. */
  const selectMonth = (monthKey: string) => {
    if (!isMonthKey(monthKey)) return;
    if (!bundle.months[monthKey]) return;
    setMonthPickerOpen(false);
    setSalaryBundle((b) => ({
      ...b,
      selectedMonthKey: monthKey,
    }));
  };

  /** Explicitly create (or open) a salary sheet for the chosen month. */
  const generateMonth = (monthKey: string) => {
    if (!isMonthKey(monthKey)) return;
    const alreadyExists = Boolean(bundle.months[monthKey]);
    setGenerateMonthOpen(false);
    setMonthPickerOpen(false);
    setSalaryBundle((b) => ({
      ...b,
      selectedMonthKey: monthKey,
      months: {
        ...b.months,
        [monthKey]: ensureMonthDoc(monthKey, b.months[monthKey], employees),
      },
    }));
    setSalarySheetNotice(
      alreadyExists
        ? `Opened ${labelFromMonthKey(monthKey)}.`
        : `Generated salary sheet for ${labelFromMonthKey(monthKey)}.`,
    );
  };

  function openDeleteMonthModal(monthKey: string) {
    if (!isMonthKey(monthKey) || !bundle.months[monthKey]) return;
    setMonthPickerOpen(false);
    setDeleteMonthTarget(monthKey);
  }

  async function executeDeleteMonth() {
    const monthKey = deleteMonthTarget;
    if (!monthKey || !isMonthKey(monthKey) || deleteMonthBusy) return;
    setDeleteMonthBusy(true);
    try {
      const label = labelFromMonthKey(monthKey);
      setSalaryBundle((b) => {
        if (!b.months[monthKey]) return b;
        const remaining = { ...b.months };
        delete remaining[monthKey];
        const remainingKeys = Object.keys(remaining).filter(isMonthKey).sort();
        if (remainingKeys.length === 0) {
          return emptySalarySheetBundle(monthKeyFromDate(), employees);
        }
        let nextSelected = b.selectedMonthKey;
        if (nextSelected === monthKey || !remaining[nextSelected]) {
          const older = remainingKeys.filter((k) => k < monthKey);
          const newer = remainingKeys.filter((k) => k > monthKey);
          nextSelected =
            older[older.length - 1] ?? newer[0] ?? remainingKeys[remainingKeys.length - 1]!;
        }
        return { selectedMonthKey: nextSelected, months: remaining };
      });
      await flushSalaryWorkspacePersist();
      setDeleteMonthTarget(null);
      setSalarySheetNotice(`Deleted salary sheet for ${label}.`);
    } catch {
      setSalarySheetNotice("Could not delete month. Try again.");
    } finally {
      setDeleteMonthBusy(false);
    }
  }

  const monthOverviewRows = useMemo(() => {
    return Object.keys(bundle.months)
      .filter(isMonthKey)
      .sort((a, b) => b.localeCompare(a))
      .map((monthKey) => {
        const d = bundle.months[monthKey]!;
        const s = summarizeSalaryDocWithPosting(d);
        return { monthKey, label: labelFromMonthKey(monthKey), ...s };
      });
  }, [bundle.months]);

  const existingMonthKeysAsc = useMemo(
    () => monthOverviewRows.map((r) => r.monthKey).slice().reverse(),
    [monthOverviewRows],
  );

  const activeMonthIndex = existingMonthKeysAsc.indexOf(activeKey);
  const prevExistingMonthKey =
    activeMonthIndex > 0 ? existingMonthKeysAsc[activeMonthIndex - 1]! : null;
  const nextExistingMonthKey =
    activeMonthIndex >= 0 && activeMonthIndex < existingMonthKeysAsc.length - 1
      ? existingMonthKeysAsc[activeMonthIndex + 1]!
      : null;

  function openGenerateMonthModal() {
    const current = monthKeyFromDate();
    const latest = existingMonthKeysAsc[existingMonthKeysAsc.length - 1];
    const suggestion =
      !bundle.months[current]
        ? current
        : latest
          ? shiftMonthKey(latest, 1)
          : current;
    setGenerateMonthDraft(suggestion);
    setMonthPickerOpen(false);
    setGenerateMonthOpen(true);
  }

  const totals = useMemo(() => {
    let basic = 0;
    let sc = 0;
    let ot = 0;
    let eid = 0;
    let fines = 0;
    let payable = 0;
    let paid = 0;
    let stillOwed = 0;
    let unpaidCount = 0;
    for (const r of doc.rows) {
      basic += r.basic;
      sc += r.serviceCharge;
      ot += r.overtime;
      eid += r.eidBonus;
      fines += r.fines;
      payable += totalPayableForRow(r);
      paid += sumPaymentsForRow(r);
      const owed = getEmployeeMonthBalance(bundle, activeKey, r.employeeId)?.stillOwed ?? 0;
      stillOwed += owed;
      if (owed > 0) unpaidCount += 1;
    }
    return { basic, sc, ot, eid, fines, payable, paid, stillOwed, unpaidCount };
  }, [doc.rows, bundle, activeKey]);

  const monthLabel = labelFromMonthKey(activeKey);
  const needsTeamSetup = employees.length === 0;
  const deleteTargetDoc =
    deleteMonthTarget && bundle.months[deleteMonthTarget]
      ? bundle.months[deleteMonthTarget]
      : null;
  const deleteTargetPaid = deleteTargetDoc
    ? deleteTargetDoc.rows.reduce((sum, r) => sum + sumPaymentsForRow(r), 0)
    : 0;
  const deleteTargetLocked = isSalarySheetLocked(deleteTargetDoc ?? undefined);

  const updateRow = (id: string, patch: Partial<SalarySheetRow>) => {
    patchDoc((d) => ({
      ...d,
      rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const rowsWithServiceChargePool = (rows: SalarySheetRow[], poolDraftValue: string) => {
    const pool = parseMoneyInput(poolDraftValue);
    if (pool <= 0) return rows;
    const shares = distributeServiceChargePool(rows, pool);
    return rows.map((r) => ({ ...r, serviceCharge: shares.get(r.id) ?? 0 }));
  };

  const handlePoolDraftChange = (raw: string) => {
    const draft = normalizeMoneyDraft(raw);
    setPoolDraft(draft);
    patchDoc((d) => {
      if (draft === "") {
        return {
          ...d,
          serviceChargePool: undefined,
          rows: d.rows.map((r) => ({ ...r, serviceCharge: 0 })),
        };
      }
      const pool = parseMoneyInput(draft);
      return {
        ...d,
        serviceChargePool: pool,
        rows: rowsWithServiceChargePool(d.rows, draft),
      };
    });
  };

  function openEmployeeHistory(row: SalarySheetRow) {
    setHistoryTarget(resolveHistoryTarget(row, employees));
  }

  function closeEmployeeProfile() {
    if (profileReturnLeafId && profileReturnLeafId !== "hr-payroll") {
      onProfileReturn?.(profileReturnLeafId);
      return;
    }
    setHistoryTarget(null);
  }

  function handleEmployeeRemovedFromProfile() {
    if (profileReturnLeafId && profileReturnLeafId !== "hr-payroll") {
      onProfileReturn?.(profileReturnLeafId);
      return;
    }
    setHistoryTarget(null);
  }

  const profileBackLabel =
    profileReturnLeafId === "hr-employees" ? "Employee Management" : "Employee Salaries";

  if (historyTarget) {
    return (
      <EmployeeSalaryHistoryView
        employeeId={historyTarget.employeeId}
        employeeName={historyTarget.employeeName}
        backLabel={profileBackLabel}
        onBack={closeEmployeeProfile}
        onSelectMonth={(monthKey) => {
          selectMonth(monthKey);
          setHistoryTarget(null);
        }}
        onEmployeeRemoved={handleEmployeeRemovedFromProfile}
      />
    );
  }

  if (needsTeamSetup && !loadState.loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className={`${salaryShell} items-center justify-center px-6 py-12 text-center`}>
          <div className="flex size-12 items-center justify-center rounded-full bg-[var(--pos-sidebar)]">
            <Users className="size-6 text-[var(--pos-text-2)]" strokeWidth={1.75} aria-hidden />
          </div>
          <h2 className="mt-4 text-[15px] font-semibold text-[var(--pos-text-1)]">
            Add your team first
          </h2>
          <p className="mt-2 max-w-[360px] text-[13px] leading-relaxed text-[var(--pos-text-2)]">
            Employee Salaries uses your roster from Employee Management. Add staff there, then set
            monthly earnings here and record payouts from Daily Entry.
          </p>
          <PrimaryButton
            type="button"
            showPlus={false}
            className="mt-6"
            onClick={() => dispatchPosSelectLeaf("hr-employees")}
          >
            Go to Employee Management
            <ArrowRight className="size-3.5" strokeWidth={2} />
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const lockBtnClass = isSheetLocked
    ? "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-solid border-emerald-500/50 bg-emerald-500/10 px-3 text-[13px] font-semibold text-emerald-800 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    : "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-solid border-amber-500/50 bg-amber-500/10 px-3 text-[13px] font-semibold text-amber-800 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={salaryShell}>
        {/* Header */}
        <div className={salaryHead}>
          <div className="min-w-0">
            <h1 className={salaryTitle}>Employee Salaries</h1>
            <p className={`mt-0.5 ${salarySubtitle}`}>
              {employees.length} staff · Set earnings here · Pay from{" "}
              <button
                type="button"
                onClick={() => dispatchPosSelectLeaf("exp-daily")}
                className="font-medium text-[var(--pos-text-1)] underline-offset-2 hover:underline"
              >
                Daily Entry
              </button>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Month navigation — only among sheets that already exist */}
            <div className="flex items-center rounded-[9px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-sidebar)]/30">
              <button
                type="button"
                disabled={!prevExistingMonthKey}
                onClick={() => prevExistingMonthKey && selectMonth(prevExistingMonthKey)}
                className="inline-flex size-8 items-center justify-center rounded-l-[8px] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-sidebar)] hover:text-[var(--pos-text-1)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" strokeWidth={2} />
              </button>
              <div ref={monthPickerRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMonthPickerOpen((v) => !v)}
                  className="inline-flex h-9 min-w-[120px] items-center justify-center gap-1 border-x border-solid [border-color:var(--pos-divider)] px-3 text-[14px] font-semibold text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-sidebar)]/60"
                  aria-expanded={monthPickerOpen}
                  aria-haspopup="listbox"
                >
                  {monthLabel}
                  <ChevronDown
                    className={`size-3.5 text-[var(--pos-text-2)] transition-transform ${monthPickerOpen ? "rotate-180" : ""}`}
                    strokeWidth={2}
                  />
                </button>
                {monthPickerOpen ? (
                  <ul
                    role="listbox"
                    aria-label="Select month"
                    className="absolute right-0 top-full z-20 mt-1 max-h-[240px] min-w-[200px] overflow-y-auto rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] py-1 shadow-lg"
                  >
                    {monthOverviewRows.length === 0 ? (
                      <li className="px-3 py-2.5 text-[13px] text-[var(--pos-text-2)]">
                        No sheets yet
                      </li>
                    ) : (
                      monthOverviewRows.map((row) => (
                        <li key={row.monthKey} role="option" aria-selected={row.monthKey === activeKey}>
                          <div
                            className={`flex w-full items-center gap-1 px-1 py-0.5 ${
                              row.monthKey === activeKey
                                ? "bg-[var(--pos-nav-active-bg)]/12"
                                : ""
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => selectMonth(row.monthKey)}
                              className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[6px] px-2 py-2 text-left text-[13px] transition-colors hover:bg-[var(--pos-sidebar)]/60 ${
                                row.monthKey === activeKey
                                  ? "font-semibold text-[var(--pos-text-1)]"
                                  : "text-[var(--pos-text-2)]"
                              }`}
                            >
                              <span className="truncate">{row.label}</span>
                              {row.outstanding > 0 ? (
                                <span className="shrink-0 font-mono text-[11px] text-red-600 dark:text-red-400">
                                  ৳{formatWhole(row.outstanding)} due
                                </span>
                              ) : (
                                <span className="shrink-0 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                                  Settled
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteMonthModal(row.monthKey);
                              }}
                              className="inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--pos-text-2)] transition-colors hover:bg-red-500/10 hover:text-red-700"
                              aria-label={`Delete ${row.label}`}
                              title="Delete month"
                            >
                              <Trash2 className="size-3.5" strokeWidth={2} />
                            </button>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
              <button
                type="button"
                disabled={!nextExistingMonthKey}
                onClick={() => nextExistingMonthKey && selectMonth(nextExistingMonthKey)}
                className="inline-flex size-8 items-center justify-center rounded-r-[8px] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-sidebar)] hover:text-[var(--pos-text-1)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next month"
              >
                <ChevronRight className="size-4" strokeWidth={2} />
              </button>
            </div>

            <PrimaryButton
              type="button"
              className="h-10 px-3 text-[13px]"
              onClick={openGenerateMonthModal}
            >
              New month
            </PrimaryButton>

            <button
              type="button"
              disabled={!bundle.months[activeKey] || deleteMonthBusy}
              onClick={() => openDeleteMonthModal(activeKey)}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-solid border-red-500/40 bg-red-500/5 px-3 text-[13px] font-semibold text-red-700 transition-opacity hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Delete ${monthLabel}`}
            >
              <Trash2 className="size-3.5" strokeWidth={2.25} aria-hidden />
              Delete
            </button>

            <button
              type="button"
              disabled={salaryLockBusy}
              onClick={() => (isSheetLocked ? setSalaryUnlockModalOpen(true) : setSalaryLockModalOpen(true))}
              className={lockBtnClass}
            >
              {isSheetLocked ? (
                <>
                  <LockOpen className="size-3.5" strokeWidth={2.25} aria-hidden />
                  Unlock
                </>
              ) : (
                <>
                  <Lock className="size-3.5" strokeWidth={2.25} aria-hidden />
                  Lock month
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className={salaryStats}>
          <div className={salaryStatCell}>
            <p className={salaryStatLabel}>Payable</p>
            <p className={`mt-0.5 ${salaryStatValue}`}>
              ৳{formatWhole(totals.payable)}
            </p>
          </div>
          <div className={salaryStatCell}>
            <p className={salaryStatLabel}>Paid</p>
            <p className={`mt-0.5 ${salaryStatValue}`}>
              ৳{formatWhole(totals.paid)}
            </p>
          </div>
          <div className={salaryStatCell}>
            <p className={salaryStatLabel}>Due</p>
            <p
              className={`mt-0.5 ${salaryStatValue} ${stillOwedTone(totals.payable, totals.paid, totals.stillOwed)}`}
            >
              ৳{formatWhole(totals.stillOwed)}
            </p>
          </div>
          <div className={salaryStatCell}>
            <p className={salaryStatLabel}>Unpaid staff</p>
            <p className={`mt-0.5 ${salaryStatValue}`}>
              {totals.unpaidCount}
              <span className="ml-1 text-[12px] font-normal text-[var(--pos-text-2)]">
                / {doc.rows.length}
              </span>
            </p>
          </div>
        </div>

        {/* Status notices */}
        {loadState.error ? (
          <p className="border-b border-solid [border-color:var(--pos-divider)] px-4 py-2 text-[13px] text-red-600 dark:text-red-400" role="alert">
            {loadState.error}
          </p>
        ) : null}
        {salarySheetNotice ? (
          <div className="flex items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-sidebar)]/30 px-4 py-2">
            <p className="text-[13px] text-[var(--pos-text-1)]" role="status">
              {salarySheetNotice}
            </p>
            <button
              type="button"
              onClick={() => setSalarySheetNotice(null)}
              className="shrink-0 text-[12px] font-medium text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {isSheetLocked ? (
          <div
            className="border-b border-solid border-l-4 border-l-amber-400 [border-color:var(--pos-divider)] bg-amber-500/10 px-4 py-2"
            role="status"
          >
            <p className="text-[13px] font-medium text-amber-900 dark:text-amber-100">
              {monthLabel} is locked
              {doc.lockedBy ? ` by ${doc.lockedBy}` : ""} — earnings cannot be edited.
            </p>
          </div>
        ) : null}

        {/* Sheet body */}
        <SalarySheetPanel
          doc={doc}
          bundle={bundle}
          activeKey={activeKey}
          monthLabel={monthLabel}
          totals={totals}
          poolDraft={poolDraft}
          employees={employees}
          isSheetLocked={isSheetLocked}
          saveState={saveState}
          onPoolDraftChange={handlePoolDraftChange}
          onUpdateRow={updateRow}
          onFlushEdits={flushSalaryEdits}
          onOpenHistory={openEmployeeHistory}
          onPayoutSaved={(result) =>
            setSalarySheetNotice(
              `Recorded ৳${formatWhole(result.amount)} for ${result.employeeName} on ${formatDateKeyAsDisplay(result.dailyEntryDate)}.`,
            )
          }
        />
      </div>

      {salaryLockModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lock-salary-sheet-title"
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setSalaryLockModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="lock-salary-sheet-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              Lock {monthLabel}?
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
              Locked months cannot have earnings edited. Payouts can still be recorded from Daily
              Entry or the Pay button.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                onClick={() => setSalaryLockModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={salaryLockBusy}
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-solid border-amber-500/55 bg-amber-500/90 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                onClick={() => void executeLockSalarySheet()}
              >
                <Lock className="size-3.5" strokeWidth={2.25} />
                {salaryLockBusy ? "Locking…" : "Lock month"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {salaryUnlockModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unlock-salary-sheet-title"
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setSalaryUnlockModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="unlock-salary-sheet-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              Unlock {monthLabel}?
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
              You will be able to edit fines, overtime, bonus, and service charge again.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                onClick={() => setSalaryUnlockModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={salaryLockBusy}
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-solid border-emerald-500/55 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-800 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                onClick={() => void executeUnlockSalarySheet()}
              >
                <LockOpen className="size-3.5" strokeWidth={2.25} />
                {salaryLockBusy ? "Unlocking…" : "Unlock month"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {generateMonthOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="generate-salary-month-title"
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setGenerateMonthOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="generate-salary-month-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              Generate salary sheet
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
              Choose the month to create. Existing sheets are not changed — use the month list to
              open them.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--pos-text-2)]">
                Month
              </span>
              <input
                type="month"
                value={generateMonthDraft}
                onChange={(e) => setGenerateMonthDraft(e.target.value)}
                className="h-10 w-full rounded-[8px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 text-[14px] font-medium text-[var(--pos-text-1)] outline-none focus:border-[var(--pos-text-2)]"
              />
            </label>
            {isMonthKey(generateMonthDraft) && bundle.months[generateMonthDraft] ? (
              <p className="mt-2 text-[12px] text-amber-800 dark:text-amber-300">
                {labelFromMonthKey(generateMonthDraft)} already exists — Generate will open it.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                onClick={() => setGenerateMonthOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!isMonthKey(generateMonthDraft)}
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-[var(--pos-text-1)] px-3 text-[12px] font-semibold text-[var(--pos-page)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                onClick={() => generateMonth(generateMonthDraft)}
              >
                <Plus className="size-3.5" strokeWidth={2} />
                {bundle.months[generateMonthDraft] ? "Open month" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteMonthTarget && deleteTargetDoc ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-salary-month-title"
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => !deleteMonthBusy && setDeleteMonthTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-salary-month-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              Delete {labelFromMonthKey(deleteMonthTarget)}?
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
              This removes the salary sheet for that month. You can generate it again later if
              needed.
            </p>
            {deleteTargetLocked ? (
              <p className="mt-2 text-[12px] font-medium text-amber-800 dark:text-amber-300">
                This month is locked. Deleting it still removes the sheet permanently.
              </p>
            ) : null}
            {deleteTargetPaid > 0 ? (
              <p className="mt-2 text-[12px] font-medium text-red-700 dark:text-red-400">
                This sheet has ৳{formatWhole(deleteTargetPaid)} in recorded payouts. Daily Entry
                lines are not deleted, but salary history for this month will be gone.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={deleteMonthBusy}
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 disabled:opacity-40 sm:flex-none"
                onClick={() => setDeleteMonthTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMonthBusy}
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-solid border-red-500/55 bg-red-600 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                onClick={() => void executeDeleteMonth()}
              >
                <Trash2 className="size-3.5" strokeWidth={2.25} />
                {deleteMonthBusy ? "Deleting…" : "Delete month"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EmployeeModuleView({
  initialEmployeeHistoryId = null,
  profileReturnLeafId = null,
  onEmployeeHistoryConsumed,
  onProfileReturn,
}: {
  initialEmployeeHistoryId?: string | null;
  profileReturnLeafId?: string | null;
  onEmployeeHistoryConsumed?: () => void;
  onProfileReturn?: (leafId: string) => void;
} = {}) {
  return (
    <PayrollSalaries
      initialEmployeeHistoryId={initialEmployeeHistoryId}
      profileReturnLeafId={profileReturnLeafId}
      onEmployeeHistoryConsumed={onEmployeeHistoryConsumed}
      onProfileReturn={onProfileReturn}
    />
  );
}
