import type { LucideIcon } from "lucide-react";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

type Row = { id: string; primary: string; secondary: string; meta: string };

const DEMO_ROWS: Row[] = [
  {
    id: "1",
    primary: "Demo record A",
    secondary: "Last updated today · sample",
    meta: "Active",
  },
  {
    id: "2",
    primary: "Demo record B",
    secondary: "Synced · offline-safe",
    meta: "Draft",
  },
  {
    id: "3",
    primary: "Demo record C",
    secondary: "Assigned to outlet 1",
    meta: "Active",
  },
];

export function GenericModuleView({
  title,
  description,
  icon: Icon,
  addon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  addon?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--pos-nav-active-bg)] text-[var(--pos-nav-active-fg)] ${border0}`}
        >
          <Icon className="size-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[var(--pos-text-1)]">
              {title}
            </h1>
            {addon ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-solid border-[#5b9bd6] bg-[#c8def5] px-[10px] py-[3px] text-[11px] font-medium text-[#2f6dae]">
                <span className="size-[5px] shrink-0 rounded-full bg-[#2f6dae]" />
                Add-on
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] text-[var(--pos-text-2)]">
            {description}
          </p>
        </div>
      </div>

      <div className={`rounded-[14px] bg-[var(--pos-card)] ${border0} overflow-hidden`}>
        <div className="border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Records · demo
          </p>
        </div>
        {DEMO_ROWS.map((r) => (
          <button
            key={r.id}
            type="button"
            className="flex w-full items-center justify-between gap-4 border-b border-solid [border-color:var(--pos-border-hairline)] px-4 py-3 text-left transition-colors hover:bg-[var(--pos-sidebar)]"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[var(--pos-text-1)]">
                {r.primary}
              </p>
              <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
                {r.secondary}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-sidebar)] px-3 py-1 text-[11px] text-[var(--pos-text-2)]">
              {r.meta}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
