import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import {
  hasPermission,
  PERM_STAFF_CREATE,
  PERM_STAFF_EDIT,
  PERM_STAFF_READ,
  useSession,
} from "@/features/auth";
import { ApiRequestError } from "@/features/api-client";
import {
  createStaff,
  listStaff,
  updateStaff,
  type PortalRoleTier,
  type StaffListItemDto,
} from "@/features/staff/staffApi";
import {
  salaryShell,
  sheetTableWrap,
  sheetTd,
  sheetTh,
} from "./salaryUiShared";

export const USERS_ACCESS_LEAF_IDS = new Set(["hr-users"]);

const fieldClass =
  "h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none";

const ROLE_CAPABILITIES: Record<
  PortalRoleTier,
  { summary: string; canSee: string[]; canDo: string[]; cannot: string[] }
> = {
  admin: {
    summary: "Full access, including Users & Access",
    canSee: [
      "Daily Entry, expenses, item purchases, other expenses",
      "Employee Management and Employee Salaries",
      "Reports",
      "Users & Access (portal accounts)",
    ],
    canDo: [
      "Create, edit, and save all day-to-day restaurant data",
      "Add users, reset passwords, deactivate / reactivate accounts",
      "Choose Admin or Manager when inviting someone",
    ],
    cannot: ["Deactivate their own account"],
  },
  manager: {
    summary: "Day-to-day input only",
    canSee: [
      "Daily Entry, expenses, item purchases, other expenses",
      "Employee Management and Employee Salaries",
      "Reports",
    ],
    canDo: [
      "Create, edit, and save day-to-day restaurant data",
      "Enter expenses, purchases, payroll, and daily figures",
    ],
    cannot: [
      "Open Users & Access",
      "Add, reset, or deactivate portal users",
      "Change system settings",
    ],
  },
};

function RoleTierOption({
  tier,
  selected,
  expanded,
  onSelect,
  onToggleDetails,
}: {
  tier: PortalRoleTier;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggleDetails: () => void;
}) {
  const info = ROLE_CAPABILITIES[tier];
  const title = tier === "admin" ? "Admin" : "Manager";
  const detailsId = `role-tier-details-${tier}`;

  return (
    <div className="rounded-[8px] border border-solid [border-color:var(--pos-divider)] px-2.5 py-2">
      <div className="flex items-start gap-2">
        <label className="flex min-w-0 flex-1 items-start gap-2 text-[12px] text-[var(--pos-text-1)]">
          <input
            type="radio"
            name="roleTier"
            checked={selected}
            onChange={onSelect}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="font-medium">{title}</span>
            <span className="mt-0.5 block text-[11px] text-[var(--pos-text-2)]">{info.summary}</span>
          </span>
        </label>
        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={expanded}
          aria-controls={detailsId}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-[6px] px-1.5 py-1 text-[11px] font-medium text-[var(--pos-text-2)] hover:bg-[var(--pos-sidebar)] hover:text-[var(--pos-text-1)]"
        >
          What they can do
          <ChevronDown
            className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2}
          />
        </button>
      </div>
      {expanded ? (
        <div
          id={detailsId}
          className="mt-2 border-t border-solid [border-color:var(--pos-divider)] pt-2 text-[11px] leading-snug text-[var(--pos-text-2)]"
        >
          <p className="font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
            Can see
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--pos-text-1)]">
            {info.canSee.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-2 font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
            Can do
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--pos-text-1)]">
            {info.canDo.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-2 font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
            Cannot
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--pos-text-1)]">
            {info.cannot.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
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
      className={`inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--pos-text-1)] px-3 py-2 text-[12px] font-medium text-[var(--pos-page)] transition-opacity hover:opacity-90 disabled:opacity-50 ${className}`}
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
      className={`rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-3 py-2 text-[12px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-sidebar)] disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

function tierLabel(tier: PortalRoleTier | null): string {
  if (tier === "admin") return "Admin";
  if (tier === "manager") return "Manager";
  return "—";
}

type AddDraft = {
  name: string;
  email: string;
  password: string;
  roleTier: PortalRoleTier;
};
type ResetDraft = { staffId: string; name: string; password: string };

export function UsersAccessView() {
  const { accessToken, staffId, permissions } = useSession();
  const canRead = hasPermission(permissions, PERM_STAFF_READ);
  const canCreate = hasPermission(permissions, PERM_STAFF_CREATE);
  const canEdit = hasPermission(permissions, PERM_STAFF_EDIT);

  const [staff, setStaff] = useState<StaffListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<AddDraft>({
    name: "",
    email: "",
    password: "",
    roleTier: "manager",
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [expandedTier, setExpandedTier] = useState<Partial<Record<PortalRoleTier, boolean>>>({});

  const [resetDraft, setResetDraft] = useState<ResetDraft | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken) {
      setLoadError("Sign in again to manage users.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listStaff(accessToken);
      setStaff(res.staff);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      setLoadError("You do not have permission to manage portal users.");
      return;
    }
    void reload();
  }, [reload, canRead]);

  const visible = useMemo(
    () => (showInactive ? staff : staff.filter((s) => s.isActive)),
    [staff, showInactive],
  );
  const activeCount = staff.filter((s) => s.isActive).length;

  const openAdd = () => {
    setAddDraft({
      name: "",
      email: "",
      password: generateTempPassword(),
      roleTier: "manager",
    });
    setExpandedTier({});
    setAddError(null);
    setRevealedPassword(null);
    setAddOpen(true);
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAddError(null);
  };

  const saveAdd = async () => {
    if (!accessToken) return;
    const name = addDraft.name.trim();
    const email = addDraft.email.trim();
    const password = addDraft.password.trim();
    if (!name) {
      setAddError("Name is required.");
      return;
    }
    if (!email) {
      setAddError("Email is required.");
      return;
    }
    if (password.length < 8) {
      setAddError("Password must be at least 8 characters.");
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      const created = await createStaff(accessToken, {
        name,
        email,
        password,
        roleTier: addDraft.roleTier,
      });
      setRevealedPassword(password);
      setStatusMessage(
        `Created ${created.name} (${tierLabel(created.roleTier)}). Share the temporary password now — it won’t be shown again.`,
      );
      closeAdd();
      await reload();
    } catch (err) {
      setAddError(errorMessage(err));
    } finally {
      setAddSaving(false);
    }
  };

  const openReset = (row: StaffListItemDto) => {
    setResetDraft({
      staffId: row.id,
      name: row.name,
      password: generateTempPassword(),
    });
    setResetError(null);
    setRevealedPassword(null);
  };

  const closeReset = () => {
    setResetDraft(null);
    setResetError(null);
  };

  const saveReset = async () => {
    if (!accessToken || !resetDraft) return;
    const password = resetDraft.password.trim();
    if (password.length < 8) {
      setResetError("Password must be at least 8 characters.");
      return;
    }
    setResetSaving(true);
    setResetError(null);
    try {
      await updateStaff(accessToken, resetDraft.staffId, { password });
      setRevealedPassword(password);
      setStatusMessage(
        `Password reset for ${resetDraft.name}. Share it now — it won’t be shown again.`,
      );
      closeReset();
    } catch (err) {
      setResetError(errorMessage(err));
    } finally {
      setResetSaving(false);
    }
  };

  const toggleActive = async (row: StaffListItemDto) => {
    if (!accessToken) return;
    const nextActive = !row.isActive;
    setBusyId(row.id);
    setStatusMessage(null);
    try {
      await updateStaff(accessToken, row.id, { isActive: nextActive });
      setStatusMessage(
        nextActive
          ? `Reactivated ${row.name}.`
          : `Deactivated ${row.name}. They can no longer sign in.`,
      );
      await reload();
    } catch (err) {
      setStatusMessage(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const copyPassword = async () => {
    if (!revealedPassword) return;
    try {
      await navigator.clipboard.writeText(revealedPassword);
      setStatusMessage("Password copied to clipboard.");
    } catch {
      setStatusMessage("Could not copy — select and copy the password manually.");
    }
  };

  if (!canRead) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-1">
        <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">Users &amp; Access</h1>
        <p className="text-[12px] text-red-600 dark:text-red-400" role="alert">
          Managers cannot manage portal users. Ask an Admin if you need access changes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden pr-1">
      <div className="shrink-0">
        <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">Users &amp; Access</h1>
        <p className="mt-1 max-w-[52rem] text-[12px] leading-snug text-[var(--pos-text-2)]">
          Add people who can sign in. Admins manage users; Managers enter day-to-day data only.
        </p>
      </div>

      {loading ? (
        <p className="text-[12px] text-[var(--pos-text-2)]" role="status">
          Loading users…
        </p>
      ) : null}
      {loadError ? (
        <p className="text-[12px] text-red-600 dark:text-red-400" role="status">
          {loadError}
        </p>
      ) : null}

      {revealedPassword ? (
        <div
          className="shrink-0 rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-3 py-3"
          role="status"
        >
          <p className="text-[12px] font-medium text-[var(--pos-text-1)]">Temporary password</p>
          <p className="mt-1 font-mono text-[14px] tracking-wide text-[var(--pos-text-1)]">
            {revealedPassword}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <GhostButton type="button" onClick={() => void copyPassword()}>
              Copy password
            </GhostButton>
            <GhostButton type="button" onClick={() => setRevealedPassword(null)}>
              Dismiss
            </GhostButton>
          </div>
        </div>
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
          {canCreate ? (
            <PrimaryButton type="button" onClick={openAdd}>
              Add user
            </PrimaryButton>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className={sheetTableWrap}>
            <table className="w-full min-w-[720px] table-fixed border-collapse">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[24%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[32%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className={sheetTh}>Name</th>
                  <th className={sheetTh}>Email</th>
                  <th className={sheetTh}>Access</th>
                  <th className={sheetTh}>Status</th>
                  <th className={`${sheetTh} text-center`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`${sheetTd} py-6 text-center text-[var(--pos-text-2)]`}>
                      No portal users yet. Add someone so they can sign in.
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => {
                    const isSelf = Boolean(staffId && row.id === staffId);
                    return (
                      <tr key={row.id}>
                        <td className={`${sheetTd} max-w-0 truncate`}>{row.name}</td>
                        <td className={`${sheetTd} max-w-0 truncate`}>
                          {row.email ?? "—"}
                        </td>
                        <td className={sheetTd}>{tierLabel(row.roleTier)}</td>
                        <td className={sheetTd}>{row.isActive ? "Active" : "Inactive"}</td>
                        <td className={`${sheetTd} text-center`}>
                          {canEdit ? (
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              <button
                                type="button"
                                className="text-[12px] font-medium text-[var(--pos-text-1)] underline-offset-2 hover:underline disabled:opacity-50"
                                disabled={busyId === row.id || !row.email}
                                onClick={() => openReset(row)}
                              >
                                Reset password
                              </button>
                              <button
                                type="button"
                                className="text-[12px] font-medium text-[var(--pos-text-1)] underline-offset-2 hover:underline disabled:opacity-50"
                                disabled={busyId === row.id || (row.isActive && isSelf)}
                                title={
                                  row.isActive && isSelf
                                    ? "You cannot deactivate your own account"
                                    : undefined
                                }
                                onClick={() => void toggleActive(row)}
                              >
                                {row.isActive ? "Deactivate" : "Reactivate"}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[12px] text-[var(--pos-text-2)]">View only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {addOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Dismiss"
            onClick={closeAdd}
          />
          <div
            className="relative z-[1] max-h-[min(90vh,720px)] w-full max-w-[480px] overflow-y-auto rounded-[14px] border-[0.5px] border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-card)] shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-user-title"
          >
            <div className="flex items-start justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
              <p id="add-user-title" className="text-[15px] font-semibold text-[var(--pos-text-1)]">
                Add user
              </p>
              <button
                type="button"
                onClick={closeAdd}
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
                  value={addDraft.name}
                  onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })}
                  className={fieldClass}
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                  Email
                </span>
                <input
                  type="email"
                  value={addDraft.email}
                  onChange={(e) => setAddDraft({ ...addDraft, email: e.target.value })}
                  className={fieldClass}
                  placeholder="name@example.com"
                  autoComplete="off"
                />
              </label>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                  Access tier
                </legend>
                <RoleTierOption
                  tier="admin"
                  selected={addDraft.roleTier === "admin"}
                  expanded={Boolean(expandedTier.admin)}
                  onSelect={() => setAddDraft({ ...addDraft, roleTier: "admin" })}
                  onToggleDetails={() =>
                    setExpandedTier((prev) => ({ ...prev, admin: !prev.admin }))
                  }
                />
                <RoleTierOption
                  tier="manager"
                  selected={addDraft.roleTier === "manager"}
                  expanded={Boolean(expandedTier.manager)}
                  onSelect={() => setAddDraft({ ...addDraft, roleTier: "manager" })}
                  onToggleDetails={() =>
                    setExpandedTier((prev) => ({ ...prev, manager: !prev.manager }))
                  }
                />
              </fieldset>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                  Temporary password
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addDraft.password}
                    onChange={(e) => setAddDraft({ ...addDraft, password: e.target.value })}
                    className={fieldClass}
                    autoComplete="new-password"
                  />
                  <GhostButton
                    type="button"
                    onClick={() =>
                      setAddDraft({ ...addDraft, password: generateTempPassword() })
                    }
                  >
                    Regenerate
                  </GhostButton>
                </div>
                <span className="text-[11px] text-[var(--pos-text-2)]">
                  Share this with them so they can sign in. Min 8 characters.
                </span>
              </label>
              {addError ? (
                <p className="text-[12px] text-red-600 dark:text-red-400" role="alert">
                  {addError}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-solid [border-color:var(--pos-divider)] px-4 py-3">
              <GhostButton type="button" onClick={closeAdd} disabled={addSaving}>
                Cancel
              </GhostButton>
              <PrimaryButton
                type="button"
                showPlus={false}
                onClick={() => void saveAdd()}
                disabled={addSaving}
              >
                {addSaving ? "Creating…" : "Create user"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}

      {resetDraft ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Dismiss"
            onClick={closeReset}
          />
          <div
            className="relative z-[1] w-full max-w-[440px] overflow-hidden rounded-[14px] border-[0.5px] border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-card)] shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
          >
            <div className="flex items-start justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
              <p
                id="reset-password-title"
                className="text-[15px] font-semibold text-[var(--pos-text-1)]"
              >
                Reset password — {resetDraft.name}
              </p>
              <button
                type="button"
                onClick={closeReset}
                className="inline-flex size-9 items-center justify-center rounded-[8px] text-[var(--pos-text-2)] hover:bg-[var(--pos-sidebar)]"
                aria-label="Close"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </div>
            <div className="flex flex-col gap-3 px-4 py-4">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                  New temporary password
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={resetDraft.password}
                    onChange={(e) =>
                      setResetDraft({ ...resetDraft, password: e.target.value })
                    }
                    className={fieldClass}
                    autoComplete="new-password"
                    autoFocus
                  />
                  <GhostButton
                    type="button"
                    onClick={() =>
                      setResetDraft({
                        ...resetDraft,
                        password: generateTempPassword(),
                      })
                    }
                  >
                    Regenerate
                  </GhostButton>
                </div>
              </label>
              {resetError ? (
                <p className="text-[12px] text-red-600 dark:text-red-400" role="alert">
                  {resetError}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-solid [border-color:var(--pos-divider)] px-4 py-3">
              <GhostButton type="button" onClick={closeReset} disabled={resetSaving}>
                Cancel
              </GhostButton>
              <PrimaryButton
                type="button"
                showPlus={false}
                onClick={() => void saveReset()}
                disabled={resetSaving}
              >
                {resetSaving ? "Saving…" : "Set password"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
