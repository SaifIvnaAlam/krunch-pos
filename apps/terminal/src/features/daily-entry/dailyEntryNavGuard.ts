export type DailyEntryLeaveAction = () => void;

export type DailyEntryNavGuard = {
  /** True while the daily entry form is open for editing. */
  isEditing: boolean;
  hasUnsavedChanges: boolean;
  requestLeaveConfirmation: (
    proceed: DailyEntryLeaveAction,
    cancel?: DailyEntryLeaveAction,
  ) => void;
};

let activeGuard: DailyEntryNavGuard | null = null;

export function setDailyEntryNavGuard(guard: DailyEntryNavGuard | null): void {
  activeGuard = guard;
}

/** Returns false when navigation was deferred pending user confirmation. */
export function attemptPosLeave(proceed: DailyEntryLeaveAction): boolean {
  const guard = activeGuard;
  if (!guard?.isEditing || !guard.hasUnsavedChanges) {
    return true;
  }
  guard.requestLeaveConfirmation(proceed);
  return false;
}
