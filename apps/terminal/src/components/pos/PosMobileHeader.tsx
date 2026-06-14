import { LogOut } from "lucide-react";
import { ThemeToggle } from "../ThemeToggle";

export function PosMobileHeader({
  branchName,
  branchAddress,
  onSignOut,
}: {
  branchName: string;
  branchAddress: string | null;
  onSignOut: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-solid px-3 py-2.5 [border-color:var(--pos-divider)] lg:hidden">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[var(--pos-text-1)]">
          {branchName}
        </p>
        {branchAddress ? (
          <p className="truncate text-[11px] text-[var(--pos-text-2)]">{branchAddress}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle variant="sidebar" />
        <button
          type="button"
          onClick={onSignOut}
          className="flex size-9 items-center justify-center rounded-[6px] text-[var(--pos-text-2)] transition-colors hover:bg-red-500/15 hover:text-red-500"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="size-4" strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
