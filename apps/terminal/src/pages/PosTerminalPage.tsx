import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/features/auth";
import {
  resolveInitialLeafId,
  writeStoredLastLeafId,
} from "../posSectionStorage";
import { PosSidebar } from "../components/pos/PosSidebar";
import { PosMobileNav } from "../components/pos/PosMobileNav";
import { PosMobileHeader } from "../components/pos/PosMobileHeader";
import { attemptPosLeave } from "@/features/daily-entry";
import {
  POS_OPEN_DAILY_ENTRY_EVENT,
  POS_OPEN_EMPLOYEE_SALARY_HISTORY_EVENT,
  POS_SELECT_LEAF_EVENT,
} from "../lib/posNavEvents";
import { todayDateKey } from "../lib/dateDisplay";
import { EmployeeModuleView, HR_PAYROLL_LEAF_IDS } from "../components/pos/EmployeeModuleView";
import {
  EmployeeDirectoryView,
  HR_DIRECTORY_LEAF_IDS,
} from "../components/pos/EmployeeDirectoryView";
import {
  LEDGER_LEAF_IDS,
  LedgerModuleView,
} from "../components/pos/LedgerModuleView";
import { DailyEntryFormView } from "../components/pos/DailyEntryFormView";
import {
  REPORT_LEAF_IDS,
  ReportsModuleView,
} from "../components/pos/ReportsModuleView";

export function PosTerminalPage() {
  const navigate = useNavigate();
  const { signOut, userName, activeBranch } = useSession();
  const [activeLeafId, setActiveLeafId] = useState(resolveInitialLeafId);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [dailyEntryOpenDateKey, setDailyEntryOpenDateKey] = useState<string | null>(null);
  const [dailyEntryStaffPayoutEmployeeId, setDailyEntryStaffPayoutEmployeeId] = useState<
    string | null
  >(null);
  const [employeeSalaryHistoryId, setEmployeeSalaryHistoryId] = useState<string | null>(null);
  const [employeeProfileReturnLeafId, setEmployeeProfileReturnLeafId] = useState<string | null>(null);

  const handleSelectLeaf = useCallback((leafId: string) => {
    if (leafId === activeLeafId) return;
    const proceed = () => setActiveLeafId(leafId);
    if (!attemptPosLeave(proceed)) return;
    proceed();
  }, [activeLeafId]);

  useEffect(() => {
    const onNav = (ev: Event) => {
      const detail = (ev as CustomEvent<{ leafId?: string }>).detail;
      if (detail?.leafId) handleSelectLeaf(detail.leafId);
    };
    window.addEventListener(POS_SELECT_LEAF_EVENT, onNav);
    return () => window.removeEventListener(POS_SELECT_LEAF_EVENT, onNav);
  }, [handleSelectLeaf]);

  useEffect(() => {
    const onOpenDailyEntry = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        dateKey?: string;
        leafId?: string;
        staffPayoutEmployeeId?: string;
      }>).detail;
      const staffPayoutEmployeeId = detail?.staffPayoutEmployeeId?.trim() || undefined;
      let dateKey = detail?.dateKey;
      if (dateKey && !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) dateKey = undefined;
      if (!dateKey) dateKey = todayDateKey();
      const open = () => {
        setActiveLeafId("exp-daily");
        setDailyEntryOpenDateKey(dateKey);
        setDailyEntryStaffPayoutEmployeeId(staffPayoutEmployeeId ?? null);
        setEmployeeSalaryHistoryId(null);
      };
      if (activeLeafId === "exp-daily") {
        open();
        return;
      }
      if (!attemptPosLeave(open)) return;
      open();
    };
    window.addEventListener(POS_OPEN_DAILY_ENTRY_EVENT, onOpenDailyEntry);
    return () => window.removeEventListener(POS_OPEN_DAILY_ENTRY_EVENT, onOpenDailyEntry);
  }, [activeLeafId]);

  useEffect(() => {
    const onOpenEmployeeHistory = (ev: Event) => {
      const detail = (ev as CustomEvent<{ employeeId?: string; leafId?: string }>).detail;
      const employeeId = detail?.employeeId?.trim();
      if (!employeeId) return;
      const open = () => {
        setEmployeeProfileReturnLeafId(activeLeafId);
        setActiveLeafId("hr-payroll");
        setEmployeeSalaryHistoryId(employeeId);
      };
      if (activeLeafId === "hr-payroll") {
        open();
        return;
      }
      if (!attemptPosLeave(open)) return;
      open();
    };
    window.addEventListener(POS_OPEN_EMPLOYEE_SALARY_HISTORY_EVENT, onOpenEmployeeHistory);
    return () =>
      window.removeEventListener(POS_OPEN_EMPLOYEE_SALARY_HISTORY_EVENT, onOpenEmployeeHistory);
  }, [activeLeafId]);

  useEffect(() => {
    writeStoredLastLeafId(activeLeafId);
  }, [activeLeafId]);

  const handleSignOut = () => {
    setSignOutConfirmOpen(true);
  };

  const cancelSignOut = () => {
    setSignOutConfirmOpen(false);
  };

  const confirmSignOut = () => {
    setSignOutConfirmOpen(false);
    const proceed = () => {
      signOut();
      navigate("/signin", { replace: true });
    };
    if (!attemptPosLeave(proceed)) return;
    proceed();
  };

  const mainContent = () => {
    if (LEDGER_LEAF_IDS.has(activeLeafId)) {
      const ledgerKey = activeLeafId === "lm-items" ? "lm-items" : "lm-cashbooks";
      return <LedgerModuleView key={ledgerKey} leafId={activeLeafId} />;
    }
    if (HR_DIRECTORY_LEAF_IDS.has(activeLeafId)) {
      return <EmployeeDirectoryView />;
    }
    if (HR_PAYROLL_LEAF_IDS.has(activeLeafId)) {
      return (
        <EmployeeModuleView
          initialEmployeeHistoryId={employeeSalaryHistoryId}
          profileReturnLeafId={employeeProfileReturnLeafId}
          onEmployeeHistoryConsumed={() => setEmployeeSalaryHistoryId(null)}
          onProfileReturn={(leafId) => {
            setEmployeeSalaryHistoryId(null);
            setEmployeeProfileReturnLeafId(null);
            setActiveLeafId(leafId);
          }}
        />
      );
    }
    if (activeLeafId === "exp-daily") {
      return (
        <DailyEntryFormView
          openDateKey={dailyEntryOpenDateKey}
          openStaffPayoutEmployeeId={dailyEntryStaffPayoutEmployeeId}
          onOpenDateKeyConsumed={() => setDailyEntryOpenDateKey(null)}
          onOpenStaffPayoutEmployeeIdConsumed={() => setDailyEntryStaffPayoutEmployeeId(null)}
        />
      );
    }
    if (REPORT_LEAF_IDS.has(activeLeafId)) {
      return <ReportsModuleView leafId={activeLeafId} />;
    }
    return (
      <DailyEntryFormView
        openDateKey={dailyEntryOpenDateKey}
        openStaffPayoutEmployeeId={dailyEntryStaffPayoutEmployeeId}
        onOpenDateKeyConsumed={() => setDailyEntryOpenDateKey(null)}
        onOpenStaffPayoutEmployeeIdConsumed={() => setDailyEntryStaffPayoutEmployeeId(null)}
      />
    );
  };

  const branchLabel = activeBranch?.name ?? "Restaurant";
  const branchAddress = activeBranch?.address ?? null;

  return (
    <div className="flex h-full w-full flex-col bg-[var(--pos-page)] text-[var(--pos-text-3)]">
      <PosMobileHeader
        branchName={branchLabel}
        branchAddress={branchAddress}
        onSignOut={handleSignOut}
      />

      <div className="relative flex min-h-0 flex-1 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <PosSidebar
          activeLeafId={activeLeafId}
          onSelectLeaf={handleSelectLeaf}
          onSignOut={handleSignOut}
          userName={userName}
          branchName={branchLabel}
          branchAddress={branchAddress}
        />

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col lg:pb-0">
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-2">
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {mainContent()}
            </main>
          </div>
        </div>
      </div>

      <PosMobileNav activeLeafId={activeLeafId} onSelectLeaf={handleSelectLeaf} />

      {signOutConfirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-out-confirm-title"
          className="fixed inset-0 z-[140] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={cancelSignOut}
        >
          <div
            className="w-full max-w-md rounded-t-[14px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-4 shadow-lg sm:rounded-[14px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="sign-out-confirm-title"
              className="text-[15px] font-semibold leading-tight text-[var(--pos-text-1)]"
            >
              Sign out?
            </h2>
            <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
              You will need to sign in again to continue using the terminal.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-3 text-[12px] font-semibold text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/30 sm:flex-none"
                onClick={cancelSignOut}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-9 min-w-[6.5rem] flex-1 items-center justify-center rounded-[8px] border border-solid border-red-500/55 bg-red-600 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 sm:flex-none"
                onClick={confirmSignOut}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
