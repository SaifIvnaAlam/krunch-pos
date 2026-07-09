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
import { POS_SELECT_LEAF_EVENT } from "../lib/posNavEvents";
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
    writeStoredLastLeafId(activeLeafId);
  }, [activeLeafId]);

  const handleSignOut = () => {
    const proceed = () => {
      signOut();
      navigate("/signin", { replace: true });
    };
    if (!attemptPosLeave(proceed)) return;
    proceed();
  };

  const mainContent = () => {
    if (LEDGER_LEAF_IDS.has(activeLeafId)) {
      return <LedgerModuleView key={activeLeafId} leafId={activeLeafId} />;
    }
    if (HR_DIRECTORY_LEAF_IDS.has(activeLeafId)) {
      return <EmployeeDirectoryView />;
    }
    if (HR_PAYROLL_LEAF_IDS.has(activeLeafId)) {
      return <EmployeeModuleView />;
    }
    if (activeLeafId === "exp-daily") {
      return <DailyEntryFormView />;
    }
    if (REPORT_LEAF_IDS.has(activeLeafId)) {
      return <ReportsModuleView leafId={activeLeafId} />;
    }
    return <DailyEntryFormView />;
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
    </div>
  );
}
